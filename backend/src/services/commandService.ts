import { PrismaClient } from '@prisma/client';
import { Server as SocketIOServer } from 'socket.io';
import { CommandType, CreateCommandRequest, CommandResult } from '../types/commands';

const prisma = new PrismaClient();

export class CommandService {
  constructor(private io: SocketIOServer) {}

  // Send real-time command notification to devices
  async notifyDeviceOfCommand(deviceId: string, commandId: string, command: CommandType, parameters?: any) {
    try {
      // Find device's socket connection
      const sockets = await this.io.fetchSockets();
      const deviceSocket = sockets.find(socket => socket.data.deviceId === deviceId);

      if (deviceSocket) {
        // Send command directly to connected device
        deviceSocket.emit('remoteCommand', {
          commandId,
          command,
          parameters,
          timestamp: new Date().toISOString()
        });

        // Update command status to SENT
        await prisma.remoteCommand.update({
          where: { id: commandId },
          data: { status: 'SENT' }
        });

        return true;
      } else {
        console.log(`Device ${deviceId} not connected via WebSocket`);
        // In a real implementation, you would use push notifications here
        return false;
      }
    } catch (error) {
      console.error('Error notifying device of command:', error);
      return false;
    }
  }

  // Process command queue for offline devices
  async processCommandQueue() {
    try {
      const pendingCommands = await prisma.remoteCommand.findMany({
        where: { status: 'PENDING' },
        include: { device: true },
        orderBy: { createdAt: 'asc' },
        take: 100 // Process in batches
      });

      for (const command of pendingCommands) {
        const success = await this.notifyDeviceOfCommand(
          command.device.deviceId,
          command.id,
          command.command as CommandType,
          command.parameters
        );

        if (!success) {
          // Mark as failed if device not reachable after timeout
          const commandAge = new Date().getTime() - command.createdAt.getTime();
          const timeoutMs = 5 * 60 * 1000; // 5 minutes

          if (commandAge > timeoutMs) {
            await prisma.remoteCommand.update({
              where: { id: command.id },
              data: { 
                status: 'FAILED',
                result: {
                  success: false,
                  message: 'Device unreachable - command timeout',
                  timestamp: new Date()
                } as any
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('Error processing command queue:', error);
    }
  }

  // Handle device command response
  async handleCommandResponse(deviceId: string, commandId: string, result: CommandResult) {
    try {
      const command = await prisma.remoteCommand.findUnique({
        where: { id: commandId },
        include: { device: true }
      });

      if (!command || command.device.deviceId !== deviceId) {
        throw new Error('Invalid command or device mismatch');
      }

      // Update command result
      await prisma.remoteCommand.update({
        where: { id: commandId },
        data: {
          status: result.success ? 'EXECUTED' : 'FAILED',
          result: result as any
        }
      });

      // Log event
      await prisma.deviceEvent.create({
        data: {
          deviceId: command.deviceId,
          eventType: result.success ? 'COMMAND_EXECUTED' : 'COMMAND_FAILED',
          eventData: {
            commandId,
            command: command.command,
            result
          } as any
        }
      });

      // Emit to admin dashboard for real-time updates
      this.io.emit('commandUpdate', {
        commandId,
        deviceId,
        status: result.success ? 'EXECUTED' : 'FAILED',
        result
      });

      return true;
    } catch (error) {
      console.error('Error handling command response:', error);
      return false;
    }
  }

  // Execute predefined command templates
  async executeQuickCommand(deviceIds: string[], commandTemplate: string) {
    const templates: Record<string, CreateCommandRequest> = {
      'emergency_lock': {
        deviceIds,
        command: 'LOCK_DEVICE',
        parameters: {
          lockMessage: 'Device locked by administrator',
          lockPhoneNumber: process.env.ADMIN_PHONE
        },
        priority: 'URGENT'
      },
      'locate_all': {
        deviceIds,
        command: 'LOCATE_DEVICE',
        parameters: {
          enableHighAccuracy: true
        },
        priority: 'HIGH'
      },
      'sync_policies': {
        deviceIds,
        command: 'SYNC_SETTINGS',
        parameters: {},
        priority: 'NORMAL'
      },
      'get_device_info': {
        deviceIds,
        command: 'GET_DEVICE_INFO',
        parameters: {},
        priority: 'NORMAL'
      }
    };

    const template = templates[commandTemplate];
    if (!template) {
      throw new Error(`Unknown command template: ${commandTemplate}`);
    }

    // Execute the template command
    return this.executeCommand(template);
  }

  // Main command execution method
  private async executeCommand(commandData: CreateCommandRequest) {
    // Validate devices
    const devices = await prisma.device.findMany({
      where: { 
        id: { in: commandData.deviceIds },
        status: { in: ['ENROLLED', 'ACTIVE'] }
      }
    });

    if (devices.length === 0) {
      throw new Error('No valid devices found');
    }

    // Create commands
    const commands = await Promise.all(
      devices.map(device =>
        prisma.remoteCommand.create({
          data: {
            deviceId: device.id,
            command: commandData.command,
            parameters: commandData.parameters as any,
            status: 'PENDING'
          }
        })
      )
    );

    // Notify devices
    const notifications = await Promise.all(
      commands.map(cmd => {
        const device = devices.find(d => d.id === cmd.deviceId);
        return this.notifyDeviceOfCommand(
          device!.deviceId,
          cmd.id,
          cmd.command as CommandType,
          cmd.parameters
        );
      })
    );

    return {
      commands,
      notificationsSent: notifications.filter(Boolean).length,
      totalCommands: commands.length
    };
  }
}
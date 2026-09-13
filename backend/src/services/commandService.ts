import { Server as SocketIOServer } from 'socket.io';
import { CommandType, CreateCommandRequest, CommandResult } from '../types/commands';
import prisma from '../db';


export class CommandService {
  constructor(private io: SocketIOServer) { }

  // Send real-time command notification to devices
  async notifyDeviceOfCommand(deviceId: string, commandId: string, command: CommandType, parameters?: unknown) {
    try {
      console.log(`[COMMAND] notifyDeviceOfCommand called for deviceId: ${deviceId}, commandId: ${commandId}, command: ${command}`);

      // Find device's socket connection
      const sockets = await this.io.fetchSockets();
      console.log(`[COMMAND] Total connected sockets: ${sockets.length}`);

      // Log all device sockets for debugging
      const deviceSockets = sockets.filter(s => s.data.deviceId);
      console.log(`[COMMAND] Device sockets found: ${deviceSockets.map(s => s.data.deviceId).join(', ')}`);

      const deviceSocket = sockets.find(socket => socket.data.deviceId === deviceId);

      if (deviceSocket) {
        console.log(`[COMMAND] ✓ Found socket for device ${deviceId}, emitting executeCommand`);

        // Send command directly to connected device.
        // Shape: { commandId, commandType, payload } — matches Android handleServerCommand()
        deviceSocket.emit('executeCommand', {
          commandId,
          commandType: command,  // normalized field name used on Android
          payload: parameters ?? {},
          timestamp: new Date().toISOString()
        });

        console.log(`[COMMAND] ✓ Emitted executeCommand event for deviceId: ${deviceId}`);

        // Update command status to SENT
        await prisma.remoteCommand.update({
          where: { id: commandId },
          data: { status: 'SENT' }
        });

        return true;
      } else {
        console.log(`[COMMAND] ✗ Device ${deviceId} not found in connected sockets`);
        console.log(`[COMMAND] Searching for device by name in database...`);

        // Try to find device in database to get more info
        const device = await prisma.device.findUnique({
          where: { deviceId },
          select: { id: true, deviceId: true, status: true }
        });

        if (device) {
          console.log(`[COMMAND] Device found in DB - ID: ${device.id}, deviceId: ${device.deviceId}, status: ${device.status}`);
        } else {
          console.log(`[COMMAND] Device not found in database either. Checking if ID is a cuid...`);
          const deviceByDbId = await prisma.device.findUnique({
            where: { id: deviceId },
            select: { id: true, deviceId: true, status: true }
          });
          if (deviceByDbId) {
            console.log(`[COMMAND] Found by database ID - deviceId: ${deviceByDbId.deviceId}, status: ${deviceByDbId.status}`);
          }
        }

        // In a real implementation, you would use push notifications here
        return false;
      }
    } catch (error) {
      console.error('[COMMAND] Error notifying device of command:', error);
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

      // Emit to admin dashboard only — not all sockets (Fix 1.4)
      this.io.to('admins').emit('commandUpdate', {
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
          ...(process.env.ADMIN_PHONE ? { lockPhoneNumber: process.env.ADMIN_PHONE } : {})
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
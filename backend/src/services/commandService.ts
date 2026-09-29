import { Server as SocketIOServer } from 'socket.io';
import { CommandType, CreateCommandRequest, CommandResult } from '../types/commands';
import prisma from '../db';
import config from '../config/env';
import logger from '../logger';
import { deviceRoom } from '../socket/registry';


export class CommandService {
  constructor(private io: SocketIOServer) { }

  /**
   * Push a command to a connected device.
   *
   * Emits to the device's own room. This used to call `io.fetchSockets()` and search
   * every connected socket in the process for each command — O(fleet) per command, and
   * the queue processor did it for up to 100 commands every 30 seconds.
   *
   * @returns false when the device has no open socket; the command stays PENDING for the
   *          agent's next HTTP poll.
   */
  async notifyDeviceOfCommand(deviceId: string, commandId: string, command: CommandType, parameters?: unknown) {
    try {
      const room = deviceRoom(deviceId);
      const sockets = await this.io.in(room).fetchSockets();
      if (sockets.length === 0) {
        logger.debug({ deviceId, commandId }, 'Device not connected; command left for polling');
        return false;
      }

      // Shape: { commandId, commandType, payload } — matches Android CommandExecutor.handle()
      this.io.to(room).emit('executeCommand', {
        commandId,
        commandType: command,
        payload: parameters ?? {},
        timestamp: new Date().toISOString()
      });

      await prisma.remoteCommand.update({
        where: { id: commandId },
        data: { status: 'SENT' }
      });

      logger.info({ deviceId, commandId, command }, 'Command pushed to device');
      return true;
    } catch (error) {
      logger.error(error, 'Error notifying device of command');
      return false;
    }
  }

  /**
   * Hand a polling device its queued commands, marking them SENT.
   *
   * The HTTP counterpart of `notifyDeviceOfCommand`, used by the agent's periodic poll
   * and FCM wake when it has no socket — which, for a tablet in the field, is most of
   * the time.
   */
  async takePendingCommands(deviceId: string, limit = 50) {
    const commands = await prisma.remoteCommand.findMany({
      where: { device: { deviceId }, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit
    });

    if (commands.length > 0) {
      await prisma.remoteCommand.updateMany({
        where: { id: { in: commands.map((c) => c.id) }, status: 'PENDING' },
        data: { status: 'SENT' }
      });
    }

    return commands;
  }

  /**
   * Retry queued commands for connected devices, and fail those past their TTL.
   *
   * Only devices currently ACTIVE are retried. Previously the oldest 100 PENDING
   * commands were retried regardless, so once commands for offline tablets filled that
   * window, commands for connected tablets behind them were never retried at all.
   */
  async processCommandQueue() {
    try {
      const expiredBefore = new Date(Date.now() - config.commandTtlSeconds * 1000);
      const expired = await prisma.remoteCommand.updateMany({
        where: { status: 'PENDING', createdAt: { lt: expiredBefore } },
        data: {
          status: 'FAILED',
          result: {
            success: false,
            message: 'Device did not collect the command before it expired',
            expiredAt: new Date().toISOString()
          }
        }
      });
      if (expired.count > 0) {
        logger.info({ count: expired.count }, 'Expired undelivered commands');
      }

      const pendingCommands = await prisma.remoteCommand.findMany({
        where: { status: 'PENDING', device: { status: 'ACTIVE' } },
        include: { device: { select: { deviceId: true } } },
        orderBy: { createdAt: 'asc' },
        take: 100 // Process in batches
      });

      for (const command of pendingCommands) {
        await this.notifyDeviceOfCommand(
          command.device.deviceId,
          command.id,
          command.command as CommandType,
          command.parameters
        );
      }
    } catch (error) {
      logger.error(error, 'Error processing command queue');
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
      logger.warn({ deviceId, commandId, err: error }, 'Command response rejected');
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
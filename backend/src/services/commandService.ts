import { Server as SocketIOServer } from 'socket.io';
import { CommandType, CreateCommandRequest, CommandResult } from '../types/commands';
import prisma from '../db';
import config from '../config/env';
import logger from '../logger';
import { deviceRoom } from '../socket/registry';
import { isAgentCommand } from '@mdm/shared-types';
import { Prisma, RemoteCommand } from '@prisma/client';
import { isRevoked } from './devicePresence';
import { recordDeviceOutcome } from './provisioningOutcome';

/** The command is not one the agent implements, so queueing it could only fail. */
export class UnsupportedCommandError extends Error {
  readonly statusCode = 422;
  readonly code = 'COMMAND_NOT_SUPPORTED';
  constructor(readonly command: string) {
    super(`The device agent does not implement ${command}`);
    this.name = 'UnsupportedCommandError';
  }
}

/** The request cannot be queued as given: bad parameters, or no eligible device. */
export class CommandRequestError extends Error {
  readonly statusCode = 400;
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'CommandRequestError';
  }
}

/**
 * Map a command-creation failure onto an HTTP response. Returns false for errors the
 * caller should treat as unexpected.
 */
export function sendCommandError(res: { status(code: number): { json(body: unknown): unknown } }, error: unknown): boolean {
  if (error instanceof UnsupportedCommandError || error instanceof CommandRequestError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return true;
  }
  return false;
}

export interface CreateCommandsInput {
  /** Device database ids or device serials; both are accepted. */
  deviceIds: string[];
  command: string;
  parameters?: unknown;
  /** Push to connected devices now. False leaves them for the queue and the agent poll. */
  dispatch?: boolean;
}

export interface CreateCommandsResult {
  commands: RemoteCommand[];
  devicesRequested: number;
  devicesFound: number;
  /** Suspended, wiped or retired devices, which are never sent commands. */
  devicesSkipped: string[];
  notificationsSent: number;
  /** When a command still PENDING stops waiting for its device and is marked FAILED. */
  expiresAt: Date;
}

/** Parameter rules for the commands that need them. */
function validateCommandParameters(command: string, parameters: any): string | null {
  switch (command) {
    case 'APPLY_POLICY':
    case 'REMOVE_POLICY':
    case 'UPDATE_POLICY':
      if (!parameters?.policyId) return 'Policy commands require policyId';
      break;
    case 'SET_KIOSK_MODE':
      if (!parameters?.allowedApps?.length) return 'Kiosk mode requires at least one allowed app';
      break;
  }
  return null;
}

export class CommandService {
  constructor(private io: SocketIOServer) { }

  /**
   * The one way a command is created.
   *
   * RemoteCommand rows used to be created in ten places — the command, device, security
   * and policy controllers and the provisioning service — each with its own rules. Some
   * pushed immediately and some waited for the queue; some skipped suspended devices and
   * some did not; some logged an event. And nothing checked that the agent implemented
   * the command at all. Every caller now goes through here.
   *
   * @throws UnsupportedCommandError when the agent does not implement the command.
   * @throws CommandRequestError when parameters are invalid or no device is eligible.
   */
  async createCommands(input: CreateCommandsInput): Promise<CreateCommandsResult> {
    const { deviceIds, command, parameters, dispatch = true } = input;

    if (!isAgentCommand(command)) throw new UnsupportedCommandError(command);

    const invalid = validateCommandParameters(command, parameters);
    if (invalid) throw new CommandRequestError(invalid, 'INVALID_PARAMETERS');

    const devices = await prisma.device.findMany({
      where: { OR: [{ id: { in: deviceIds } }, { deviceId: { in: deviceIds } }] },
      select: { id: true, deviceId: true, status: true, isRetired: true }
    });

    const eligible = devices.filter((d) => !isRevoked(d));
    const devicesSkipped = devices.filter((d) => isRevoked(d)).map((d) => d.deviceId);

    if (eligible.length === 0) {
      throw new CommandRequestError('No eligible devices found for this command', 'NO_ELIGIBLE_DEVICES');
    }

    const params = (parameters ?? {}) as Prisma.InputJsonValue;
    const commands = await prisma.remoteCommand.createManyAndReturn({
      data: eligible.map((d) => ({ deviceId: d.id, command, parameters: params, status: 'PENDING' as const }))
    });

    await prisma.deviceEvent.createMany({
      data: commands.map((c) => ({
        deviceId: c.deviceId,
        eventType: 'COMMAND_CREATED',
        eventData: { commandId: c.id, command: c.command, parameters: params }
      }))
    });

    let delivered: boolean[] = commands.map(() => false);
    if (dispatch) {
      const serialById = new Map(eligible.map((d) => [d.id, d.deviceId]));
      delivered = await Promise.all(
        commands.map((c) =>
          this.notifyDeviceOfCommand(serialById.get(c.deviceId)!, c.id, command, c.parameters)
        )
      );
    }

    // The rows above were read back before dispatch, so they all say PENDING. Report the
    // status each command actually has, so the dashboard can say "sent" or "queued".
    const createdAt = commands[0]?.createdAt ?? new Date();
    return {
      commands: commands.map((c, i) => (delivered[i] ? { ...c, status: 'SENT' as const } : c)),
      expiresAt: new Date(createdAt.getTime() + config.commandTtlSeconds * 1000),
      devicesRequested: deviceIds.length,
      devicesFound: devices.length,
      devicesSkipped,
      notificationsSent: delivered.filter(Boolean).length
    };
  }

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

      // A field configuration's session is settled by the command's own result, which
      // reaches us over HTTP as well as the socket — so it works for offline tablets.
      const sessionId = (command.parameters as { sessionId?: unknown } | null)?.sessionId;
      if (command.command === 'APPLY_FIELD_CONFIGURATION' && typeof sessionId === 'string') {
        const data = result.data as { applied?: number; total?: number } | undefined;
        await recordDeviceOutcome(sessionId, command.deviceId, {
          status: result.success ? 'COMPLETED' : 'FAILED',
          currentStep: result.success ? 'Field configuration applied' : 'Field configuration not fully applied',
          ...(typeof data?.applied === 'number' ? { completedSteps: data.applied } : {}),
          ...(typeof data?.total === 'number' ? { totalSteps: data.total } : {}),
          errorMessage: result.success ? null : result.message ?? 'Device reported failure',
          log: {
            level: result.success ? 'INFO' : 'WARN',
            message: result.success ? 'All settings applied' : result.message ?? 'Not all settings applied',
            details: result.data
          }
        });
      }

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

    const result = await this.createCommands(template);
    return {
      commands: result.commands,
      notificationsSent: result.notificationsSent,
      totalCommands: result.commands.length
    };
  }
}

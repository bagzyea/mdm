import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CreateCommandRequest, CommandResult, CommandType } from '../types/commands';

const prisma = new PrismaClient();

// Get all commands with filtering and pagination
export const getAllCommands = async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      deviceId, 
      command, 
      status,
      startDate,
      endDate 
    } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);
    
    const where: any = {};
    if (deviceId) where.deviceId = deviceId;
    if (command) where.command = command;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [commands, total] = await Promise.all([
      prisma.remoteCommand.findMany({
        where,
        skip: offset,
        take: Number(limit),
        include: {
          device: {
            select: {
              id: true,
              deviceId: true,
              manufacturer: true,
              model: true,
              status: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.remoteCommand.count({ where })
    ]);

    res.json({
      commands,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching commands:', error);
    res.status(500).json({ error: 'Failed to fetch commands' });
  }
};

// Get specific command by ID
export const getCommandById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const command = await prisma.remoteCommand.findUnique({
      where: { id },
      include: {
        device: {
          include: {
            events: {
              where: {
                eventType: {
                  in: ['COMMAND_SENT', 'COMMAND_EXECUTED', 'COMMAND_FAILED']
                }
              },
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        }
      }
    });

    if (!command) {
      return res.status(404).json({ error: 'Command not found' });
    }

    res.json(command);
  } catch (error) {
    console.error('Error fetching command:', error);
    res.status(500).json({ error: 'Failed to fetch command' });
  }
};

// Create and send new command(s)
export const createCommand = async (req: Request, res: Response) => {
  try {
    const commandData: CreateCommandRequest = req.body;
    
    // Validate devices exist
    const devices = await prisma.device.findMany({
      where: { 
        id: { in: commandData.deviceIds },
        status: { in: ['ENROLLED', 'ACTIVE'] } // Only send to active devices
      }
    });

    if (devices.length === 0) {
      return res.status(400).json({ error: 'No valid devices found for command execution' });
    }

    if (devices.length !== commandData.deviceIds.length) {
      const foundIds = devices.map(d => d.id);
      const missingIds = commandData.deviceIds.filter(id => !foundIds.includes(id));
      console.warn(`Some devices not found or inactive: ${missingIds.join(', ')}`);
    }

    // Validate command parameters
    const validationError = validateCommandParameters(commandData.command, commandData.parameters);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Create commands for each device
    const commandPromises = devices.map(device => 
      prisma.remoteCommand.create({
        data: {
          deviceId: device.id,
          command: commandData.command,
          parameters: commandData.parameters as any,
          status: commandData.executeAt ? 'PENDING' : 'PENDING'
        }
      })
    );

    const createdCommands = await Promise.all(commandPromises);

    // Log command creation events
    const eventPromises = createdCommands.map(cmd =>
      prisma.deviceEvent.create({
        data: {
          deviceId: cmd.deviceId,
          eventType: 'COMMAND_CREATED',
          eventData: {
            commandId: cmd.id,
            command: cmd.command,
            parameters: cmd.parameters
          } as any
        }
      })
    );

    await Promise.all(eventPromises);

    // If not scheduled, immediately queue for execution
    if (!commandData.executeAt) {
      await queueCommandsForExecution(createdCommands.map(c => c.id));
    }

    res.status(201).json({
      message: `Command sent to ${createdCommands.length} devices`,
      commands: createdCommands,
      devicesFound: devices.length,
      devicesRequested: commandData.deviceIds.length
    });
  } catch (error) {
    console.error('Error creating command:', error);
    res.status(500).json({ error: 'Failed to create command' });
  }
};

// Update command result (called by device)
export const updateCommandResult = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { result, status } = req.body;

    const command = await prisma.remoteCommand.findUnique({
      where: { id },
      include: { device: true }
    });

    if (!command) {
      return res.status(404).json({ error: 'Command not found' });
    }

    // Update command with result
    const updatedCommand = await prisma.remoteCommand.update({
      where: { id },
      data: {
        status: status || (result?.success ? 'EXECUTED' : 'FAILED'),
        result: result as any
      }
    });

    // Log command completion event
    await prisma.deviceEvent.create({
      data: {
        deviceId: command.deviceId,
        eventType: result?.success ? 'COMMAND_EXECUTED' : 'COMMAND_FAILED',
        eventData: {
          commandId: id,
          command: command.command,
          result: result
        } as any
      }
    });

    // Handle specific command results
    await handleCommandResult(command, result);

    res.json(updatedCommand);
  } catch (error) {
    console.error('Error updating command result:', error);
    res.status(500).json({ error: 'Failed to update command result' });
  }
};

// Cancel pending command
export const cancelCommand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const command = await prisma.remoteCommand.findUnique({
      where: { id }
    });

    if (!command) {
      return res.status(404).json({ error: 'Command not found' });
    }

    if (command.status !== 'PENDING') {
      return res.status(400).json({ error: 'Can only cancel pending commands' });
    }

    const cancelledCommand = await prisma.remoteCommand.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    // Log cancellation event
    await prisma.deviceEvent.create({
      data: {
        deviceId: command.deviceId,
        eventType: 'COMMAND_CANCELLED',
        eventData: {
          commandId: id,
          command: command.command
        } as any
      }
    });

    res.json(cancelledCommand);
  } catch (error) {
    console.error('Error cancelling command:', error);
    res.status(500).json({ error: 'Failed to cancel command' });
  }
};

// Get command statistics
export const getCommandStatistics = async (req: Request, res: Response) => {
  try {
    const { deviceId, days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    const where: any = { createdAt: { gte: since } };
    if (deviceId) where.deviceId = deviceId;

    const [total, byStatus, byCommand, recentActivity] = await Promise.all([
      prisma.remoteCommand.count({ where }),
      prisma.remoteCommand.groupBy({
        by: ['status'],
        where,
        _count: true
      }),
      prisma.remoteCommand.groupBy({
        by: ['command'],
        where,
        _count: true,
        orderBy: { _count: { command: 'desc' } }
      }),
      prisma.remoteCommand.findMany({
        where,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          device: {
            select: {
              deviceId: true,
              manufacturer: true,
              model: true
            }
          }
        }
      })
    ]);

    const successRate = byStatus.find(s => s.status === 'EXECUTED')?._count || 0;
    const failureRate = byStatus.find(s => s.status === 'FAILED')?._count || 0;
    const totalExecuted = successRate + failureRate;

    res.json({
      summary: {
        total,
        successRate: totalExecuted > 0 ? (successRate / totalExecuted) * 100 : 0,
        avgExecutionTime: null // Could calculate from timestamps
      },
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      byCommand: byCommand.map(c => ({ command: c.command, count: c._count })),
      recentActivity
    });
  } catch (error) {
    console.error('Error fetching command statistics:', error);
    res.status(500).json({ error: 'Failed to fetch command statistics' });
  }
};

// Bulk command operations
export const bulkCommandOperation = async (req: Request, res: Response) => {
  try {
    const { operation, commandIds } = req.body;

    if (!Array.isArray(commandIds) || commandIds.length === 0) {
      return res.status(400).json({ error: 'Command IDs must be a non-empty array' });
    }

    let updateData: any;
    switch (operation) {
      case 'cancel':
        updateData = { status: 'CANCELLED' };
        break;
      case 'retry':
        updateData = { status: 'PENDING' };
        break;
      default:
        return res.status(400).json({ error: 'Invalid operation' });
    }

    const result = await prisma.remoteCommand.updateMany({
      where: { 
        id: { in: commandIds },
        status: operation === 'cancel' ? 'PENDING' : 'FAILED'
      },
      data: updateData
    });

    res.json({
      message: `${operation} operation completed`,
      affected: result.count
    });
  } catch (error) {
    console.error('Error performing bulk command operation:', error);
    res.status(500).json({ error: 'Failed to perform bulk operation' });
  }
};

// Helper functions
function validateCommandParameters(command: CommandType, parameters?: any): string | null {
  switch (command) {
    case 'INSTALL_APP':
      if (!parameters?.packageName && !parameters?.appUrl) {
        return 'App installation requires either packageName or appUrl';
      }
      break;
    case 'UNINSTALL_APP':
      if (!parameters?.packageName) {
        return 'App uninstallation requires packageName';
      }
      break;
    case 'APPLY_POLICY':
    case 'REMOVE_POLICY':
    case 'UPDATE_POLICY':
      if (!parameters?.policyId) {
        return 'Policy commands require policyId';
      }
      break;
    case 'SET_WIFI_CONFIG':
      if (!parameters?.ssid) {
        return 'WiFi configuration requires SSID';
      }
      break;
    case 'SET_KIOSK_MODE':
      if (!parameters?.allowedApps?.length) {
        return 'Kiosk mode requires at least one allowed app';
      }
      break;
  }
  return null;
}

async function queueCommandsForExecution(commandIds: string[]) {
  // Update commands to SENT status
  await prisma.remoteCommand.updateMany({
    where: { id: { in: commandIds } },
    data: { status: 'SENT' }
  });

  // In a real implementation, this would notify devices via WebSocket
  // or push notification that they have pending commands
  console.log(`Queued ${commandIds.length} commands for execution`);
}

async function handleCommandResult(command: any, result: CommandResult) {
  // Handle specific command results
  switch (command.command) {
    case 'GET_DEVICE_INFO':
      if (result.success && result.deviceInfo) {
        // Update device information in database
        await prisma.device.update({
          where: { id: command.deviceId },
          data: {
            lastSeen: new Date()
            // Could update other device info here
          }
        });
      }
      break;
    case 'LOCATE_DEVICE':
      if (result.success && result.deviceInfo?.location) {
        await prisma.device.update({
          where: { id: command.deviceId },
          data: {
            location: result.deviceInfo.location as any
          }
        });
      }
      break;
  }
}
import { Request, Response } from 'express';
import { CreateCommandRequest, CommandResult } from '../types/commands';
import { getCommandService } from '../services/commandServiceInstance';
import { sendCommandError } from '../services/commandService';
import logger from '../logger';
import prisma from '../db';


// Get all commands with filtering and pagination
export const getAllCommands = async (req: Request, res: Response): Promise<void> => {
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

export const getCommandById = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    
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
      res.status(404).json({ error: 'Command not found' });
      return;
    }

    res.json(command);
  } catch (error) {
    console.error('Error fetching command:', error);
    res.status(500).json({ error: 'Failed to fetch command' });
  }
};

// Create and send new command(s)
export const createCommand = async (req: Request, res: Response): Promise<void> => {
  try {
    const commandData: CreateCommandRequest = req.body;

    // executeAt is accepted but not yet honoured: there is no column to hold it, so a
    // scheduled command is only held back from the immediate push and goes out on the
    // next queue pass. Scheduling proper is tracked separately.
    const result = await getCommandService().createCommands({
      deviceIds: commandData.deviceIds,
      command: commandData.command,
      parameters: commandData.parameters,
      dispatch: !commandData.executeAt
    });

    res.status(201).json({
      message: `Command sent to ${result.commands.length} devices`,
      commands: result.commands,
      devicesFound: result.devicesFound,
      devicesRequested: result.devicesRequested,
      devicesSkipped: result.devicesSkipped,
      notificationsSent: result.notificationsSent,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    if (sendCommandError(res, error)) return;
    logger.error(error, 'Error creating command');
    res.status(500).json({ error: 'Failed to create command' });
  }
};

// Update command result (called by device)
export const updateCommandResult = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { result, status } = req.body;

    const command = await prisma.remoteCommand.findUnique({
      where: { id },
      include: { device: true }
    });

    if (!command) {
      res.status(404).json({ error: 'Command not found' });
      return;
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
export const cancelCommand = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    
    const command = await prisma.remoteCommand.findUnique({
      where: { id }
    });

    if (!command) {
      res.status(404).json({ error: 'Command not found' });
      return;
    }

    if (command.status !== 'PENDING') {
      res.status(400).json({ error: 'Can only cancel pending commands' });
      return;
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
export const getCommandStatistics = async (req: Request, res: Response): Promise<void> => {
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
export const bulkCommandOperation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { operation, commandIds } = req.body;

    if (!Array.isArray(commandIds) || commandIds.length === 0) {
      res.status(400).json({ error: 'Command IDs must be a non-empty array' });
      return;
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
        res.status(400).json({ error: 'Invalid operation' });
        return;
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
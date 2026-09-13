import { Request, Response } from 'express';
import { 
  CreateProvisioningSessionRequest,
  StartProvisioningRequest,
  ProvisioningStatusUpdate
} from '../types';
import { provisioningService } from '../services/provisioningService';
import { definedOnly } from '../utils/prisma';
import prisma from '../db';


export const getAllProvisioningSessions = async (req: Request, res: Response) => {
  try {
    const { 
      status, 
      profileId, 
      createdBy,
      page = '1', 
      limit = '10' 
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const where: any = {};
    
    if (status) where.status = status;
    if (profileId) where.profileId = profileId;
    if (createdBy) where.createdBy = createdBy;

    const [sessions, total] = await Promise.all([
      prisma.provisioningSession.findMany({
        where,
        include: {
          profile: {
            select: {
              id: true,
              name: true,
              deviceModels: true,
              _count: {
                select: {
                  applications: true,
                  filePackages: true
                }
              }
            }
          },
          progress: {
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
            }
          },
          _count: {
            select: {
              progress: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limitNum
      }),
      prisma.provisioningSession.count({ where })
    ]);

    res.json({
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching provisioning sessions:', error);
    res.status(500).json({ error: 'Failed to fetch provisioning sessions' });
  }
};

export const getProvisioningSession = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    
    const session = await prisma.provisioningSession.findUnique({
      where: { id },
      include: {
        profile: {
          include: {
            applications: {
              orderBy: { installOrder: 'asc' }
            },
            filePackages: true
          }
        },
        progress: {
          include: {
            device: {
              select: {
                id: true,
                deviceId: true,
                manufacturer: true,
                model: true,
                deviceModel: true,
                status: true,
                lastSeen: true
              }
            }
          },
          orderBy: { startedAt: 'desc' }
        }
      }
    });

    if (!session) {
      res.status(404).json({ error: 'Provisioning session not found' });
      return;
    }

    // Calculate session statistics
    const stats = {
      totalDevices: session.totalDevices,
      completedDevices: session.completedDevices,
      failedDevices: session.failedDevices,
      pendingDevices: session.totalDevices - session.completedDevices - session.failedDevices,
      successRate: session.totalDevices > 0 ? 
        ((session.completedDevices / session.totalDevices) * 100).toFixed(1) : '0',
      averageTimePerDevice: calculateAverageProvisioningTime(session.progress)
    };

    res.json({
      ...session,
      stats
    });
  } catch (error) {
    console.error('Error fetching provisioning session:', error);
    res.status(500).json({ error: 'Failed to fetch provisioning session' });
  }
};

export const createProvisioningSession = async (req: Request, res: Response) => {
  try {
    const data: CreateProvisioningSessionRequest = req.body;
    const userId = req.user?.userId;

    // Validate the profile exists and is active
    const profile = await prisma.provisioningProfile.findUnique({
      where: { id: data.profileId },
      include: {
        applications: true,
        filePackages: true
      }
    });

    if (!profile) {
      res.status(404).json({ error: 'Provisioning profile not found' });
      return;
    }

    if (!profile.isActive) {
      res.status(400).json({ error: 'Cannot create session for inactive profile' });
      return;
    }

    // Validate devices exist and are compatible
    const devices = await prisma.device.findMany({
      where: {
        id: { in: data.deviceIds },
        status: { in: ['ENROLLED', 'ACTIVE'] }
      }
    });

    if (devices.length !== data.deviceIds.length) {
      const foundIds = devices.map(d => d.id);
      const missingIds = data.deviceIds.filter(id => !foundIds.includes(id));
      res.status(400).json({
        error: 'Some devices not found or not eligible',
        details: { missingDevices: missingIds }
      });
      return;
    }

    // Check device compatibility
    const incompatibleDevices = devices.filter(device => {
      return !profile.deviceModels.some(supportedModel => 
        device.model.toLowerCase().includes(supportedModel.toLowerCase()) ||
        device.deviceModel?.toLowerCase().includes(supportedModel.toLowerCase())
      );
    });

    if (incompatibleDevices.length > 0) {
      res.status(400).json({
        error: 'Some devices are not compatible with this profile',
        details: {
          incompatibleDevices: incompatibleDevices.map(d => ({
            id: d.id,
            deviceId: d.deviceId,
            model: d.model,
            deviceModel: d.deviceModel
          }))
        }
      });
      return;
    }

    // Create the session
    const session = await prisma.provisioningSession.create({
      data: {
        profileId: data.profileId,
        name: data.name,
        // Omitted rather than set to undefined: exactOptionalPropertyTypes treats an
        // explicitly-undefined optional property as different from an absent one.
        ...(data.description !== undefined ? { description: data.description } : {}),
        deviceIds: data.deviceIds,
        totalDevices: data.deviceIds.length,
        createdBy: userId!,
        progress: {
          create: data.deviceIds.map(deviceId => ({
            deviceId,
            status: 'PENDING',
            totalSteps: calculateTotalSteps(profile),
            completedSteps: 0
          }))
        }
      },
      include: {
        profile: {
          select: {
            id: true,
            name: true,
            deviceModels: true
          }
        },
        progress: {
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
          }
        }
      }
    });

    res.status(201).json(session);
  } catch (error) {
    console.error('Error creating provisioning session:', error);
    res.status(500).json({ error: 'Failed to create provisioning session' });
  }
};

export const startProvisioningSession = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const options: StartProvisioningRequest['options'] = req.body.options || {};

    const session = await prisma.provisioningSession.findUnique({
      where: { id },
      include: {
        profile: {
          include: {
            applications: true,
            filePackages: true
          }
        },
        progress: {
          include: {
            device: true
          }
        }
      }
    });

    if (!session) {
      res.status(404).json({ error: 'Provisioning session not found' });
      return;
    }

    if (session.status !== 'PENDING' && session.status !== 'PAUSED') {
      res.status(409).json({ 
        error: 'Session cannot be started',
        details: `Current status: ${session.status}` 
      });
      return;
    }

    // Update session status
    await prisma.provisioningSession.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date()
      }
    });

    // Start the provisioning process
    provisioningService.startProvisioning(session, options)
      .catch((error: unknown) => {
        console.error('Error in provisioning process:', error);
        // Update session status to failed
        prisma.provisioningSession.update({
          where: { id },
          data: { status: 'FAILED' }
        }).catch(console.error);
      });

    res.json({ 
      message: 'Provisioning session started successfully',
      sessionId: id,
      status: 'IN_PROGRESS'
    });
  } catch (error) {
    console.error('Error starting provisioning session:', error);
    res.status(500).json({ error: 'Failed to start provisioning session' });
  }
};

export const pauseProvisioningSession = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;

    const session = await prisma.provisioningSession.findUnique({
      where: { id }
    });

    if (!session) {
      res.status(404).json({ error: 'Provisioning session not found' });
      return;
    }

    if (session.status !== 'IN_PROGRESS') {
      res.status(409).json({ 
        error: 'Session cannot be paused',
        details: `Current status: ${session.status}` 
      });
      return;
    }

    await prisma.provisioningSession.update({
      where: { id },
      data: { status: 'PAUSED' }
    });

    // Signal the provisioning service to pause
    await provisioningService.pauseProvisioning(id);

    res.json({ 
      message: 'Provisioning session paused successfully',
      sessionId: id,
      status: 'PAUSED'
    });
  } catch (error) {
    console.error('Error pausing provisioning session:', error);
    res.status(500).json({ error: 'Failed to pause provisioning session' });
  }
};

export const cancelProvisioningSession = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;

    const session = await prisma.provisioningSession.findUnique({
      where: { id }
    });

    if (!session) {
      res.status(404).json({ error: 'Provisioning session not found' });
      return;
    }

    if (!['PENDING', 'IN_PROGRESS', 'PAUSED'].includes(session.status)) {
      res.status(409).json({ 
        error: 'Session cannot be cancelled',
        details: `Current status: ${session.status}` 
      });
      return;
    }

    await prisma.provisioningSession.update({
      where: { id },
      data: { 
        status: 'CANCELLED',
        completedAt: new Date()
      }
    });

    // Cancel all pending progress items
    await prisma.provisioningProgress.updateMany({
      where: {
        sessionId: id,
        status: { in: ['PENDING', 'DOWNLOADING_APPS', 'INSTALLING_APPS', 'CONFIGURING_NETWORK', 'CONFIGURING_SECURITY', 'DEPLOYING_FILES', 'VALIDATING'] }
      },
      data: { status: 'CANCELLED' }
    });

    // Signal the provisioning service to cancel
    await provisioningService.cancelProvisioning(id);

    res.json({ 
      message: 'Provisioning session cancelled successfully',
      sessionId: id,
      status: 'CANCELLED'
    });
  } catch (error) {
    console.error('Error cancelling provisioning session:', error);
    res.status(500).json({ error: 'Failed to cancel provisioning session' });
  }
};

export const updateProvisioningProgress = async (req: Request<{ deviceId: string; sessionId: string }>, res: Response) => {
  try {
    const { sessionId, deviceId } = req.params;
    const update: ProvisioningStatusUpdate = req.body;

    const progress = await prisma.provisioningProgress.findUnique({
      where: {
        sessionId_deviceId: {
          sessionId,
          deviceId
        }
      }
    });

    if (!progress) {
      res.status(404).json({ error: 'Provisioning progress not found' });
      return;
    }

    const updateData: any = {
      status: update.status
    };

    if (update.currentStep) updateData.currentStep = update.currentStep;
    if (update.completedSteps !== undefined) updateData.completedSteps = update.completedSteps;
    if (update.totalSteps !== undefined) updateData.totalSteps = update.totalSteps;
    if (update.errorMessage) updateData.errorMessage = update.errorMessage;
    if (update.errorCode) updateData.errorCode = update.errorCode;
    
    if (update.logs) {
      const existingLogs = (progress.logs as any) || [];
      updateData.logs = [...existingLogs, ...update.logs];
    }

    // Set timestamps based on status
    if (update.status !== 'PENDING' && !progress.startedAt) {
      updateData.startedAt = new Date();
    }
    
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(update.status)) {
      updateData.completedAt = new Date();
    }

    const updatedProgress = await prisma.provisioningProgress.update({
      where: {
        sessionId_deviceId: {
          sessionId,
          deviceId
        }
      },
      data: updateData
    });

    // Update device provisioning status
    await prisma.device.update({
      where: { id: deviceId },
      data: definedOnly({
        provisioningStatus: update.status,
        lastProvisionedAt: ['COMPLETED'].includes(update.status) ? new Date() : undefined
      })
    });

    // Update session counters
    await updateSessionCounters(sessionId);

    res.json(updatedProgress);
  } catch (error) {
    console.error('Error updating provisioning progress:', error);
    res.status(500).json({ error: 'Failed to update provisioning progress' });
  }
};

// Device-initiated progress report (HTTP fallback for WebSocket)
export const reportDeviceProvisioningProgress = async (req: Request<{ sessionId: string }>, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { deviceId, commandId, step, subStep, completedSteps, totalSteps, error } = req.body;

    // Find device by deviceId string to get DB id (cuid)
    const device = await prisma.device.findUnique({
      where: { deviceId },
      select: { id: true }
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Update ProvisioningProgress record
    const progress = await prisma.provisioningProgress.findUnique({
      where: {
        sessionId_deviceId: {
          sessionId,
          deviceId: device.id
        }
      }
    });

    if (!progress) {
      res.status(404).json({ error: 'Provisioning session for this device not found' });
      return;
    }

    const updateData: any = {
      status: (step as any) || 'PENDING',
      currentStep: subStep,
      completedSteps: completedSteps ?? 0,
      totalSteps: totalSteps ?? 0,
      errorMessage: error || null
    };

    // Add log entry
    const existingLogs = (progress.logs as any) || [];
    updateData.logs = [
      ...existingLogs,
      {
        timestamp: new Date(),
        level: error ? 'ERROR' : 'INFO',
        message: subStep,
        details: { step, completedSteps, totalSteps }
      }
    ];

    // Set timestamps
    if (step !== 'PENDING' && !progress.startedAt) {
      updateData.startedAt = new Date();
    }

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(step)) {
      updateData.completedAt = new Date();
    }

    const updatedProgress = await prisma.provisioningProgress.update({
      where: {
        sessionId_deviceId: {
          sessionId,
          deviceId: device.id
        }
      },
      data: updateData
    });

    // Update device provisioning status
    await prisma.device.update({
      where: { id: device.id },
      data: definedOnly({
        provisioningStatus: (step as any) || 'PENDING',
        lastProvisionedAt: step === 'COMPLETED' ? new Date() : undefined
      })
    });

    // Update session counters if completed or failed
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(step)) {
      await updateSessionCounters(sessionId);
    }

    res.json(updatedProgress);
  } catch (error) {
    console.error('Error reporting device provisioning progress:', error);
    res.status(500).json({ error: 'Failed to report provisioning progress' });
  }
};

export const getSessionStatistics = async (req: Request, res: Response) => {
  try {
    const { timeRange = '30' } = req.query;
    const days = parseInt(timeRange as string);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sessions = await prisma.provisioningSession.findMany({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      include: {
        _count: {
          select: { progress: true }
        }
      }
    });

    const stats = {
      totalSessions: sessions.length,
      completedSessions: sessions.filter(s => s.status === 'COMPLETED').length,
      failedSessions: sessions.filter(s => s.status === 'FAILED').length,
      inProgressSessions: sessions.filter(s => s.status === 'IN_PROGRESS').length,
      totalDevicesProvisioned: sessions.reduce((sum, s) => sum + s.completedDevices, 0),
      averageDevicesPerSession: sessions.length > 0 ? 
        (sessions.reduce((sum, s) => sum + s.totalDevices, 0) / sessions.length).toFixed(1) : '0',
      successRate: sessions.length > 0 ? 
        ((sessions.filter(s => s.status === 'COMPLETED').length / sessions.length) * 100).toFixed(1) : '0'
    };

    res.json({
      timeRange: `${days} days`,
      statistics: stats,
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        totalDevices: s.totalDevices,
        completedDevices: s.completedDevices,
        failedDevices: s.failedDevices,
        createdAt: s.createdAt,
        completedAt: s.completedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching session statistics:', error);
    res.status(500).json({ error: 'Failed to fetch session statistics' });
  }
};

// Helper functions
function calculateTotalSteps(profile: any): number {
  let steps = 1; // Initial validation step
  
  if (profile.applications.length > 0) {
    steps += 2; // Download and install apps
  }
  
  if (profile.networkConfig) {
    steps += 1; // Configure network
  }
  
  if (profile.securityConfig) {
    steps += 1; // Configure security
  }
  
  if (profile.filePackages.length > 0) {
    steps += 1; // Deploy files
  }
  
  steps += 1; // Final validation
  
  return steps;
}

function calculateAverageProvisioningTime(progress: any[]): string {
  const completedProgress = progress.filter(p => 
    p.completedAt && p.startedAt && p.status === 'COMPLETED'
  );

  if (completedProgress.length === 0) return 'N/A';

  const totalTime = completedProgress.reduce((sum, p) => {
    const duration = new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime();
    return sum + duration;
  }, 0);

  const averageMs = totalTime / completedProgress.length;
  const averageMinutes = Math.round(averageMs / (1000 * 60));
  
  return `${averageMinutes} min`;
}

async function updateSessionCounters(sessionId: string) {
  const progress = await prisma.provisioningProgress.findMany({
    where: { sessionId },
    select: { status: true }
  });

  const completedCount = progress.filter(p => p.status === 'COMPLETED').length;
  const failedCount = progress.filter(p => p.status === 'FAILED').length;
  const totalCount = progress.length;

  let sessionStatus = 'IN_PROGRESS';
  if (completedCount + failedCount === totalCount) {
    sessionStatus = failedCount === 0 ? 'COMPLETED' : (completedCount === 0 ? 'FAILED' : 'COMPLETED');
  }

  await prisma.provisioningSession.update({
    where: { id: sessionId },
    data: definedOnly({
      completedDevices: completedCount,
      failedDevices: failedCount,
      status: sessionStatus as any,
      completedAt: sessionStatus !== 'IN_PROGRESS' ? new Date() : undefined
    })
  });
}
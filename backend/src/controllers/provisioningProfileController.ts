import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { 
  CreateProvisioningProfileRequest
} from '../types';
import { ProvisioningService } from '../services/provisioningService';
import { definedOnly } from '../utils/prisma';

const prisma = new PrismaClient();

export const getAllProvisioningProfiles = async (req: Request, res: Response) => {
  try {
    const { includeInactive = 'false' } = req.query;
    
    const where = includeInactive === 'true' ? {} : { isActive: true };
    
    const profiles = await prisma.provisioningProfile.findMany({
      where,
      include: {
        applications: {
          orderBy: { installOrder: 'asc' }
        },
        filePackages: true,
        sessions: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: {
            applications: true,
            filePackages: true,
            sessions: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(profiles);
  } catch (error) {
    console.error('Error fetching provisioning profiles:', error);
    res.status(500).json({ error: 'Failed to fetch provisioning profiles' });
  }
};

export const getProvisioningProfile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    
    const profile = await prisma.provisioningProfile.findUnique({
      where: { id },
      include: {
        applications: {
          orderBy: { installOrder: 'asc' }
        },
        filePackages: true,
        sessions: {
          include: {
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
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!profile) {
      res.status(404).json({ error: 'Provisioning profile not found' });
      return;
    }

    res.json(profile);
  } catch (error) {
    console.error('Error fetching provisioning profile:', error);
    res.status(500).json({ error: 'Failed to fetch provisioning profile' });
  }
};

export const createProvisioningProfile = async (req: Request, res: Response) => {
  try {
    const data: CreateProvisioningProfileRequest = req.body;
    const userId = req.user?.userId; // From auth middleware

    // Validate device models
    const validDeviceModels = ['Samsung-T225', 'Samsung-T295', 'ZTE', 'MiOne', 'Laxton'];
    const invalidModels = data.deviceModels.filter(model => !validDeviceModels.includes(model));
    if (invalidModels.length > 0) {
      res.status(400).json({ 
        error: 'Invalid device models',
        details: `Invalid models: ${invalidModels.join(', ')}`
      });
      return;
    }

    // Validate applications
    for (const app of data.applications) {
      if (!app.packageName || !app.appName) {
        res.status(400).json({ 
          error: 'Application validation failed',
          details: 'Package name and app name are required for all applications'
        });
        return;
      }
    }

    const profile = await prisma.provisioningProfile.create({
      data: {
        name: data.name,
        // Omitted rather than set to undefined — see exactOptionalPropertyTypes.
        ...(data.description !== undefined ? { description: data.description } : {}),
        deviceModels: data.deviceModels,
        networkConfig: data.networkConfig as any,
        securityConfig: data.securityConfig as any,
        geographicRules: data.geographicRules as any,
        createdBy: userId || 'system',
        applications: {
          create: data.applications.map((app, index) => definedOnly({
            packageName: app.packageName,
            appName: app.appName,
            version: app.version,
            apkUrl: app.apkUrl,
            apkHash: app.apkHash,
            requiredPermissions: app.requiredPermissions,
            installOrder: app.installOrder || index,
            isRequired: app.isRequired
          }))
        },
        filePackages: {
          create: data.filePackages.map(pkg => definedOnly({
            name: pkg.name,
            description: pkg.description,
            fileType: pkg.fileType,
            filePath: pkg.filePath,
            fileHash: pkg.fileHash,
            targetPath: pkg.targetPath,
            isRequired: pkg.isRequired,
            fileSize: pkg.fileSize ? BigInt(pkg.fileSize) : undefined
          }))
        }
      },
      include: {
        applications: true,
        filePackages: true
      }
    });

    res.status(201).json(profile);
  } catch (error) {
    console.error('Error creating provisioning profile:', error);
    res.status(500).json({ error: 'Failed to create provisioning profile' });
  }
};

export const updateProvisioningProfile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const data: Partial<CreateProvisioningProfileRequest> = req.body;

    const existingProfile = await prisma.provisioningProfile.findUnique({
      where: { id },
      include: { sessions: { where: { status: 'IN_PROGRESS' } } }
    });

    if (!existingProfile) {
      res.status(404).json({ error: 'Provisioning profile not found' });
      return;
    }

    // Prevent updates if there are active sessions
    if (existingProfile.sessions.length > 0) {
      res.status(409).json({ 
        error: 'Cannot update profile with active provisioning sessions',
        details: 'Complete or cancel active sessions before updating'
      });
      return;
    }

    const updateData: any = {};
    
    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.deviceModels) updateData.deviceModels = data.deviceModels;
    if (data.networkConfig) updateData.networkConfig = data.networkConfig;
    if (data.securityConfig) updateData.securityConfig = data.securityConfig;
    if (data.geographicRules) updateData.geographicRules = data.geographicRules;

    // Handle applications update
    if (data.applications) {
      // Delete existing applications
      await prisma.provisioningApp.deleteMany({
        where: { profileId: id }
      });
      
      // Create new applications
      updateData.applications = {
        create: data.applications.map((app, index) => ({
          packageName: app.packageName,
          appName: app.appName,
          version: app.version,
          apkUrl: app.apkUrl,
          apkHash: app.apkHash,
          requiredPermissions: app.requiredPermissions,
          installOrder: app.installOrder || index,
          isRequired: app.isRequired
        }))
      };
    }

    // Handle file packages update
    if (data.filePackages) {
      // Delete existing file packages
      await prisma.filePackage.deleteMany({
        where: { profileId: id }
      });
      
      // Create new file packages
      updateData.filePackages = {
        create: data.filePackages.map(pkg => ({
          name: pkg.name,
          description: pkg.description,
          fileType: pkg.fileType,
          filePath: pkg.filePath,
          fileHash: pkg.fileHash,
          targetPath: pkg.targetPath,
          isRequired: pkg.isRequired,
          fileSize: pkg.fileSize ? BigInt(pkg.fileSize) : undefined
        }))
      };
    }

    const profile = await prisma.provisioningProfile.update({
      where: { id },
      data: updateData,
      include: {
        applications: true,
        filePackages: true
      }
    });

    res.json(profile);
  } catch (error) {
    console.error('Error updating provisioning profile:', error);
    res.status(500).json({ error: 'Failed to update provisioning profile' });
  }
};

export const deleteProvisioningProfile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { force = 'false' } = req.query;

    const profile = await prisma.provisioningProfile.findUnique({
      where: { id },
      include: { 
        sessions: true,
        _count: {
          select: { sessions: true }
        }
      }
    });

    if (!profile) {
      res.status(404).json({ error: 'Provisioning profile not found' });
      return;
    }

    // Check for active sessions
    const activeSessions = profile.sessions.filter(s => 
      ['PENDING', 'IN_PROGRESS', 'PAUSED'].includes(s.status)
    );

    if (activeSessions.length > 0 && force !== 'true') {
      res.status(409).json({
        error: 'Cannot delete profile with active sessions',
        details: {
          activeSessions: activeSessions.length,
          totalSessions: profile._count.sessions
        }
      });
      return;
    }

    if (force === 'true') {
      // Mark profile as inactive instead of deleting
      await prisma.provisioningProfile.update({
        where: { id },
        data: { isActive: false }
      });
      
      res.json({ message: 'Provisioning profile deactivated successfully' });
    } else {
      // Delete the profile (cascading deletes will handle related records)
      await prisma.provisioningProfile.delete({
        where: { id }
      });
      
      res.json({ message: 'Provisioning profile deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting provisioning profile:', error);
    res.status(500).json({ error: 'Failed to delete provisioning profile' });
  }
};

export const getCompatibleDevices = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    
    const profile = await prisma.provisioningProfile.findUnique({
      where: { id },
      select: { deviceModels: true }
    });

    if (!profile) {
      res.status(404).json({ error: 'Provisioning profile not found' });
      return;
    }

    // Find devices that match the supported models
    const compatibleDevices = await prisma.device.findMany({
      where: {
        OR: profile.deviceModels.map(model => ({
          model: { contains: model, mode: 'insensitive' }
        })),
        status: { in: ['ENROLLED', 'ACTIVE'] },
        provisioningStatus: { in: ['NOT_PROVISIONED', 'COMPLETED', 'FAILED'] }
      },
      select: {
        id: true,
        deviceId: true,
        manufacturer: true,
        model: true,
        deviceModel: true,
        status: true,
        provisioningStatus: true,
        lastProvisionedAt: true,
        lastSeen: true
      },
      orderBy: { lastSeen: 'desc' }
    });

    res.json({
      profileId: id,
      supportedModels: profile.deviceModels,
      compatibleDevices,
      totalCompatible: compatibleDevices.length
    });
  } catch (error) {
    console.error('Error fetching compatible devices:', error);
    res.status(500).json({ error: 'Failed to fetch compatible devices' });
  }
};

export const validateProfile = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    
    const profile = await prisma.provisioningProfile.findUnique({
      where: { id },
      include: {
        applications: true,
        filePackages: true
      }
    });

    if (!profile) {
      res.status(404).json({ error: 'Provisioning profile not found' });
      return;
    }

    const validation = {
      isValid: true,
      warnings: [] as string[],
      errors: [] as string[]
    };

    // Validate applications
    if (profile.applications.length === 0) {
      validation.warnings.push('Profile has no applications configured');
    } else {
      for (const app of profile.applications) {
        if (app.apkUrl && !app.apkHash) {
          validation.warnings.push(`Application ${app.appName} has no integrity hash`);
        }
        if (app.isRequired && !app.apkUrl) {
          validation.errors.push(`Required application ${app.appName} has no APK file configured`);
        }
      }
    }

    // Validate file packages
    for (const pkg of profile.filePackages) {
      if (!pkg.fileHash) {
        validation.warnings.push(`File package ${pkg.name} has no integrity hash`);
      }
      if (pkg.isRequired && !pkg.filePath) {
        validation.errors.push(`Required file package ${pkg.name} has no file path configured`);
      }
    }

    // Validate network configuration
    if (profile.networkConfig) {
      const config = profile.networkConfig as any;
      if (!config.apn || !config.name) {
        validation.errors.push('Network configuration is incomplete (missing APN or name)');
      }
    }

    validation.isValid = validation.errors.length === 0;

    res.json({
      profileId: id,
      profileName: profile.name,
      validation
    });
  } catch (error) {
    console.error('Error validating provisioning profile:', error);
    res.status(500).json({ error: 'Failed to validate provisioning profile' });
  }
};

// Bulk Application Deployment
export const bulkDeployApplications = async (req: Request<{ profileId: string }>, res: Response) => {
  try {
    const { profileId } = req.params;
    const { deviceIds, applications, options = {} } = req.body;
    const userId = req.user?.userId;

    // Validate profile exists
    const profile = await prisma.provisioningProfile.findUnique({
      where: { id: profileId },
      include: {
        applications: {
          orderBy: { installOrder: 'asc' }
        }
      }
    });

    if (!profile) {
      res.status(404).json({ error: 'Provisioning profile not found' });
      return;
    }

    // Validate devices exist
    const devices = await prisma.device.findMany({
      where: { id: { in: deviceIds } }
    });

    if (devices.length !== deviceIds.length) {
      res.status(400).json({ error: 'Some devices not found' });
      return;
    }

    // Create deployment session
    const deploymentSession = await prisma.provisioningSession.create({
      data: {
        profileId,
        name: `Bulk App Deployment - ${profile.name}`,
        description: `Bulk deployment of ${applications.length} applications to ${devices.length} devices`,
        deviceIds,
        totalDevices: devices.length,
        createdBy: userId || 'system',
        status: 'PENDING'
      }
    });

    // Create progress entries for each device
    await Promise.all(
      devices.map(device =>
        prisma.provisioningProgress.create({
          data: {
            sessionId: deploymentSession.id,
            deviceId: device.id,
            status: 'PENDING',
            totalSteps: applications.length,
            completedSteps: 0,
            currentStep: 'Initializing deployment'
          }
        })
      )
    );

    // Start deployment process
    const deploymentService = new ProvisioningService();
    await deploymentService.startBulkApplicationDeployment(
      deploymentSession.id,
      applications,
      devices,
      options
    );

    res.json({
      message: 'Bulk application deployment started',
      sessionId: deploymentSession.id,
      totalDevices: devices.length,
      totalApplications: applications.length,
      status: 'PENDING'
    });
  } catch (error) {
    console.error('Error starting bulk application deployment:', error);
    res.status(500).json({ error: 'Failed to start bulk application deployment' });
  }
};

// Get deployment progress
export const getDeploymentProgress = async (req: Request<{ sessionId: string }>, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.provisioningSession.findUnique({
      where: { id: sessionId },
      include: {
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
        profile: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!session) {
      res.status(404).json({ error: 'Deployment session not found' });
      return;
    }

    // Calculate progress statistics
    const totalDevices = session.progress.length;
    const completedDevices = session.progress.filter(p => p.status === 'COMPLETED').length;
    const failedDevices = session.progress.filter(p => p.status === 'FAILED').length;
    const inProgressDevices = session.progress.filter(p => 
      ['DOWNLOADING_APPS', 'INSTALLING_APPS', 'CONFIGURING_NETWORK', 'CONFIGURING_SECURITY', 'DEPLOYING_FILES', 'VALIDATING'].includes(p.status)
    ).length;

    const progressPercentage = totalDevices > 0 ? Math.round((completedDevices / totalDevices) * 100) : 0;

    res.json({
      sessionId: session.id,
      sessionName: session.name,
      status: session.status,
      progress: {
        totalDevices,
        completedDevices,
        failedDevices,
        inProgressDevices,
        pendingDevices: totalDevices - completedDevices - failedDevices - inProgressDevices,
        percentage: progressPercentage
      },
      devices: session.progress.map(p => ({
        deviceId: p.device.deviceId,
        model: p.device.model,
        status: p.status,
        currentStep: p.currentStep,
        completedSteps: p.completedSteps,
        totalSteps: p.totalSteps,
        errorMessage: p.errorMessage,
        startedAt: p.startedAt,
        completedAt: p.completedAt
      })),
      profile: session.profile
    });
  } catch (error) {
    console.error('Error fetching deployment progress:', error);
    res.status(500).json({ error: 'Failed to fetch deployment progress' });
  }
};

// Cancel deployment
export const cancelDeployment = async (req: Request<{ sessionId: string }>, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await prisma.provisioningSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      res.status(404).json({ error: 'Deployment session not found' });
      return;
    }

    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      res.status(400).json({ error: 'Session cannot be cancelled' });
      return;
    }

    // Update session status
    await prisma.provisioningSession.update({
      where: { id: sessionId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date()
      }
    });

    // Update all pending progress entries
    await prisma.provisioningProgress.updateMany({
      where: {
        sessionId,
        status: { in: ['PENDING', 'DOWNLOADING_APPS', 'INSTALLING_APPS', 'CONFIGURING_NETWORK', 'CONFIGURING_SECURITY', 'DEPLOYING_FILES', 'VALIDATING'] }
      },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        errorMessage: 'Deployment cancelled by administrator'
      }
    });

    res.json({
      message: 'Deployment cancelled successfully',
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error cancelling deployment:', error);
    res.status(500).json({ error: 'Failed to cancel deployment' });
  }
};

// Field Configuration Management
export const createFieldConfiguration = async (req: Request, res: Response) => {
  try {
    const { name, description, deviceModels, configurations, dataCollectionRules } = req.body;
    const userId = req.user?.userId;

    // Validate required fields
    if (!name || !deviceModels || !configurations) {
      res.status(400).json({ error: 'Name, device models, and configurations are required' });
      return;
    }

    // Create field configuration
    const fieldConfig = await prisma.fieldConfiguration.create({
      data: {
        name,
        description,
        deviceModels,
        configurations: configurations as any,
        dataCollectionRules: dataCollectionRules as any,
        createdBy: userId || 'system',
        isActive: true
      }
    });

    res.status(201).json(fieldConfig);
  } catch (error) {
    console.error('Error creating field configuration:', error);
    res.status(500).json({ error: 'Failed to create field configuration' });
  }
};

export const getFieldConfigurations = async (req: Request, res: Response) => {
  try {
    const { includeInactive = 'false' } = req.query;
    
    const where = includeInactive === 'true' ? {} : { isActive: true };
    
    const configurations = await prisma.fieldConfiguration.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json(configurations);
  } catch (error) {
    console.error('Error fetching field configurations:', error);
    res.status(500).json({ error: 'Failed to fetch field configurations' });
  }
};

export const getFieldConfiguration = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    
    const configuration = await prisma.fieldConfiguration.findUnique({
      where: { id }
    });

    if (!configuration) {
      res.status(404).json({ error: 'Field configuration not found' });
      return;
    }

    res.json(configuration);
  } catch (error) {
    console.error('Error fetching field configuration:', error);
    res.status(500).json({ error: 'Failed to fetch field configuration' });
  }
};

export const updateFieldConfiguration = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.userId;

    const configuration = await prisma.fieldConfiguration.findUnique({
      where: { id }
    });

    if (!configuration) {
      res.status(404).json({ error: 'Field configuration not found' });
      return;
    }

    const updatedConfiguration = await prisma.fieldConfiguration.update({
      where: { id },
      data: {
        ...updates,
        updatedBy: userId || 'system',
        updatedAt: new Date()
      }
    });

    res.json(updatedConfiguration);
  } catch (error) {
    console.error('Error updating field configuration:', error);
    res.status(500).json({ error: 'Failed to update field configuration' });
  }
};

export const deleteFieldConfiguration = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;

    const configuration = await prisma.fieldConfiguration.findUnique({
      where: { id }
    });

    if (!configuration) {
      res.status(404).json({ error: 'Field configuration not found' });
      return;
    }

    await prisma.fieldConfiguration.delete({
      where: { id }
    });

    res.json({ message: 'Field configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting field configuration:', error);
    res.status(500).json({ error: 'Failed to delete field configuration' });
  }
};

export const applyFieldConfiguration = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { deviceIds, options = {} } = req.body;
    const userId = req.user?.userId;

    // Validate configuration exists
    const configuration = await prisma.fieldConfiguration.findUnique({
      where: { id }
    });

    if (!configuration) {
      res.status(404).json({ error: 'Field configuration not found' });
      return;
    }

    // Validate devices exist
    const devices = await prisma.device.findMany({
      where: { id: { in: deviceIds } }
    });

    if (devices.length !== deviceIds.length) {
      res.status(400).json({ error: 'Some devices not found' });
      return;
    }

    // Create configuration session
    const configSession = await prisma.provisioningSession.create({
      data: {
        name: `Field Configuration - ${configuration.name}`,
        description: `Applying field configuration to ${devices.length} devices`,
        deviceIds,
        totalDevices: devices.length,
        createdBy: userId || 'system',
        status: 'PENDING'
      }
    });

    // Create progress entries
    await Promise.all(
      devices.map(device =>
        prisma.provisioningProgress.create({
          data: {
            sessionId: configSession.id,
            deviceId: device.id,
            status: 'PENDING',
            totalSteps: Object.keys(configuration.configurations as any).length,
            completedSteps: 0,
            currentStep: 'Initializing field configuration'
          }
        })
      )
    );

    // Start configuration process
    const provisioningService = new ProvisioningService();
    await provisioningService.applyFieldConfiguration(
      configSession.id,
      configuration,
      devices,
      options
    );

    res.json({
      message: 'Field configuration application started',
      sessionId: configSession.id,
      totalDevices: devices.length,
      status: 'PENDING'
    });
  } catch (error) {
    console.error('Error applying field configuration:', error);
    res.status(500).json({ error: 'Failed to apply field configuration' });
  }
};

// Device Model Recognition
export const detectDeviceModel = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    
    // Get device information
    const device = await prisma.device.findUnique({
      where: { deviceId },
      select: {
        id: true,
        deviceId: true,
        manufacturer: true,
        model: true,
        androidVersion: true,
        sdkVersion: true,
        fingerprint: true,
        status: true
      }
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Analyze device specifications
    const deviceSpecs = await analyzeDeviceSpecifications(device);
    
    // Find compatible profiles
    const compatibleProfiles = await findCompatibleProfiles(deviceSpecs);
    
    // Generate configuration recommendations
    const recommendations = await generateConfigurationRecommendations(deviceSpecs, compatibleProfiles);

    res.json({
      deviceId: device.deviceId,
      deviceSpecs,
      compatibleProfiles,
      recommendations
    });
  } catch (error) {
    console.error('Error detecting device model:', error);
    res.status(500).json({ error: 'Failed to detect device model' });
  }
};

// Analyze device specifications
async function analyzeDeviceSpecifications(device: any) {
  const specs = {
    manufacturer: device.manufacturer,
    model: device.model,
    androidVersion: device.androidVersion,
    sdkVersion: device.sdkVersion,
    fingerprint: device.fingerprint,
    capabilities: {
      hasCamera: true, // Default assumptions - in real implementation, check actual capabilities
      hasGPS: true,
      hasNFC: false,
      hasFingerprint: false,
      hasFaceRecognition: false,
      hasBiometric: false,
      storageCapacity: '32GB', // Default - would be detected from device
      ramCapacity: '4GB', // Default - would be detected from device
      screenSize: '6.1"', // Default - would be detected from device
      screenResolution: '1080x2400', // Default - would be detected from device
      batteryCapacity: '4000mAh' // Default - would be detected from device
    },
    compatibility: {
      minSdkVersion: 21,
      targetSdkVersion: device.sdkVersion,
      supportedArchitectures: ['arm64-v8a', 'armeabi-v7a'],
      supportedAbis: ['arm64-v8a', 'armeabi-v7a']
    }
  };

  // Enhance with real device detection
  if (device.manufacturer.toLowerCase().includes('samsung')) {
    specs.capabilities.hasFingerprint = true;
    specs.capabilities.hasNFC = true;
  }

  if (device.manufacturer.toLowerCase().includes('google') || device.manufacturer.toLowerCase().includes('pixel')) {
    specs.capabilities.hasFaceRecognition = true;
    specs.capabilities.hasBiometric = true;
  }

  return specs;
}

// Find compatible profiles
async function findCompatibleProfiles(deviceSpecs: any) {
  const compatibleProfiles = await prisma.provisioningProfile.findMany({
    where: {
      isActive: true,
      deviceModels: {
        hasSome: deviceSpecs.model
      }
    },
    include: {
      applications: {
        orderBy: { installOrder: 'asc' }
      },
      filePackages: true
    }
  });

  // Filter by SDK version compatibility
  const sdkCompatibleProfiles = compatibleProfiles.filter(profile => {
    const minSdkRequired = Math.min(...profile.applications.map((app: any) => app.minSdkVersion || 21));
    return deviceSpecs.sdkVersion >= minSdkRequired;
  });

  return sdkCompatibleProfiles;
}

// Generate configuration recommendations
async function generateConfigurationRecommendations(deviceSpecs: any, compatibleProfiles: any[]) {
  const recommendations = {
    suggestedProfiles: compatibleProfiles.slice(0, 3), // Top 3 compatible profiles
    customConfigurations: {
      network: {
        recommended: deviceSpecs.capabilities.hasNFC ? '4G_LTE' : '3G',
        apnSettings: getRecommendedAPNSettings(deviceSpecs.manufacturer)
      },
      security: {
        recommended: deviceSpecs.capabilities.hasFingerprint ? 'BIOMETRIC' : 'PIN',
        encryptionLevel: 'AES_256',
        screenTimeout: 300 // 5 minutes
      },
      applications: {
        recommended: getRecommendedApplications(deviceSpecs),
        excluded: getExcludedApplications(deviceSpecs)
      },
      dataCollection: {
        recommended: getRecommendedDataCollection(deviceSpecs),
        samplingRate: 5000, // 5 seconds
        storageLimit: '1GB'
      }
    },
    optimization: {
      batteryOptimization: true,
      storageOptimization: true,
      networkOptimization: true,
      performanceOptimization: true
    }
  };

  return recommendations;
}

// Helper functions for recommendations
function getRecommendedAPNSettings(manufacturer: string) {
  const apnSettings: any = {
    'Samsung': {
      carrier: 'MTN',
      apn: 'internet',
      type: '4G'
    },
    'Google': {
      carrier: 'AIRTEL',
      apn: 'internet',
      type: '4G'
    },
    'Xiaomi': {
      carrier: 'CUSTOM',
      apn: 'internet',
      type: '4G'
    }
  };

  return apnSettings[manufacturer] || apnSettings['CUSTOM'];
}

function getRecommendedApplications(deviceSpecs: any) {
  const baseApps = [
    'com.mdm.app',
    'com.android.chrome',
    'com.google.android.apps.maps'
  ];

  if (deviceSpecs.capabilities.hasCamera) {
    baseApps.push('com.android.camera');
  }

  if (deviceSpecs.capabilities.hasGPS) {
    baseApps.push('com.google.android.apps.maps');
  }

  return baseApps;
}

function getExcludedApplications(deviceSpecs: any) {
  const excludedApps = [
    'com.android.gallery',
    'com.android.music'
  ];

  if (!deviceSpecs.capabilities.hasNFC) {
    excludedApps.push('com.android.nfc');
  }

  return excludedApps;
}

function getRecommendedDataCollection(deviceSpecs: any) {
  const dataCollection = {
    location: deviceSpecs.capabilities.hasGPS,
    camera: deviceSpecs.capabilities.hasCamera,
    sensors: true,
    network: true,
    battery: true,
    storage: true
  };

  return dataCollection;
}
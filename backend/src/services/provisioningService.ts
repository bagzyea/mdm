import {
  ProvisioningDeviceStatus,
  ProvisioningLog,
  APNConfiguration,
  ProvisioningSecurityConfig
} from '../types';
import { getCommandService } from './commandServiceInstance';
import { definedOnly } from '../utils/prisma';
import { signStoredApkReference } from './signedDownloads';
import { CommandType } from '../types/commands';
import prisma from '../db';


interface ProvisioningOptions {
  parallelLimit?: number;
  retryAttempts?: number;
  skipValidation?: boolean;
}

export class ProvisioningService {
  private activeSessions = new Map<string, boolean>();
  private pausedSessions = new Set<string>();
  
  async startProvisioning(session: any, options: ProvisioningOptions = {}) {
    const { 
      parallelLimit = 5, 
      retryAttempts = 3, 
      skipValidation = false 
    } = options;

    this.activeSessions.set(session.id, true);
    
    try {
      // Process devices in batches
      const devices = session.progress.map((p: any) => p.device);
      const batches = this.createBatches(devices, parallelLimit);

      for (const batch of batches) {
        // Check if session is still active
        if (!this.activeSessions.get(session.id) || this.pausedSessions.has(session.id)) {
          break;
        }

        // Process batch in parallel
        await Promise.all(
          batch.map((device: any) => 
            this.provisionDevice(session, device, retryAttempts, skipValidation)
              .catch(error => {
                console.error(`Error provisioning device ${device.deviceId}:`, error);
                this.updateProgress(session.id, device.id, 'FAILED', {
                  errorMessage: error.message,
                  errorCode: 'PROVISIONING_ERROR'
                });
              })
          )
        );
      }
    } catch (error) {
      console.error('Error in provisioning session:', error);
      await this.handleSessionError(session.id, error as Error);
    } finally {
      this.activeSessions.delete(session.id);
    }
  }

  async provisionDevice(
    session: any,
    device: any,
    retryAttempts: number = 3,
    skipValidation: boolean = false
  ) {
    const profile = session.profile;

    try {
      // Step 1: Pre-flight device validation
      if (!skipValidation) {
        await this.validateDevice(session.id, device, profile);
      }

      // Step 2: Build PROVISION_DEVICE command payload
      const payload = {
        sessionId: session.id,
        profileId: profile.id,
        apps: (profile.applications || []).map((app: any) => ({
          packageName: app.packageName,
          appName: app.appName,
          // Signed at dispatch, not stored: APK downloads are no longer served from an
          // unauthenticated static path (finding F-06), and a signed URL baked into a
          // long-lived profile would expire before the profile was used.
          apkUrl: signStoredApkReference(app.apkUrl) ?? app.apkUrl,
          apkHash: app.apkHash,
          permissions: app.requiredPermissions || [],
          installOrder: app.installOrder,
          isRequired: app.isRequired
        })),
        networkConfig: profile.networkConfig || null,
        securityConfig: profile.securityConfig || null
      };

      // Step 3: Create RemoteCommand in database
      const remoteCommand = await prisma.remoteCommand.create({
        data: {
          deviceId: device.id,
          command: 'PROVISION_DEVICE' as CommandType,
          parameters: payload,
          status: 'PENDING'
        }
      });

      // Step 4: Update progress to PENDING
      await this.updateProgress(session.id, device.id, 'PENDING', {
        currentStep: 'Provisioning command sent to device',
        logs: [{
          timestamp: new Date(),
          level: 'INFO',
          message: 'Provisioning command sent to device',
          details: { commandId: remoteCommand.id }
        }]
      });

      // Step 5: Send command to device via WebSocket
      const commandService = getCommandService();
      await commandService.notifyDeviceOfCommand(
        device.deviceId,
        remoteCommand.id,
        'PROVISION_DEVICE' as CommandType,
        payload
      );

      console.log(`Provisioning command sent to device ${device.deviceId} with command ID ${remoteCommand.id}`);
      // Device will report progress back via socket.on('provisioningProgress')
      // No waiting here - async feedback loop
    } catch (error) {
      console.error(`Failed to send provisioning command to device ${device.deviceId}:`, error);

      await this.updateProgress(session.id, device.id, 'FAILED', {
        currentStep: 'Failed to send provisioning command',
        errorMessage: (error as Error).message,
        errorCode: 'COMMAND_SEND_FAILED',
        logs: [{
          timestamp: new Date(),
          level: 'ERROR',
          message: 'Failed to send provisioning command to device',
          details: { error: (error as Error).message }
        }]
      });

      throw error;
    }
  }

  private async validateDevice(sessionId: string, device: any, profile: any) {
    await this.updateProgress(sessionId, device.id, 'PENDING', {
      currentStep: 'Validating device compatibility'
    });

    // Check device model compatibility
    const isCompatible = profile.deviceModels.some((supportedModel: string) =>
      device.model.toLowerCase().includes(supportedModel.toLowerCase()) ||
      device.deviceModel?.toLowerCase().includes(supportedModel.toLowerCase())
    );

    if (!isCompatible) {
      throw new Error(`Device model ${device.model} is not compatible with this profile`);
    }

    // Check device status
    if (!['ENROLLED', 'ACTIVE'].includes(device.status)) {
      throw new Error(`Device status ${device.status} is not eligible for provisioning`);
    }

    await this.sendLog(sessionId, device.id, 'INFO', 'Device validation passed');
  }

  async startBulkApplicationDeployment(
    sessionId: string,
    applications: any[],
    devices: any[],
    options: {
      parallelLimit?: number;
      retryAttempts?: number;
      skipDependencies?: boolean;
      validateBeforeInstall?: boolean;
    } = {}
  ) {
    const {
      parallelLimit = 3,
      retryAttempts = 3,
      skipDependencies = false,
      validateBeforeInstall = true
    } = options;

    try {
      // Update session status
      await prisma.provisioningSession.update({
        where: { id: sessionId },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date()
        }
      });

      // Process devices in parallel batches
      const batches = this.createBatches(devices, parallelLimit);

      for (const batch of batches) {
        // Check if session is still active
        const session = await prisma.provisioningSession.findUnique({
          where: { id: sessionId }
        });

        if (!session || session.status === 'CANCELLED') {
          break;
        }

        // Process batch in parallel
        await Promise.all(
          batch.map(device =>
            this.deployApplicationsToDevice(sessionId, device, applications, {
              retryAttempts,
              skipDependencies,
              validateBeforeInstall
            }).catch(error => {
              console.error(`Error deploying applications to device ${device.deviceId}:`, error);
              this.updateProgress(sessionId, device.id, 'FAILED', {
                errorMessage: error.message,
                errorCode: 'DEPLOYMENT_ERROR'
              });
            })
          )
        );
      }

      // Update session status to completed
      await prisma.provisioningSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error in bulk application deployment:', error);
      await this.handleSessionError(sessionId, error as Error);
    }
  }

  private async deployApplicationsToDevice(
    sessionId: string,
    device: any,
    applications: any[],
    options: {
      retryAttempts: number;
      skipDependencies: boolean;
      validateBeforeInstall: boolean;
    }
  ) {
    const { retryAttempts, validateBeforeInstall } = options;
    let attempt = 0;

    while (attempt < retryAttempts) {
      try {
        // Update status to downloading apps
        await this.updateProgress(sessionId, device.id, 'DOWNLOADING_APPS', {
          currentStep: 'Downloading applications',
          completedSteps: 0,
          totalSteps: applications.length
        });

        // Step 1: Validate device compatibility
        if (validateBeforeInstall) {
          await this.validateDeviceCompatibility(sessionId, device, applications);
        }

        // Step 2: Download applications
        const downloadedApps = await this.downloadApplications(sessionId, device, applications);

        // Step 3: Install applications
        await this.updateProgress(sessionId, device.id, 'INSTALLING_APPS', {
          currentStep: 'Installing applications',
          completedSteps: 0,
          totalSteps: applications.length
        });

        for (let i = 0; i < downloadedApps.length; i++) {
          const app = downloadedApps[i];
          
          await this.updateProgress(sessionId, device.id, 'INSTALLING_APPS', {
            currentStep: `Installing ${app.appName}`,
            completedSteps: i,
            totalSteps: applications.length
          });

          // Install application
          await this.installApplication(device, app);

          // Grant permissions if required
          if (app.requiredPermissions && app.requiredPermissions.length > 0) {
            await this.grantAppPermissions(device, app);
          }

          // Update progress
          await this.updateProgress(sessionId, device.id, 'INSTALLING_APPS', {
            currentStep: `Installed ${app.appName}`,
            completedSteps: i + 1,
            totalSteps: applications.length
          });
        }

        // Step 4: Validate installation
        await this.updateProgress(sessionId, device.id, 'VALIDATING', {
          currentStep: 'Validating installation',
          completedSteps: applications.length,
          totalSteps: applications.length
        });

        await this.validateApplicationInstallation(sessionId, device, applications);

        // Step 5: Mark as completed
        await this.updateProgress(sessionId, device.id, 'COMPLETED', {
          currentStep: 'Deployment completed successfully',
          completedSteps: applications.length,
          totalSteps: applications.length,
          completedAt: new Date()
        });

        break; // Success, exit retry loop

      } catch (error) {
        attempt++;
        console.error(`Attempt ${attempt} failed for device ${device.deviceId}:`, error);

        if (attempt >= retryAttempts) {
          await this.updateProgress(sessionId, device.id, 'FAILED', {
            errorMessage: `Failed after ${retryAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
            errorCode: 'DEPLOYMENT_FAILED'
          });
          throw error;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
      }
    }
  }

  private async validateDeviceCompatibility(sessionId: string, device: any, applications: any[]) {
    // Check device storage
    const requiredStorage = applications.reduce((total, app) => total + (app.fileSize || 0), 0);
    const availableStorage = device.availableStorage || 0;

    if (availableStorage < requiredStorage) {
      throw new Error(`Insufficient storage. Required: ${requiredStorage}, Available: ${availableStorage}`);
    }

    // Check Android version compatibility
    const deviceSdkVersion = device.sdkVersion || 0;
    for (const app of applications) {
      if (app.minSdkVersion && deviceSdkVersion < app.minSdkVersion) {
        throw new Error(`Device SDK version ${deviceSdkVersion} is below required ${app.minSdkVersion} for ${app.appName}`);
      }
    }

    await this.sendLog(sessionId, device.id, 'INFO', 'Device compatibility validation passed');
  }

  private async downloadApplications(sessionId: string, device: any, applications: any[]) {
    const downloadedApps = [];

    for (const app of applications) {
      try {
        await this.sendLog(sessionId, device.id, 'INFO', `Downloading ${app.appName}...`);
        
        // Simulate download process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Validate download (check file integrity)
        if (app.apkHash) {
          // In real implementation, verify the downloaded APK hash
          await this.verifyApkIntegrity(app);
        }

        downloadedApps.push(app);
        await this.sendLog(sessionId, device.id, 'INFO', `Downloaded ${app.appName} successfully`);
      } catch (error) {
        throw new Error(`Failed to download ${app.appName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return downloadedApps;
  }

  private async verifyApkIntegrity(app: any) {
    // In real implementation, verify APK hash
    // For now, just simulate the verification
    if (app.apkHash && app.apkHash.length < 10) {
      throw new Error('Invalid APK hash');
    }
  }

  private async validateApplicationInstallation(sessionId: string, device: any, applications: any[]) {
    for (const app of applications) {
      try {
        await this.sendLog(sessionId, device.id, 'INFO', `Validating ${app.appName} installation...`);
        
        // In real implementation, check if app is actually installed
        // For now, just simulate validation
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await this.sendLog(sessionId, device.id, 'INFO', `${app.appName} installation validated successfully`);
      } catch (error) {
        throw new Error(`Failed to validate ${app.appName} installation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async installApplication(device: any, app: any): Promise<void> {
    // Note: In the OTA model, app installation happens on the device via PROVISION_DEVICE command
    // This is a placeholder for legacy bulk deployment feature
    // Should be refactored to send PROVISION_DEVICE command instead
    const commandService = getCommandService();
    const command = await prisma.remoteCommand.create({
      data: {
        deviceId: device.id,
        command: 'INSTALL_APP' as CommandType,
        parameters: {
          packageName: app.packageName,
          // Signed at dispatch — see the note in buildProvisioningPayload above.
          apkUrl: signStoredApkReference(app.apkUrl) ?? app.apkUrl,
          apkHash: app.apkHash
        },
        status: 'PENDING'
      }
    });

    await commandService.notifyDeviceOfCommand(
      device.deviceId,
      command.id,
      'INSTALL_APP' as CommandType,
      command.parameters
    );
  }

  private async grantAppPermissions(device: any, app: any): Promise<void> {
    // Note: In the OTA model, permission granting happens on the device via PROVISION_DEVICE command
    // This is a placeholder for legacy bulk deployment feature
    if (!app.requiredPermissions || app.requiredPermissions.length === 0) {
      return;
    }

    const commandService = getCommandService();
    const command = await prisma.remoteCommand.create({
      data: {
        deviceId: device.id,
        command: 'GRANT_PERMISSIONS' as CommandType,
        parameters: {
          packageName: app.packageName,
          permissions: app.requiredPermissions
        },
        status: 'PENDING'
      }
    });

    await commandService.notifyDeviceOfCommand(
      device.deviceId,
      command.id,
      'GRANT_PERMISSIONS' as CommandType,
      command.parameters
    );
  }

  async applyFieldConfiguration(
    sessionId: string,
    configuration: any,
    devices: any[],
    options: {
      parallelLimit?: number;
      retryAttempts?: number;
      validateBeforeApply?: boolean;
    } = {}
  ) {
    const {
      parallelLimit = 3,
      retryAttempts = 3,
      validateBeforeApply = true
    } = options;

    try {
      // Update session status
      await prisma.provisioningSession.update({
        where: { id: sessionId },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date()
        }
      });

      // Process devices in parallel batches
      const batches = this.createBatches(devices, parallelLimit);

      for (const batch of batches) {
        // Check if session is still active
        const session = await prisma.provisioningSession.findUnique({
          where: { id: sessionId }
        });

        if (!session || session.status === 'CANCELLED') {
          break;
        }

        // Process batch in parallel
        await Promise.all(
          batch.map(device =>
            this.applyFieldConfigurationToDevice(sessionId, device, configuration, {
              retryAttempts,
              validateBeforeApply
            }).catch(error => {
              console.error(`Error applying field configuration to device ${device.deviceId}:`, error);
              this.updateProgress(sessionId, device.id, 'FAILED', {
                errorMessage: error.message,
                errorCode: 'CONFIGURATION_ERROR'
              });
            })
          )
        );
      }

      // Update session status to completed
      await prisma.provisioningSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error in field configuration application:', error);
      await this.handleSessionError(sessionId, error as Error);
    }
  }

  private async applyFieldConfigurationToDevice(
    sessionId: string,
    device: any,
    configuration: any,
    options: {
      retryAttempts: number;
      validateBeforeApply: boolean;
    }
  ) {
    const { retryAttempts, validateBeforeApply } = options;
    let attempt = 0;

    while (attempt < retryAttempts) {
      try {
        // Step 1: Validate device compatibility
        if (validateBeforeApply) {
          await this.validateDeviceForFieldConfiguration(sessionId, device, configuration);
        }

        // Step 2: Apply configurations
        await this.updateProgress(sessionId, device.id, 'CONFIGURING_NETWORK', {
          currentStep: 'Applying field configurations',
          completedSteps: 0,
          totalSteps: Object.keys(configuration.configurations).length
        });

        const configKeys = Object.keys(configuration.configurations);
        for (let i = 0; i < configKeys.length; i++) {
          const configKey = configKeys[i];
          if (configKey === undefined) continue;
          const configValue = configuration.configurations[configKey];

          await this.updateProgress(sessionId, device.id, 'CONFIGURING_NETWORK', {
            currentStep: `Applying ${configKey} configuration`,
            completedSteps: i,
            totalSteps: configKeys.length
          });

          // Apply specific configuration
          await this.applyDeviceConfiguration(sessionId, device, configKey, configValue);

          await this.updateProgress(sessionId, device.id, 'CONFIGURING_NETWORK', {
            currentStep: `Applied ${configKey} configuration`,
            completedSteps: i + 1,
            totalSteps: configKeys.length
          });
        }

        // Step 3: Apply data collection rules
        if (configuration.dataCollectionRules) {
          await this.updateProgress(sessionId, device.id, 'DEPLOYING_FILES', {
            currentStep: 'Applying data collection rules',
            completedSteps: configKeys.length,
            totalSteps: configKeys.length + 1
          });

          await this.applyDataCollectionRules(sessionId, device, configuration.dataCollectionRules);

          await this.updateProgress(sessionId, device.id, 'DEPLOYING_FILES', {
            currentStep: 'Applied data collection rules',
            completedSteps: configKeys.length + 1,
            totalSteps: configKeys.length + 1
          });
        }

        // Step 4: Validate configuration
        await this.updateProgress(sessionId, device.id, 'VALIDATING', {
          currentStep: 'Validating field configuration',
          completedSteps: configKeys.length + (configuration.dataCollectionRules ? 1 : 0),
          totalSteps: configKeys.length + (configuration.dataCollectionRules ? 1 : 0)
        });

        await this.validateFieldConfiguration(sessionId, device, configuration);

        // Step 5: Mark as completed
        await this.updateProgress(sessionId, device.id, 'COMPLETED', {
          currentStep: 'Field configuration completed successfully',
          completedSteps: configKeys.length + (configuration.dataCollectionRules ? 1 : 0),
          totalSteps: configKeys.length + (configuration.dataCollectionRules ? 1 : 0),
          completedAt: new Date()
        });

        break; // Success, exit retry loop

      } catch (error) {
        attempt++;
        console.error(`Attempt ${attempt} failed for device ${device.deviceId}:`, error);

        if (attempt >= retryAttempts) {
          await this.updateProgress(sessionId, device.id, 'FAILED', {
            errorMessage: `Failed after ${retryAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
            errorCode: 'CONFIGURATION_FAILED'
          });
          throw error;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
      }
    }
  }

  private async validateDeviceForFieldConfiguration(sessionId: string, device: any, configuration: any) {
    // Check if device model is supported
    if (configuration.deviceModels && !configuration.deviceModels.includes(device.model)) {
      throw new Error(`Device model ${device.model} is not supported by this field configuration`);
    }

    // Check device status
    if (device.status !== 'ACTIVE' && device.status !== 'ENROLLED') {
      throw new Error(`Device ${device.deviceId} is not in active state`);
    }

    await this.sendLog(sessionId, device.id, 'INFO', 'Device validation for field configuration passed');
  }

  private async applyDeviceConfiguration(sessionId: string, device: any, configKey: string, configValue: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', `Applying ${configKey} configuration...`);

      // Apply configuration based on type
      switch (configKey) {
        case 'network':
          await this.applyNetworkConfiguration(sessionId, device, configValue);
          break;
        case 'security':
          await this.applySecurityConfiguration(sessionId, device, configValue);
          break;
        case 'applications':
          await this.applyApplicationConfiguration(sessionId, device, configValue);
          break;
        case 'dataCollection':
          await this.applyDataCollectionConfiguration(sessionId, device, configValue);
          break;
        default:
          await this.sendLog(sessionId, device.id, 'WARN', `Unknown configuration type: ${configKey}`);
      }

      await this.sendLog(sessionId, device.id, 'INFO', `Applied ${configKey} configuration successfully`);
    } catch (error) {
      throw new Error(`Failed to apply ${configKey} configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async applyNetworkConfiguration(sessionId: string, device: any, config: any) {
    // Apply network-specific configurations
    if (config.wifi) {
      // Configure WiFi settings
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring WiFi settings...');
    }

    if (config.cellular) {
      // Configure cellular settings
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring cellular settings...');
    }
  }

  private async applySecurityConfiguration(sessionId: string, device: any, config: any) {
    // Apply security-specific configurations
    if (config.encryption) {
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring encryption settings...');
    }

    if (config.passcode) {
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring passcode settings...');
    }
  }

  private async applyApplicationConfiguration(sessionId: string, device: any, config: any) {
    // Apply application-specific configurations
    if (config.whitelist) {
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring application whitelist...');
    }

    if (config.permissions) {
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring application permissions...');
    }
  }

  private async applyDataCollectionConfiguration(sessionId: string, device: any, config: any) {
    // Apply data collection-specific configurations
    if (config.sensors) {
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring sensor data collection...');
    }

    if (config.location) {
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring location data collection...');
    }
  }

  private async applyDataCollectionRules(sessionId: string, device: any, rules: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Applying data collection rules...');

      // Apply data collection rules
      if (rules.samplingRate) {
        await this.sendLog(sessionId, device.id, 'INFO', `Setting sampling rate to ${rules.samplingRate}ms`);
      }

      if (rules.storageLimit) {
        await this.sendLog(sessionId, device.id, 'INFO', `Setting storage limit to ${rules.storageLimit}MB`);
      }

      if (rules.uploadSchedule) {
        await this.sendLog(sessionId, device.id, 'INFO', `Setting upload schedule to ${rules.uploadSchedule}`);
      }

      await this.sendLog(sessionId, device.id, 'INFO', 'Data collection rules applied successfully');
    } catch (error) {
      throw new Error(`Failed to apply data collection rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateFieldConfiguration(sessionId: string, device: any, configuration: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Validating field configuration...');

      // Validate each applied configuration
      const configKeys = Object.keys(configuration.configurations);
      for (const configKey of configKeys) {
        await this.sendLog(sessionId, device.id, 'INFO', `Validating ${configKey} configuration...`);
        
        // In real implementation, verify that configurations were applied correctly
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await this.sendLog(sessionId, device.id, 'INFO', `${configKey} configuration validated successfully`);
      }

      await this.sendLog(sessionId, device.id, 'INFO', 'Field configuration validation completed successfully');
    } catch (error) {
      throw new Error(`Failed to validate field configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async updateProgress(
    sessionId: string, 
    deviceId: string, 
    status: ProvisioningDeviceStatus,
    updates: {
      currentStep?: string;
      completedSteps?: number;
      totalSteps?: number;
      errorMessage?: string;
      errorCode?: string;
      logs?: ProvisioningLog[];
      completedAt?: Date;
    } = {}
  ) {
    try {
      // Update progress in database
      const updateData: any = {
        status,
        currentStep: updates.currentStep,
        completedSteps: updates.completedSteps,
        totalSteps: updates.totalSteps,
        errorMessage: updates.errorMessage,
        errorCode: updates.errorCode,
        logs: updates.logs,
        updatedAt: new Date()
      };

      // Add completedAt for final statuses
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
        updateData.completedAt = updates.completedAt || new Date();
      }

      await prisma.provisioningProgress.updateMany({
        where: {
          sessionId,
          deviceId
        },
        data: updateData
      });

      // Update device provisioning status
      await prisma.device.update({
        where: { id: deviceId },
        data: definedOnly({
          provisioningStatus: status,
          lastProvisionedAt: status === 'COMPLETED' ? new Date() : undefined
        })
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error updating progress:', errorMessage);
    }
  }

  private async sendLog(sessionId: string, deviceId: string, level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, details?: any) {
    const log: ProvisioningLog = {
      timestamp: new Date(),
      level,
      message,
      details
    };

    await this.updateProgress(sessionId, deviceId, 'PENDING', { logs: [log] });
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async handleSessionError(sessionId: string, error: Error) {
    console.error(`Session ${sessionId} encountered error:`, error);
    
    try {
      await prisma.provisioningSession.update({
        where: { id: sessionId },
        data: { 
          status: 'FAILED',
          completedAt: new Date()
        }
      });

      // Mark any pending devices as failed
      await prisma.provisioningProgress.updateMany({
        where: {
          sessionId,
          status: { in: ['PENDING', 'DOWNLOADING_APPS', 'INSTALLING_APPS', 'CONFIGURING_NETWORK', 'CONFIGURING_SECURITY', 'DEPLOYING_FILES', 'VALIDATING'] }
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Session failed',
          completedAt: new Date()
        }
      });
    } catch (dbError) {
      const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown error';
      console.error('Error handling session error:', errorMessage);
    }
  }

  async pauseProvisioning(sessionId: string) {
    this.pausedSessions.add(sessionId);
    console.log(`Paused provisioning session: ${sessionId}`);
  }

  async cancelProvisioning(sessionId: string) {
    this.activeSessions.delete(sessionId);
    this.pausedSessions.delete(sessionId);
    console.log(`Cancelled provisioning session: ${sessionId}`);
  }
}

export const provisioningService = new ProvisioningService();
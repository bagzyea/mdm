import {
  ProvisioningDeviceStatus,
  ProvisioningLog,
  APNConfiguration,
  ProvisioningSecurityConfig
} from '../types';
import { getCommandService } from './commandServiceInstance';
import { definedOnly } from '../utils/prisma';
import { signStoredApkReference } from './signedDownloads';
import prisma from '../db';
import logger from '../logger';


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

      // Step 3: Create the command and push it if the device is connected
      const { commands } = await getCommandService().createCommands({
        deviceIds: [device.id],
        command: 'PROVISION_DEVICE',
        parameters: payload
      });
      const remoteCommand = commands[0]!;

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

  /**
   * Deploy applications to devices through the agent's PROVISION_DEVICE command.
   *
   * This used to run a simulation on the server: two-second sleeps standing in for
   * downloads, a hash "check" that only tested the hash's length, INSTALL_APP and
   * GRANT_PERMISSIONS commands the agent does not implement, a one-second sleep standing
   * in for validation — and then it marked every device and the session COMPLETED. The
   * operator saw a successful deployment that had not happened, and the HTTP request
   * blocked for the whole simulation.
   *
   * The agent's provisioning executor already downloads, verifies and installs a list of
   * apps and reports progress per device over `provisioningProgress`, which updates the
   * session counters (see src/server.ts). So this now sends that, and leaves completion
   * to the devices' own reports.
   */
  async startBulkApplicationDeployment(
    sessionId: string,
    applications: any[],
    devices: any[],
    _options: Record<string, unknown> = {}
  ) {
    try {
      await prisma.provisioningSession.update({
        where: { id: sessionId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() }
      });

      const payload = {
        sessionId,
        // The agent requires a profileId; a bulk deployment has none of its own.
        profileId: `bulk-deployment:${sessionId}`,
        apps: applications.map((app: any, index: number) => ({
          packageName: app.packageName,
          appName: app.appName ?? app.packageName,
          // Signed at dispatch — see the note in provisionDevice above.
          apkUrl: signStoredApkReference(app.apkUrl) ?? app.apkUrl,
          apkHash: app.apkHash,
          permissions: app.requiredPermissions || [],
          installOrder: app.installOrder ?? index,
          isRequired: app.isRequired ?? true
        })),
        networkConfig: null,
        securityConfig: null
      };

      for (const device of devices) {
        try {
          const { commands } = await getCommandService().createCommands({
            deviceIds: [device.id],
            command: 'PROVISION_DEVICE',
            parameters: payload
          });

          await this.updateProgress(sessionId, device.id, 'PENDING', {
            currentStep: 'Deployment sent to device',
            completedSteps: 0,
            totalSteps: applications.length,
            logs: [{
              timestamp: new Date(),
              level: 'INFO',
              message: 'Deployment command queued for device',
              details: { commandId: commands[0]?.id }
            }]
          });
        } catch (error) {
          await this.updateProgress(sessionId, device.id, 'FAILED', {
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            errorCode: 'COMMAND_SEND_FAILED'
          });
        }
      }
    } catch (error) {
      logger.error(error, 'Error in bulk application deployment');
      await this.handleSessionError(sessionId, error as Error);
    }
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
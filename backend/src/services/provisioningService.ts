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
import { refreshSessionCounters } from './provisioningOutcome';


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

  /**
   * Send a field configuration to devices as APPLY_FIELD_CONFIGURATION.
   *
   * This was a simulation: it sent nothing to any device, wrote log lines such as
   * "Configuring WiFi settings...", slept a second per section to "validate", and marked
   * every device and the session COMPLETED. Now the configuration goes to each tablet,
   * which applies what its privilege allows and reports every setting. The command's
   * result settles the device's progress (see CommandService.handleCommandResponse), and
   * the session completes only when every device has answered.
   */
  async applyFieldConfiguration(
    sessionId: string,
    configuration: any,
    devices: any[],
    _options: Record<string, unknown> = {}
  ) {
    try {
      await prisma.provisioningSession.update({
        where: { id: sessionId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() }
      });

      const parameters = {
        sessionId,
        configurationId: configuration.id,
        configurations: configuration.configurations ?? {},
        dataCollectionRules: configuration.dataCollectionRules ?? null
      };

      for (const device of devices) {
        if (configuration.deviceModels?.length && !configuration.deviceModels.includes(device.model)) {
          await this.updateProgress(sessionId, device.id, 'FAILED', {
            errorMessage: `Device model ${device.model} is not covered by this field configuration`,
            errorCode: 'MODEL_NOT_SUPPORTED'
          });
          continue;
        }

        try {
          const { commands } = await getCommandService().createCommands({
            deviceIds: [device.id],
            command: 'APPLY_FIELD_CONFIGURATION',
            parameters
          });
          await this.updateProgress(sessionId, device.id, 'PENDING', {
            currentStep: 'Configuration sent to device; waiting for its report',
            logs: [{
              timestamp: new Date(),
              level: 'INFO',
              message: 'APPLY_FIELD_CONFIGURATION queued',
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

      await refreshSessionCounters(sessionId);
    } catch (error) {
      logger.error(error, 'Error applying field configuration');
      await this.handleSessionError(sessionId, error as Error);
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
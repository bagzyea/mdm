import { PrismaClient } from '@prisma/client';
import { dataFolderService } from './dataFolderService';
import { 
  ProvisioningDeviceStatus,
  ProvisioningLog
} from '../types';

const prisma = new PrismaClient();

export interface EnhancedProvisioningOptions {
  parallelLimit?: number;
  retryAttempts?: number;
  skipValidation?: boolean;
  deviceLocation?: {
    district: string;
    region: string;
  };
  installationTimeout?: number; // in milliseconds
}

export interface APKInstallationPlan {
  apkId: string;
  apk: {
    packageName: string;
    appName: string;
    filePath: string;
    fileHash: string;
    permissions: string[];
    version: string;
  };
  selectedDataFolders: string[];
  dataFolderMappings: {
    folderId: string;
    folderName: string;
    targetPath: string;
    size: number;
  }[];
  installOrder: number;
  isRequired: boolean;
  customConfiguration?: any;
}

export class EnhancedProvisioningService {
  private activeSessions = new Map<string, boolean>();
  private pausedSessions = new Set<string>();

  /**
   * Start enhanced provisioning with flexible APK selection
   */
  async startEnhancedProvisioning(
    sessionId: string,
    options: EnhancedProvisioningOptions = {}
  ) {
    const {
      parallelLimit = 3,
      retryAttempts = 3,
      skipValidation = false,
      deviceLocation,
      installationTimeout = 300000 // 5 minutes default
    } = options;

    this.activeSessions.set(sessionId, true);

    try {
      // Get session with enhanced APK information
      const session = await this.getEnhancedSessionDetails(sessionId);
      
      if (!session) {
        throw new Error(`Provisioning session ${sessionId} not found`);
      }

      // Create installation plans for each device
      const devices = await this.getSessionDevices(sessionId);
      const batches = this.createBatches(devices, parallelLimit);

      for (const batch of batches) {
        // Check if session is still active
        if (!this.activeSessions.get(sessionId) || this.pausedSessions.has(sessionId)) {
          break;
        }

        // Process batch in parallel
        await Promise.all(
          batch.map(device =>
            this.provisionDeviceWithEnhancedAPKs(
              sessionId,
              device,
              session.installationPlans || [],
              {
                retryAttempts,
                skipValidation,
                deviceLocation: deviceLocation,
                installationTimeout
              }
            ).catch(error => {
              console.error(`Error provisioning device ${device.deviceId}:`, error);
              this.updateProgress(sessionId, device.id, 'FAILED', {
                errorMessage: error.message,
                errorCode: 'ENHANCED_PROVISIONING_ERROR'
              });
            })
          )
        );
      }

      // Update session status
      await prisma.provisioningSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error in enhanced provisioning session:', error);
      await this.handleSessionError(sessionId, error as Error);
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Provision a device with enhanced APK selection and data folder deployment
   */
  private async provisionDeviceWithEnhancedAPKs(
    sessionId: string,
    device: any,
    installationPlans: APKInstallationPlan[],
    options: {
      retryAttempts: number;
      skipValidation: boolean;
      deviceLocation?: { district: string; region: string };
      installationTimeout: number;
    }
  ) {
    const { retryAttempts, skipValidation, deviceLocation } = options;
    let attempt = 0;

    // Sort installation plans by install order
    const sortedPlans = [...installationPlans].sort((a, b) => a.installOrder - b.installOrder);

    while (attempt < retryAttempts) {
      try {
        await this.updateProgress(sessionId, device.id, 'PENDING', {
          currentStep: `Starting enhanced provisioning (attempt ${attempt + 1})`,
          totalSteps: this.calculateTotalSteps(sortedPlans),
          completedSteps: 0
        });

        // Step 1: Pre-installation validation
        if (!skipValidation) {
          await this.performPreInstallationValidation(sessionId, device, sortedPlans, deviceLocation);
        }

        let currentStep = 1;

        // Step 2: Process each APK installation plan
        for (const plan of sortedPlans) {
          await this.processAPKInstallationPlan(sessionId, device, plan, deviceLocation, currentStep, sortedPlans.length);
          currentStep++;
        }

        // Step 3: Post-installation validation
        await this.performPostInstallationValidation(sessionId, device, sortedPlans);

        // Step 4: Final configuration and optimization
        await this.performFinalConfiguration(sessionId, device, sortedPlans);

        // Success
        await this.updateProgress(sessionId, device.id, 'COMPLETED', {
          currentStep: 'Enhanced provisioning completed successfully',
          completedSteps: this.calculateTotalSteps(sortedPlans),
          totalSteps: this.calculateTotalSteps(sortedPlans),
          completedAt: new Date()
        });

        return; // Success, exit retry loop

      } catch (error) {
        attempt++;
        const isLastAttempt = attempt >= retryAttempts;

        console.error(`Enhanced provisioning attempt ${attempt} failed for device ${device.deviceId}:`, error);

        if (isLastAttempt) {
          await this.updateProgress(sessionId, device.id, 'FAILED', {
            currentStep: 'Enhanced provisioning failed',
            errorMessage: (error as Error).message,
            errorCode: 'ENHANCED_PROVISIONING_FAILED',
            completedAt: new Date()
          });
          throw error;
        } else {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 5000 * Math.pow(2, attempt - 1)));
        }
      }
    }
  }

  /**
   * Process individual APK installation plan
   */
  private async processAPKInstallationPlan(
    sessionId: string,
    device: any,
    plan: APKInstallationPlan,
    deviceLocation: { district: string; region: string } | undefined,
    currentStep: number,
    totalApks: number
  ) {
    await this.sendLog(sessionId, device.id, 'INFO', `Processing APK: ${plan.apk.appName}`);

    // Update progress
    await this.updateProgress(sessionId, device.id, 'DOWNLOADING_APPS', {
      currentStep: `Installing ${plan.apk.appName} (${currentStep}/${totalApks})`,
      completedSteps: (currentStep - 1) * 3, // Each APK has 3 sub-steps
      totalSteps: totalApks * 3
    });

    try {
      // Sub-step 1: Install APK
      await this.installAPK(sessionId, device, plan);
      
      await this.updateProgress(sessionId, device.id, 'INSTALLING_APPS', {
        currentStep: `Installing ${plan.apk.appName} - APK installed`,
        completedSteps: (currentStep - 1) * 3 + 1
      });

      // Sub-step 2: Deploy data folders
      if (plan.selectedDataFolders.length > 0) {
        await this.deployDataFoldersForAPK(sessionId, device, plan, deviceLocation);
      }

      await this.updateProgress(sessionId, device.id, 'DEPLOYING_FILES', {
        currentStep: `Installing ${plan.apk.appName} - Data deployed`,
        completedSteps: (currentStep - 1) * 3 + 2
      });

      // Sub-step 3: Configure and verify
      await this.configureAPK(sessionId, device, plan);

      await this.updateProgress(sessionId, device.id, 'CONFIGURING_NETWORK', {
        currentStep: `Installing ${plan.apk.appName} - Configured`,
        completedSteps: currentStep * 3
      });

      await this.sendLog(sessionId, device.id, 'INFO', `Successfully processed APK: ${plan.apk.appName}`);

    } catch (error) {
      throw new Error(`Failed to process APK ${plan.apk.appName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Install APK on device
   */
  private async installAPK(sessionId: string, device: any, plan: APKInstallationPlan) {
    await this.sendLog(sessionId, device.id, 'INFO', `Installing APK: ${plan.apk.packageName}`);

    // Verify APK integrity
    if (plan.apk.fileHash) {
      await this.verifyAPKIntegrity(plan.apk.filePath, plan.apk.fileHash);
    }

    // Send installation command
    const installCommand = {
      type: 'INSTALL_APK_ENHANCED',
      parameters: {
        packageName: plan.apk.packageName,
        apkPath: plan.apk.filePath,
        version: plan.apk.version,
        permissions: plan.apk.permissions,
        isRequired: plan.isRequired,
        customConfiguration: plan.customConfiguration || {}
      }
    };

    const result = await this.sendCommandToDevice(device.id, installCommand);

    if (!result.success) {
      throw new Error(`Failed to install APK ${plan.apk.appName}: ${result.message}`);
    }

    // Grant required permissions
    if (plan.apk.permissions.length > 0) {
      await this.grantAPKPermissions(sessionId, device, plan);
    }
  }

  /**
   * Deploy data folders for an APK
   */
  private async deployDataFoldersForAPK(
    sessionId: string,
    device: any,
    plan: APKInstallationPlan,
    deviceLocation?: { district: string; region: string }
  ) {
    if (plan.selectedDataFolders.length === 0) {
      return;
    }

    await this.sendLog(sessionId, device.id, 'INFO', `Deploying ${plan.selectedDataFolders.length} data folders for ${plan.apk.appName}`);

    try {
      const deploymentResult = await dataFolderService.deployDataFolders(
        device.id,
        plan.apk.packageName,
        plan.selectedDataFolders,
        deviceLocation
      );

      if (!deploymentResult.success) {
        const errorDetails = deploymentResult.failedFolders
          .map(f => `${f.folder}: ${f.error}`)
          .join('; ');
        
        throw new Error(`Data folder deployment failed: ${errorDetails}`);
      }

      await this.sendLog(sessionId, device.id, 'INFO', 
        `Successfully deployed ${deploymentResult.deployedFolders.length} data folders ` +
        `(${(deploymentResult.totalSize / 1024 / 1024).toFixed(2)}MB) in ${deploymentResult.deploymentTime}ms`
      );

    } catch (error) {
      throw new Error(`Data folder deployment failed for ${plan.apk.appName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Configure APK after installation
   */
  private async configureAPK(sessionId: string, device: any, plan: APKInstallationPlan) {
    await this.sendLog(sessionId, device.id, 'INFO', `Configuring ${plan.apk.appName}`);

    // Send configuration command
    const configCommand = {
      type: 'CONFIGURE_APK',
      parameters: {
        packageName: plan.apk.packageName,
        configuration: plan.customConfiguration || {},
        dataFolderMappings: plan.dataFolderMappings
      }
    };

    const result = await this.sendCommandToDevice(device.id, configCommand);

    if (!result.success) {
      throw new Error(`Failed to configure APK ${plan.apk.appName}: ${result.message}`);
    }

    // Verify configuration
    await this.verifyAPKConfiguration(sessionId, device, plan);
  }

  /**
   * Pre-installation validation
   */
  private async performPreInstallationValidation(
    sessionId: string,
    device: any,
    plans: APKInstallationPlan[],
    deviceLocation?: { district: string; region: string }
  ) {
    await this.updateProgress(sessionId, device.id, 'VALIDATING', {
      currentStep: 'Performing pre-installation validation'
    });

    // Calculate total storage requirements
    const totalAPKSize = plans.reduce((sum, plan) => {
      const apkSize = this.estimateAPKSize(plan.apk.filePath);
      const dataSize = plan.dataFolderMappings.reduce((dataSum, mapping) => dataSum + mapping.size, 0);
      return sum + apkSize + dataSize;
    }, 0);

    // Check device storage
    if (device.availableStorage && totalAPKSize > device.availableStorage) {
      throw new Error(
        `Insufficient storage. Required: ${(totalAPKSize / 1024 / 1024).toFixed(2)}MB, ` +
        `Available: ${(device.availableStorage / 1024 / 1024).toFixed(2)}MB`
      );
    }

    // Validate each APK plan
    for (const plan of plans) {
      if (plan.selectedDataFolders.length > 0) {
        const validation = await dataFolderService.validateDataFolderSelection(
          plan.apkId,
          plan.selectedDataFolders,
          {
            availableStorage: device.availableStorage || 0,
            model: device.model,
            district: deviceLocation?.district
          }
        );

        if (!validation.isValid) {
          throw new Error(`Data folder validation failed for ${plan.apk.appName}: ${validation.errors.join(', ')}`);
        }
      }
    }

    await this.sendLog(sessionId, device.id, 'INFO', 'Pre-installation validation completed successfully');
  }

  /**
   * Post-installation validation
   */
  private async performPostInstallationValidation(
    sessionId: string,
    device: any,
    plans: APKInstallationPlan[]
  ) {
    await this.updateProgress(sessionId, device.id, 'VALIDATING', {
      currentStep: 'Performing post-installation validation'
    });

    for (const plan of plans) {
      // Verify APK is installed
      const verifyCommand = {
        type: 'VERIFY_APK_INSTALLATION',
        parameters: {
          packageName: plan.apk.packageName,
          expectedVersion: plan.apk.version
        }
      };

      const result = await this.sendCommandToDevice(device.id, verifyCommand);

      if (!result.success) {
        throw new Error(`APK verification failed for ${plan.apk.appName}: ${result.message}`);
      }
    }

    await this.sendLog(sessionId, device.id, 'INFO', 'Post-installation validation completed successfully');
  }

  /**
   * Final configuration and optimization
   */
  private async performFinalConfiguration(
    sessionId: string,
    device: any,
    plans: APKInstallationPlan[]
  ) {
    await this.updateProgress(sessionId, device.id, 'CONFIGURING_SECURITY', {
      currentStep: 'Performing final configuration'
    });

    // Optimize device for installed applications
    const optimizeCommand = {
      type: 'OPTIMIZE_DEVICE',
      parameters: {
        installedPackages: plans.map(p => p.apk.packageName),
        clearCache: true,
        optimizeStorage: true
      }
    };

    const result = await this.sendCommandToDevice(device.id, optimizeCommand);

    if (!result.success) {
      console.warn(`Device optimization failed: ${result.message}`);
    }

    await this.sendLog(sessionId, device.id, 'INFO', 'Final configuration completed');
  }

  // Helper methods
  private async getEnhancedSessionDetails(sessionId: string) {
    const session = await prisma.provisioningSession.findUnique({
      where: { id: sessionId },
      include: {
        progress: {
          include: {
            device: true
          }
        }
      }
    });

    if (!session) return null;

    // Get installation plans from session configuration or profile
    const installationPlans = await this.buildInstallationPlans(sessionId);

    return {
      ...session,
      installationPlans
    };
  }

  private async buildInstallationPlans(sessionId: string): Promise<APKInstallationPlan[]> {
    // Get provisioning apps for this session
    const session = await prisma.provisioningSession.findUnique({
      where: { id: sessionId },
      include: {
        profile: {
          include: {
            applications: {
              include: {
                apk: {
                  include: {
                    dataFolders: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!session || !session.profileId) {
      return [];
    }

    const profile = await prisma.provisioningProfile.findUnique({
      where: { id: session.profileId },
      include: {
        applications: {
          include: {
            apk: {
              include: {
                dataFolders: true
              }
            }
          }
        }
      }
    });

    if (!profile) {
      return [];
    }

    const plans: APKInstallationPlan[] = [];

    for (const provApp of profile.applications) {
      // Skip apps that don't have APK registry entry
      if (!provApp.apk) {
        continue;
      }

      const dataFolderMappings = provApp.selectedDataFolders
        .map((folderId: string) => {
          const folder = provApp.apk?.dataFolders.find(f => f.id === folderId);
          return folder ? {
            folderId: folder.id,
            folderName: folder.name,
            targetPath: folder.targetPath,
            size: Number(folder.folderSize || 0)
          } : null;
        })
        .filter(Boolean) as any[];

      plans.push({
        apkId: provApp.apkId || '',
        apk: {
          packageName: provApp.apk.packageName,
          appName: provApp.apk.appName,
          filePath: provApp.apk.filePath,
          fileHash: provApp.apk.fileHash,
          permissions: provApp.apk.permissions,
          version: provApp.apk.version
        },
        selectedDataFolders: provApp.selectedDataFolders,
        dataFolderMappings,
        installOrder: provApp.installOrder,
        isRequired: provApp.isRequired,
        customConfiguration: provApp.customDataMappings
      });
    }

    return plans;
  }

  private calculateTotalSteps(plans: APKInstallationPlan[]): number {
    return plans.length * 3 + 2; // 3 steps per APK + pre/post validation
  }

  private estimateAPKSize(filePath: string): number {
    // TODO: Implement actual file size calculation
    return 50 * 1024 * 1024; // Default 50MB estimate
  }

  // ... (include other helper methods from previous implementation)
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async getSessionDevices(sessionId: string) {
    const session = await prisma.provisioningSession.findUnique({
      where: { id: sessionId },
      include: {
        progress: {
          include: {
            device: true
          }
        }
      }
    });

    return session?.progress.map(p => p.device) || [];
  }

  private async updateProgress(
    sessionId: string,
    deviceId: string,
    status: ProvisioningDeviceStatus,
    updates: any = {}
  ) {
    // Implementation similar to original provisioning service
    console.log(`Updating progress for session ${sessionId}, device ${deviceId}: ${status}`);
  }

  private async sendLog(sessionId: string, deviceId: string, level: string, message: string) {
    console.log(`[${level}] Session ${sessionId}, Device ${deviceId}: ${message}`);
  }

  private async handleSessionError(sessionId: string, error: Error) {
    console.error(`Session ${sessionId} error:`, error);
  }

  private async sendCommandToDevice(deviceId: string, command: any) {
    // Mock implementation - replace with actual command service
    console.log(`Sending command to device ${deviceId}:`, command);
    return { success: true, message: 'Command executed successfully' };
  }

  private async verifyAPKIntegrity(filePath: string, expectedHash: string) {
    // TODO: Implement hash verification
    console.log(`Verifying APK integrity: ${filePath}`);
  }

  private async grantAPKPermissions(sessionId: string, device: any, plan: APKInstallationPlan) {
    // TODO: Implement permission granting
    console.log(`Granting permissions for ${plan.apk.packageName}`);
  }

  private async verifyAPKConfiguration(sessionId: string, device: any, plan: APKInstallationPlan) {
    // TODO: Implement configuration verification
    console.log(`Verifying configuration for ${plan.apk.packageName}`);
  }
}

export const enhancedProvisioningService = new EnhancedProvisioningService();
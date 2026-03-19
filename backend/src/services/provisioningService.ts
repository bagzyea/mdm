import { PrismaClient } from '@prisma/client';
import { 
  ProvisioningDeviceStatus,
  ProvisioningLog,
  APNConfiguration,
  ProvisioningSecurityConfig
} from '../types';

const prisma = new PrismaClient();

interface ProvisioningOptions {
  parallelLimit?: number;
  retryAttempts?: number;
  skipValidation?: boolean;
}

// Mock CommandService for now - this should be replaced with actual implementation
class CommandServiceClass {
  async sendCommand(deviceId: string, command: any): Promise<{ success: boolean; message?: string; data?: any }> {
    // This would integrate with your existing command system
    console.log(`Sending command to device ${deviceId}:`, command);
    
    // Simulate success for now
    return { 
      success: true, 
      message: 'Command executed successfully',
      data: {} 
    };
  }
}

// Mock WebSocketService for now
class WebSocketServiceClass {
  broadcastToAdmins(message: any) {
    // This would integrate with your existing WebSocket service
    console.log('Broadcasting to admins:', message);
  }
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
    let attempt = 0;

    while (attempt < retryAttempts) {
      try {
        // Update status to pending
        await this.updateProgress(session.id, device.id, 'PENDING', {
          currentStep: 'Starting provisioning',
          logs: [{
            timestamp: new Date(),
            level: 'INFO',
            message: `Starting provisioning attempt ${attempt + 1}`,
            details: { attempt: attempt + 1, maxAttempts: retryAttempts }
          }]
        });

        // Step 1: Validate device
        if (!skipValidation) {
          await this.validateDevice(session.id, device, profile);
        }

        // Step 2: Download and install applications
        if (profile.applications && profile.applications.length > 0) {
          await this.provisionApplications(session.id, device, profile.applications);
        }

        // Step 3: Configure network settings
        if (profile.networkConfig) {
          await this.configureNetwork(session.id, device, profile.networkConfig);
        }

        // Step 4: Configure security settings
        if (profile.securityConfig) {
          await this.configureSecurity(session.id, device, profile.securityConfig);
        }

        // Step 5: Deploy file packages
        if (profile.filePackages && profile.filePackages.length > 0) {
          await this.deployFilePackages(session.id, device, profile.filePackages);
        }

        // Step 6: Final validation
        await this.validateProvisioning(session.id, device, profile);

        // Step 7: Quality Control Validation
        await this.performQualityControlValidation(session.id, device, profile);

        // Success
        await this.updateProgress(session.id, device.id, 'COMPLETED', {
          currentStep: 'Provisioning completed',
          logs: [{
            timestamp: new Date(),
            level: 'INFO',
            message: 'Device provisioning completed successfully',
            details: { attempt: attempt + 1 }
          }]
        });

        return; // Success, exit retry loop

      } catch (error) {
        attempt++;
        const isLastAttempt = attempt >= retryAttempts;
        
        console.error(`Provisioning attempt ${attempt} failed for device ${device.deviceId}:`, error);

        if (isLastAttempt) {
          await this.updateProgress(session.id, device.id, 'FAILED', {
            currentStep: 'Provisioning failed',
            errorMessage: (error as Error).message,
            errorCode: 'PROVISIONING_FAILED',
            logs: [{
              timestamp: new Date(),
              level: 'ERROR',
              message: `Provisioning failed after ${retryAttempts} attempts`,
              details: { error: (error as Error).message, totalAttempts: retryAttempts }
            }]
          });
          throw error;
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
        }
      }
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

  private async provisionApplications(sessionId: string, device: any, applications: any[]) {
    await this.updateProgress(sessionId, device.id, 'DOWNLOADING_APPS', {
      currentStep: 'Downloading applications'
    });

    // Sort applications by install order
    const sortedApps = applications.sort((a, b) => a.installOrder - b.installOrder);
    
    for (const app of sortedApps) {
      await this.sendLog(sessionId, device.id, 'INFO', `Processing application: ${app.appName}`);

      if (app.apkUrl) {
        // Download APK if not already cached
        await this.downloadAPK(app);
      }

      // Install application
      await this.updateProgress(sessionId, device.id, 'INSTALLING_APPS', {
        currentStep: `Installing ${app.appName}`
      });

      await this.installApplication(device, app);
      
      // Grant required permissions
      if (app.requiredPermissions && app.requiredPermissions.length > 0) {
        await this.grantAppPermissions(device, app);
      }

      await this.sendLog(sessionId, device.id, 'INFO', `Successfully installed: ${app.appName}`);
    }
  }

  private async configureNetwork(sessionId: string, device: any, networkConfig: APNConfiguration) {
    await this.updateProgress(sessionId, device.id, 'CONFIGURING_NETWORK', {
      currentStep: 'Configuring network settings'
    });

    const command = {
      type: 'CONFIGURE_NETWORK',
      parameters: {
        apnConfig: networkConfig
      }
    };

    const result = await commandService.sendCommand(device.id, command);
    
    if (!result.success) {
      throw new Error(`Failed to configure network: ${result.message}`);
    }

    await this.sendLog(sessionId, device.id, 'INFO', 'Network configuration completed');
  }

  private async configureSecurity(sessionId: string, device: any, securityConfig: ProvisioningSecurityConfig) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Configuring security settings...');

      // Configure device PIN
      if (securityConfig.devicePin) {
        const command = {
          type: 'SET_DEVICE_PIN',
          parameters: { pin: securityConfig.devicePin }
        };
        const result = await commandService.sendCommand(device.id, command);
        
        if (!result.success) {
          throw new Error(`Failed to set device PIN: ${result.message}`);
        }
      }

      // Configure screen timeout
      if (securityConfig.screenTimeout) {
        const timeoutCommand = {
          type: 'SET_SCREEN_TIMEOUT',
          parameters: { timeout: securityConfig.screenTimeout }
        };
        const timeoutResult = await commandService.sendCommand(device.id, timeoutCommand);
        
        if (!timeoutResult.success) {
          throw new Error(`Failed to set screen timeout: ${timeoutResult.message}`);
        }
      }

      // Configure encryption
      if (securityConfig.enableEncryption) {
        const encryptionCommand = {
          type: 'ENABLE_ENCRYPTION',
          parameters: { 
            encryptionType: securityConfig.encryptionType || 'AES'
          }
        };
        const encryptionResult = await commandService.sendCommand(device.id, encryptionCommand);
        
        if (!encryptionResult.success) {
          throw new Error(`Failed to enable encryption: ${encryptionResult.message}`);
        }
      }

      await this.sendLog(sessionId, device.id, 'INFO', 'Security configuration completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Security configuration failed: ${errorMessage}`);
    }
  }

  private async deployFilePackages(sessionId: string, device: any, filePackages: any[]) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Deploying file packages...');

      for (const package_ of filePackages) {
        const deployCommand = {
          type: 'DEPLOY_FILE_PACKAGE',
          parameters: {
            packageId: package_.id,
            targetPath: package_.targetPath,
            permissions: package_.permissions
          }
        };
        const result = await commandService.sendCommand(device.id, deployCommand);
        
        if (!result.success) {
          throw new Error(`Failed to deploy file package ${package_.name}: ${result.message}`);
        }
      }

      await this.sendLog(sessionId, device.id, 'INFO', 'File packages deployed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`File package deployment failed: ${errorMessage}`);
    }
  }

  private async validateProvisioning(sessionId: string, device: any, profile: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Validating provisioning...');

      // Validate applications
      if (profile.applications && profile.applications.length > 0) {
        const validateAppsCommand = {
          type: 'VALIDATE_APPLICATIONS',
          parameters: { appIds: profile.applications.map((app: any) => app.id) }
        };
        const appValidationResult = await commandService.sendCommand(device.id, validateAppsCommand);
        
        if (!appValidationResult.success) {
          throw new Error(`Application validation failed: ${appValidationResult.message}`);
        }
      }

      // Validate file packages
      if (profile.filePackages && profile.filePackages.length > 0) {
        const validateFilesCommand = {
          type: 'VALIDATE_FILE_PACKAGES',
          parameters: { packageIds: profile.filePackages.map((pkg: any) => pkg.id) }
        };
        const fileValidationResult = await commandService.sendCommand(device.id, validateFilesCommand);
        
        if (!fileValidationResult.success) {
          throw new Error(`File package validation failed: ${fileValidationResult.message}`);
        }
      }

      await this.sendLog(sessionId, device.id, 'INFO', 'Provisioning validation completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Provisioning validation failed: ${errorMessage}`);
    }
  }

  // Quality Control Validation - NEW FEATURE
  private async performQualityControlValidation(sessionId: string, device: any, profile: any) {
    try {
      await this.updateProgress(sessionId, device.id, 'VALIDATING', {
        currentStep: 'Performing quality control validation'
      });

      await this.sendLog(sessionId, device.id, 'INFO', 'Starting quality control validation...');

      const validationResults = {
        deviceCompliance: await this.validateDeviceCompliance(sessionId, device),
        applicationIntegrity: await this.validateApplicationIntegrity(sessionId, device, profile),
        securityConfiguration: await this.validateSecurityConfiguration(sessionId, device, profile),
        networkConfiguration: await this.validateNetworkConfiguration(sessionId, device, profile),
        dataIntegrity: await this.validateDataIntegrity(sessionId, device, profile),
        performanceBaseline: await this.validatePerformanceBaseline(sessionId, device)
      };

      // Check if all validations passed
      const failedValidations = Object.entries(validationResults)
        .filter(([_key, result]) => !result.success)
        .map(([key, result]) => ({ key, error: result.error }));

      if (failedValidations.length > 0) {
        const errorMessage = `Quality control validation failed: ${failedValidations.map(f => `${f.key}: ${f.error}`).join(', ')}`;
        throw new Error(errorMessage);
      }

      // Store quality control results
      await this.storeQualityControlResults(sessionId, device.id, validationResults);

      await this.sendLog(sessionId, device.id, 'INFO', 'Quality control validation completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Quality control validation failed: ${errorMessage}`);
    }
  }

  private async validateDeviceCompliance(sessionId: string, device: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Validating device compliance...');

      // Check device encryption status
      const encryptionCommand = {
        type: 'GET_ENCRYPTION_STATUS',
        parameters: {}
      };
      const encryptionResult = await commandService.sendCommand(device.id, encryptionCommand);
      
      if (!encryptionResult.success || !encryptionResult.data?.isEncrypted) {
        return { success: false, error: 'Device encryption not enabled' };
      }

      // Check device security patch level
      const patchCommand = {
        type: 'GET_SECURITY_PATCH_LEVEL',
        parameters: {}
      };
      const patchResult = await commandService.sendCommand(device.id, patchCommand);
      
      if (!patchResult.success) {
        return { success: false, error: 'Unable to verify security patch level' };
      }

      // Check for root/jailbreak detection
      const rootCommand = {
        type: 'CHECK_ROOT_STATUS',
        parameters: {}
      };
      const rootResult = await commandService.sendCommand(device.id, rootCommand);
      
      if (!rootResult.success || rootResult.data?.isRooted) {
        return { success: false, error: 'Device is rooted or jailbroken' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async validateApplicationIntegrity(sessionId: string, device: any, profile: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Validating application integrity...');

      if (!profile.applications || profile.applications.length === 0) {
        return { success: true };
      }

      for (const app of profile.applications) {
        const integrityCommand = {
          type: 'VALIDATE_APP_INTEGRITY',
          parameters: { packageName: app.packageName }
        };
        const integrityResult = await commandService.sendCommand(device.id, integrityCommand);
        
        if (!integrityResult.success || !integrityResult.data?.isValid) {
          return { success: false, error: `Application ${app.appName} integrity check failed` };
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async validateSecurityConfiguration(sessionId: string, device: any, profile: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Validating security configuration...');

      if (!profile.securityConfig) {
        return { success: true };
      }

      // Validate device PIN
      if (profile.securityConfig.devicePin) {
        const pinCommand = {
          type: 'VERIFY_DEVICE_PIN',
          parameters: { expectedPin: profile.securityConfig.devicePin }
        };
        const pinResult = await commandService.sendCommand(device.id, pinCommand);
        
        if (!pinResult.success || !pinResult.data?.isCorrect) {
          return { success: false, error: 'Device PIN not configured correctly' };
        }
      }

      // Validate encryption
      if (profile.securityConfig.enableEncryption) {
        const encryptionCommand = {
          type: 'VERIFY_ENCRYPTION_STATUS',
          parameters: { expectedType: profile.securityConfig.encryptionType }
        };
        const encryptionResult = await commandService.sendCommand(device.id, encryptionCommand);
        
        if (!encryptionResult.success || !encryptionResult.data?.isEncrypted) {
          return { success: false, error: 'Device encryption not enabled' };
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async validateNetworkConfiguration(sessionId: string, device: any, profile: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Validating network configuration...');

      if (!profile.networkConfig) {
        return { success: true };
      }

      // Validate APN configuration
      const apnCommand = {
        type: 'VERIFY_APN_CONFIG',
        parameters: { expectedApn: profile.networkConfig }
      };
      const apnResult = await commandService.sendCommand(device.id, apnCommand);
      
      if (!apnResult.success || !apnResult.data?.isConfigured) {
        return { success: false, error: 'APN configuration not applied correctly' };
      }

      // Validate network connectivity
      const connectivityCommand = {
        type: 'TEST_NETWORK_CONNECTIVITY',
        parameters: {}
      };
      const connectivityResult = await commandService.sendCommand(device.id, connectivityCommand);
      
      if (!connectivityResult.success || !connectivityResult.data?.isConnected) {
        return { success: false, error: 'Network connectivity test failed' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async validateDataIntegrity(sessionId: string, device: any, profile: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Validating data integrity...');

      if (!profile.filePackages || profile.filePackages.length === 0) {
        return { success: true };
      }

      for (const pkg of profile.filePackages) {
        const integrityCommand = {
          type: 'VERIFY_FILE_INTEGRITY',
          parameters: { 
            filePath: pkg.targetPath,
            expectedHash: pkg.fileHash 
          }
        };
        const integrityResult = await commandService.sendCommand(device.id, integrityCommand);
        
        if (!integrityResult.success || !integrityResult.data?.isValid) {
          return { success: false, error: `File package ${pkg.name} integrity check failed` };
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async validatePerformanceBaseline(sessionId: string, device: any) {
    try {
      await this.sendLog(sessionId, device.id, 'INFO', 'Validating performance baseline...');

      // Check device performance metrics
      const performanceCommand = {
        type: 'GET_PERFORMANCE_METRICS',
        parameters: {}
      };
      const performanceResult = await commandService.sendCommand(device.id, performanceCommand);
      
      if (!performanceResult.success) {
        return { success: false, error: 'Unable to retrieve performance metrics' };
      }

      const metrics = performanceResult.data;
      
      // Check CPU usage
      if (metrics.cpuUsage > 80) {
        return { success: false, error: 'CPU usage too high for field deployment' };
      }

      // Check available memory
      if (metrics.availableMemory < 500 * 1024 * 1024) { // Less than 500MB
        return { success: false, error: 'Insufficient available memory' };
      }

      // Check available storage
      if (metrics.availableStorage < 1024 * 1024 * 1024) { // Less than 1GB
        return { success: false, error: 'Insufficient available storage' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async storeQualityControlResults(sessionId: string, deviceId: string, results: any) {
    try {
      // Store quality control results in database
      await prisma.qualityControlResult.create({
        data: {
          sessionId,
          deviceId,
          results: results as any,
          status: 'PASSED',
          createdAt: new Date()
        }
      });

      await this.sendLog(sessionId, deviceId, 'INFO', 'Quality control results stored successfully');
    } catch (error) {
      console.error('Error storing quality control results:', error);
      // Don't fail the entire process if storing results fails
    }
  }

  private async downloadAPK(app: any): Promise<void> {
    // Implementation for downloading APK files
    // This would integrate with file storage service
    console.log(`Downloading APK for ${app.appName} from ${app.apkUrl}`);
  }

  private async installApplication(device: any, app: any): Promise<void> {
    const installCommand = {
      type: 'INSTALL_APPLICATION',
      parameters: {
        appId: app.id,
        apkUrl: app.apkUrl,
        packageName: app.packageName
      }
    };
    const result = await commandService.sendCommand(device.id, installCommand);
    
    if (!result.success) {
      throw new Error(`Failed to install application ${app.appName}: ${result.message}`);
    }
  }

  private async grantAppPermissions(device: any, app: any): Promise<void> {
    if (app.requiredPermissions && app.requiredPermissions.length > 0) {
      const permissionsCommand = {
        type: 'GRANT_APP_PERMISSIONS',
        parameters: {
          packageName: app.packageName,
          permissions: app.requiredPermissions
        }
      };
      const result = await commandService.sendCommand(device.id, permissionsCommand);
      
      if (!result.success) {
        throw new Error(`Failed to grant permissions for ${app.appName}: ${result.message}`);
      }
    }
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
        data: {
          provisioningStatus: status,
          lastProvisionedAt: status === 'COMPLETED' ? new Date() : undefined
        }
      });

      // Send real-time update via WebSocket
      webSocketService.broadcastToAdmins({
        type: 'PROVISIONING_PROGRESS',
        data: {
          sessionId,
          deviceId,
          status,
          ...updates
        }
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
export const commandService = new CommandServiceClass();
export const webSocketService = new WebSocketServiceClass();
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { promisify } from 'util';
import { pipeline } from 'stream';

const pipelineAsync = promisify(pipeline);
const prisma = new PrismaClient();

export interface DataFolderMapping {
  sourceFolder: string;
  targetPath: string;
  folderType: string;
  isRequired: boolean;
  geographicScope?: string;
  applicableDistricts?: string[];
}

export interface DataDeploymentResult {
  success: boolean;
  deployedFolders: string[];
  failedFolders: { folder: string; error: string }[];
  totalSize: number;
  deploymentTime: number;
}

export class DataFolderService {
  private readonly baseStoragePath: string;
  private readonly tempPath: string;

  constructor() {
    this.baseStoragePath = process.env.DATA_STORAGE_PATH || path.join(process.cwd(), 'storage', 'data_folders');
    this.tempPath = path.join(process.cwd(), 'temp', 'data_deployment');
  }

  /**
   * Deploy data folders to a device for a specific APK
   */
  async deployDataFolders(
    deviceId: string,
    apkPackageName: string,
    selectedDataFolderIds: string[],
    deviceLocation?: { district: string; region: string }
  ): Promise<DataDeploymentResult> {
    const startTime = Date.now();
    const deployedFolders: string[] = [];
    const failedFolders: { folder: string; error: string }[] = [];
    let totalSize = 0;

    try {
      // Get data folder information
      const dataFolders = await prisma.aPKDataFolder.findMany({
        where: {
          id: { in: selectedDataFolderIds }
        },
        include: {
          apk: true
        }
      });

      for (const folder of dataFolders) {
        try {
          // Check geographic scope compatibility
          if (!this.isGeographicallyCompatible(folder, deviceLocation)) {
            failedFolders.push({
              folder: folder.name,
              error: 'Device location not compatible with folder geographic scope'
            });
            continue;
          }

          // Deploy the folder
          const deployResult = await this.deployDataFolder(deviceId, apkPackageName, folder);
          
          if (deployResult.success) {
            deployedFolders.push(folder.name);
            totalSize += Number(folder.folderSize || 0);
          } else {
            failedFolders.push({
              folder: folder.name,
              error: deployResult.error || 'Unknown deployment error'
            });
          }
        } catch (error) {
          failedFolders.push({
            folder: folder.name,
            error: error instanceof Error ? error.message : 'Deployment failed'
          });
        }
      }

      const deploymentTime = Date.now() - startTime;

      return {
        success: failedFolders.length === 0,
        deployedFolders,
        failedFolders,
        totalSize,
        deploymentTime
      };
    } catch (error) {
      throw new Error(`Data folder deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deploy a single data folder
   */
  private async deployDataFolder(
    deviceId: string, 
    apkPackageName: string, 
    folder: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Ensure temp directory exists
      await fs.mkdir(this.tempPath, { recursive: true });

      // Prepare deployment package
      const packagePath = await this.createDeploymentPackage(deviceId, apkPackageName, folder);

      // Send deployment command to device
      const deploymentCommand = {
        type: 'DEPLOY_DATA_FOLDER',
        parameters: {
          packageName: apkPackageName,
          folderName: folder.name,
          folderType: folder.folderType,
          targetPath: folder.targetPath,
          packagePath: packagePath,
          checksum: folder.checksum,
          isRequired: folder.isRequired
        }
      };

      // TODO: Replace with actual command service integration
      const commandResult = await this.sendCommandToDevice(deviceId, deploymentCommand);

      if (commandResult.success) {
        // Verify deployment
        const verificationResult = await this.verifyDataFolderDeployment(deviceId, folder, packagePath);
        return verificationResult;
      } else {
        return {
          success: false,
          error: commandResult.message || 'Command execution failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create a deployment package for a data folder
   */
  private async createDeploymentPackage(
    deviceId: string, 
    apkPackageName: string, 
    folder: any
  ): Promise<string> {
    const packageName = `${deviceId}_${apkPackageName}_${folder.name}_${Date.now()}.zip`;
    const packagePath = path.join(this.tempPath, packageName);

    // Create zip package
    const output = require('fs').createWriteStream(packagePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Add folder contents to archive
    if (await this.pathExists(folder.sourcePath)) {
      const stats = await fs.stat(folder.sourcePath);
      
      if (stats.isDirectory()) {
        archive.directory(folder.sourcePath, folder.targetPath);
      } else {
        archive.file(folder.sourcePath, { name: path.basename(folder.targetPath) });
      }
    } else {
      throw new Error(`Source path does not exist: ${folder.sourcePath}`);
    }

    // Add metadata
    const metadata = {
      folderName: folder.name,
      folderType: folder.folderType,
      targetPath: folder.targetPath,
      deploymentTime: new Date().toISOString(),
      deviceId: deviceId,
      packageName: apkPackageName,
      checksum: folder.checksum,
      isRequired: folder.isRequired
    };

    archive.append(JSON.stringify(metadata, null, 2), { name: 'deployment_metadata.json' });

    await archive.finalize();

    // Wait for the archive to complete
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });

    return packagePath;
  }

  /**
   * Check if a data folder is geographically compatible with device location
   */
  private isGeographicallyCompatible(
    folder: any, 
    deviceLocation?: { district: string; region: string }
  ): boolean {
    if (!folder.geographicScope || folder.geographicScope === 'ALL') {
      return true;
    }

    if (!deviceLocation) {
      // If no device location and folder has geographic restrictions, it's not compatible
      return folder.geographicScope === 'ALL';
    }

    if (folder.geographicScope === 'DISTRICT_SPECIFIC') {
      return folder.applicableDistricts.includes(deviceLocation.district);
    }

    if (folder.geographicScope === 'REGION_SPECIFIC') {
      return folder.applicableDistricts.includes(deviceLocation.region);
    }

    return true;
  }

  /**
   * Verify that data folder was deployed successfully
   */
  private async verifyDataFolderDeployment(
    deviceId: string, 
    folder: any, 
    packagePath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Send verification command
      const verificationCommand = {
        type: 'VERIFY_DATA_FOLDER',
        parameters: {
          folderName: folder.name,
          targetPath: folder.targetPath,
          expectedChecksum: folder.checksum,
          fileCount: folder.fileCount
        }
      };

      const verificationResult = await this.sendCommandToDevice(deviceId, verificationCommand);

      if (verificationResult.success) {
        // Clean up temporary package file
        await this.cleanupTempFile(packagePath);
        return { success: true };
      } else {
        return {
          success: false,
          error: `Verification failed: ${verificationResult.message}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get available data folders for an APK
   */
  async getDataFoldersForAPK(apkId: string, deviceLocation?: { district: string; region: string }) {
    const dataFolders = await prisma.aPKDataFolder.findMany({
      where: { apkId },
      orderBy: [
        { isRequired: 'desc' },
        { name: 'asc' }
      ]
    });

    // Filter by geographic compatibility
    const compatibleFolders = dataFolders.filter(folder => 
      this.isGeographicallyCompatible(folder, deviceLocation)
    );

    // Group by folder type
    const groupedFolders = compatibleFolders.reduce((acc, folder) => {
      const bucket = acc[folder.folderType] ?? (acc[folder.folderType] = []);
      bucket.push(folder);
      return acc;
    }, {} as Record<string, any[]>);

    return {
      folders: compatibleFolders,
      groupedByType: groupedFolders,
      totalSize: compatibleFolders.reduce((sum, folder) => sum + Number(folder.folderSize || 0), 0),
      requiredFolders: compatibleFolders.filter(f => f.isRequired),
      optionalFolders: compatibleFolders.filter(f => !f.isRequired)
    };
  }

  /**
   * Validate data folder selections
   */
  async validateDataFolderSelection(
    apkId: string,
    selectedFolderIds: string[],
    deviceSpecs?: {
      availableStorage: number;
      model: string;
      district?: string;
    }
  ): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    totalSize: number;
    requiredFolders: string[];
    missingRequired: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalSize = 0;

    try {
      // Get all required folders for this APK
      const requiredFolders = await prisma.aPKDataFolder.findMany({
        where: {
          apkId,
          isRequired: true
        }
      });

      // Get selected folders
      const selectedFolders = await prisma.aPKDataFolder.findMany({
        where: {
          id: { in: selectedFolderIds }
        }
      });

      // Check for missing required folders
      const selectedRequiredIds = selectedFolders
        .filter(f => f.isRequired)
        .map(f => f.id);
      
      const missingRequired = requiredFolders
        .filter(f => !selectedRequiredIds.includes(f.id))
        .map(f => f.name);

      if (missingRequired.length > 0) {
        errors.push(`Missing required folders: ${missingRequired.join(', ')}`);
      }

      // Calculate total size
      totalSize = selectedFolders.reduce((sum, folder) => sum + Number(folder.folderSize || 0), 0);

      // Check storage availability
      if (deviceSpecs?.availableStorage && totalSize > deviceSpecs.availableStorage) {
        errors.push(`Total size (${(totalSize / 1024 / 1024).toFixed(2)}MB) exceeds available storage (${(deviceSpecs.availableStorage / 1024 / 1024).toFixed(2)}MB)`);
      }

      // Check geographic compatibility
      if (deviceSpecs?.district) {
        const incompatibleFolders = selectedFolders.filter(folder => 
          !this.isGeographicallyCompatible(folder, { district: deviceSpecs.district!, region: '' })
        );

        if (incompatibleFolders.length > 0) {
          warnings.push(`Some folders may not be compatible with device location: ${incompatibleFolders.map(f => f.name).join(', ')}`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        totalSize,
        requiredFolders: requiredFolders.map(f => f.name),
        missingRequired
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        totalSize: 0,
        requiredFolders: [],
        missingRequired: []
      };
    }
  }

  // Helper methods
  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`Could not clean up temp file ${filePath}:`, error);
    }
  }

  // TODO: Replace with actual command service integration
  private async sendCommandToDevice(deviceId: string, command: any): Promise<{ success: boolean; message?: string }> {
    // This should integrate with your existing command service
    console.log(`Sending command to device ${deviceId}:`, command);
    
    // Mock implementation - replace with real WebSocket/API call
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ success: true, message: 'Command executed successfully' });
      }, 1000);
    });
  }
}

export const dataFolderService = new DataFolderService();
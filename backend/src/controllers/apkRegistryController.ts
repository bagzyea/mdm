import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Multer configuration for APK uploads
const storage = multer.diskStorage({
  destination: async (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'apks');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

export const uploadAPK = multer({ 
  storage,
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype === 'application/vnd.android.package-archive' || 
        file.originalname.endsWith('.apk')) {
      cb(null, true);
    } else {
      cb(new Error('Only APK files are allowed'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max file size
  }
});

// Get all APKs from registry
export const getAllAPKs = async (req: Request, res: Response) => {
  try {
    const { 
      category, 
      isActive = 'true', 
      search,
      page = '1',
      limit = '20'
    } = req.query;

    const where: any = {
      isActive: isActive === 'true'
    };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { appName: { contains: search as string, mode: 'insensitive' } },
        { displayName: { contains: search as string, mode: 'insensitive' } },
        { packageName: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [apks, total] = await Promise.all([
      prisma.aPKRegistry.findMany({
        where,
        include: {
          dataFolders: {
            orderBy: { name: 'asc' }
          },
          _count: {
            select: {
              dataFolders: true,
              provisioningApps: true
            }
          }
        },
        skip,
        take: limitNum,
        orderBy: { uploadedAt: 'desc' }
      }),
      prisma.aPKRegistry.count({ where })
    ]);

    // Convert BigInt to string for JSON serialization
    const serializedAPKs = apks.map(apk => ({
      ...apk,
      fileSize: apk.fileSize.toString(),
      dataFolders: apk.dataFolders?.map(folder => ({
        ...folder,
        folderSize: folder.folderSize?.toString()
      }))
    }));

    res.json({
      data: serializedAPKs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching APKs:', error);
    res.status(500).json({ error: 'Failed to fetch APK registry' });
  }
};

// Upload and register new APK
export const uploadAndRegisterAPK = async (req: MulterRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No APK file provided' });
      return;
    }

    const {
      displayName,
      description,
      category,
      supportedDeviceModels
    } = req.body;

    const userId = (req as any).user?.userId || 'system';
    const apkPath = req.file.path;

    // Analyze APK to extract metadata
    const apkInfo = await analyzeAPK(apkPath);
    
    // Calculate file hash
    const fileHash = await calculateFileHash(apkPath);
    
    // Get file size
    const stats = await fs.stat(apkPath);
    const fileSize = stats.size;

    // Create APK registry entry
    const apk = await prisma.aPKRegistry.create({
      data: {
        packageName: apkInfo.packageName,
        appName: apkInfo.appName,
        displayName: displayName || apkInfo.appName,
        description,
        category,
        version: apkInfo.version,
        versionCode: apkInfo.versionCode,
        minSdkVersion: apkInfo.minSdkVersion,
        targetSdkVersion: apkInfo.targetSdkVersion,
        fileSize: BigInt(fileSize),
        filePath: apkPath,
        fileHash,
        permissions: apkInfo.permissions,
        features: apkInfo.features,
        supportedDeviceModels: JSON.parse(supportedDeviceModels || '[]'),
        uploadedBy: userId
      }
    });

    // Convert BigInt to string for JSON serialization
    const serializedAPK = {
      ...apk,
      fileSize: apk.fileSize.toString()
    };

    res.status(201).json({
      message: 'APK uploaded and registered successfully',
      apk: serializedAPK
    });
  } catch (error) {
    console.error('Error uploading APK:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    
    res.status(500).json({ error: 'Failed to upload and register APK' });
  }
};

// Add data folder to APK
export const addDataFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      folderType,
      sourcePath,
      targetPath,
      isRequired = true,
      geographicScope,
      applicableDistricts
    } = req.body;

    // Validate APK exists
    const apk = await prisma.aPKRegistry.findUnique({
      where: { id }
    });

    if (!apk) {
      res.status(404).json({ error: 'APK not found' });
      return;
    }

    // Calculate folder size and file count if sourcePath exists
    let folderSize: bigint | undefined;
    let fileCount: number | undefined;
    let checksum: string | undefined;

    try {
      const folderInfo = await analyzeFolderStructure(sourcePath);
      folderSize = BigInt(folderInfo.size);
      fileCount = folderInfo.fileCount;
      checksum = folderInfo.checksum;
    } catch (error) {
      console.warn('Could not analyze folder structure:', error);
    }

    const dataFolder = await prisma.aPKDataFolder.create({
      data: {
        apkId: id,
        name,
        description,
        folderType,
        sourcePath,
        targetPath,
        isRequired,
        folderSize: folderSize || undefined,
        fileCount: fileCount || undefined,
        checksum: checksum || undefined,
        geographicScope,
        applicableDistricts: applicableDistricts ? JSON.parse(applicableDistricts) : []
      }
    });

    // Convert BigInt to string for JSON serialization
    const serializedDataFolder = {
      ...dataFolder,
      folderSize: dataFolder.folderSize?.toString()
    };

    res.status(201).json({
      message: 'Data folder added successfully',
      dataFolder: serializedDataFolder
    });
  } catch (error) {
    console.error('Error adding data folder:', error);
    res.status(500).json({ error: 'Failed to add data folder' });
  }
};

// Get APK with data folders
export const getAPKWithDataFolders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const apk = await prisma.aPKRegistry.findUnique({
      where: { id },
      include: {
        dataFolders: {
          orderBy: { name: 'asc' }
        }
      }
    });

    if (!apk) {
      res.status(404).json({ error: 'APK not found' });
      return;
    }

    // Convert BigInt to string for JSON serialization
    const serializedAPK = {
      ...apk,
      fileSize: apk.fileSize.toString(),
      dataFolders: apk.dataFolders.map(folder => ({
        ...folder,
        folderSize: folder.folderSize?.toString()
      }))
    };

    res.json(serializedAPK);
  } catch (error) {
    console.error('Error fetching APK:', error);
    res.status(500).json({ error: 'Failed to fetch APK details' });
  }
};

// Get compatible APKs for specific device models
export const getCompatibleAPKs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceModels } = req.query;
    
    if (!deviceModels) {
      res.status(400).json({ error: 'Device models parameter required' });
      return;
    }

    const models = Array.isArray(deviceModels) ? deviceModels : [deviceModels];

    const apks = await prisma.aPKRegistry.findMany({
      where: {
        isActive: true,
        OR: [
          { supportedDeviceModels: { isEmpty: true } }, // Universal compatibility
          { 
            supportedDeviceModels: { 
              hasSome: models as string[] 
            }
          }
        ]
      },
      include: {
        dataFolders: {
          where: { isRequired: true }
        },
        _count: {
          select: { dataFolders: true }
        }
      },
      orderBy: [
        { category: 'asc' },
        { appName: 'asc' }
      ]
    });

    // Convert BigInt to string for JSON serialization
    const serializedAPKs = apks.map(apk => ({
      ...apk,
      fileSize: apk.fileSize.toString(),
      dataFolders: apk.dataFolders?.map(folder => ({
        ...folder,
        folderSize: folder.folderSize?.toString()
      }))
    }));

    // Group by category for easier frontend handling
    const groupedAPKs = serializedAPKs.reduce((acc: Record<string, typeof serializedAPKs>, apk) => {
      if (!acc[apk.category]) {
        acc[apk.category] = [];
      }
      acc[apk.category].push(apk);
      return acc;
    }, {});

    res.json({
      apks: serializedAPKs,
      groupedByCategory: groupedAPKs,
      total: serializedAPKs.length
    });
  } catch (error) {
    console.error('Error fetching compatible APKs:', error);
    res.status(500).json({ error: 'Failed to fetch compatible APKs' });
  }
};

// Helper functions
async function analyzeAPK(apkPath: string): Promise<{
  packageName: string;
  appName: string;
  version: string;
  versionCode: number;
  minSdkVersion: number;
  targetSdkVersion: number;
  permissions: string[];
  features: string[];
}> {
  try {
    // Use aapt (Android Asset Packaging Tool) to analyze APK
    // This requires Android SDK build-tools to be installed
    const { stdout } = await execAsync(`aapt dump badging "${apkPath}"`);
    
    const lines = stdout.split('\n');
    let packageName = '';
    let appName = '';
    let version = '';
    let versionCode = 0;
    let minSdkVersion = 21;
    let targetSdkVersion = 33;
    const permissions: string[] = [];
    const features: string[] = [];

    for (const line of lines) {
      if (line.startsWith('package:')) {
        const packageMatch = line.match(/name='([^']+)'/);
        const versionMatch = line.match(/versionName='([^']+)'/);
        const versionCodeMatch = line.match(/versionCode='([^']+)'/);
        
        if (packageMatch && packageMatch[1]) packageName = packageMatch[1];
        if (versionMatch && versionMatch[1]) version = versionMatch[1];
        if (versionCodeMatch && versionCodeMatch[1]) versionCode = parseInt(versionCodeMatch[1]);
      }
      
      if (line.startsWith('application-label:')) {
        appName = line.replace('application-label:', '').replace(/'/g, '').trim();
      }
      
      if (line.startsWith('sdkVersion:')) {
        minSdkVersion = parseInt(line.replace('sdkVersion:', '').replace(/'/g, '').trim());
      }
      
      if (line.startsWith('targetSdkVersion:')) {
        targetSdkVersion = parseInt(line.replace('targetSdkVersion:', '').replace(/'/g, '').trim());
      }
      
      if (line.startsWith('uses-permission:')) {
        const permMatch = line.match(/name='([^']+)'/);
        if (permMatch && permMatch[1]) permissions.push(permMatch[1]);
      }
      
      if (line.startsWith('uses-feature:')) {
        const featureMatch = line.match(/name='([^']+)'/);
        if (featureMatch && featureMatch[1]) features.push(featureMatch[1]);
      }
    }

    return {
      packageName,
      appName: appName || packageName,
      version,
      versionCode,
      minSdkVersion,
      targetSdkVersion,
      permissions,
      features
    };
  } catch (error) {
    // Fallback to basic file information if aapt is not available
    console.warn('Could not analyze APK with aapt, using fallback:', error);
    
    const filename = path.basename(apkPath);
    return {
      packageName: `com.unknown.${Date.now()}`,
      appName: filename.replace('.apk', ''),
      version: '1.0.0',
      versionCode: 1,
      minSdkVersion: 21,
      targetSdkVersion: 33,
      permissions: [],
      features: []
    };
  }
}

async function calculateFileHash(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

async function analyzeFolderStructure(folderPath: string): Promise<{
  size: number;
  fileCount: number;
  checksum: string;
}> {
  // Implement folder analysis logic
  const stats = await fs.stat(folderPath);
  
  if (!stats.isDirectory()) {
    return {
      size: stats.size,
      fileCount: 1,
      checksum: await calculateFileHash(folderPath)
    };
  }

  // For directories, recursively calculate size and file count
  let totalSize = 0;
  let fileCount = 0;
  const checksumInput: string[] = [];

  async function traverseDirectory(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await traverseDirectory(fullPath);
      } else {
        const fileStats = await fs.stat(fullPath);
        totalSize += fileStats.size;
        fileCount++;
        
        // Add file path and size to checksum calculation
        checksumInput.push(`${fullPath}:${fileStats.size}`);
      }
    }
  }

  await traverseDirectory(folderPath);

  // Calculate checksum based on file structure
  const hash = crypto.createHash('sha256');
  hash.update(checksumInput.sort().join('|'));
  const checksum = hash.digest('hex');

  return {
    size: totalSize,
    fileCount,
    checksum
  };
}
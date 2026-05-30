import { Request, Response } from 'express';
import { PrismaClient, APKCategory } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const prisma = new PrismaClient();

export const uploadAPK = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No APK file provided' });
      return;
    }

    // Default fallbacks for testing
    const {
      packageName = 'com.example.app',
      appName = file.originalname.replace('.apk', ''),
      displayName = file.originalname.replace('.apk', ''),
      description = '',
      category = 'BUSINESS',
      version = '1.0.0',
      versionCode = '1'
    } = req.body;

    // Calculate file hash (SHA-256)
    const fileBuffer = fs.readFileSync(file.path);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const fileHash = hashSum.digest('hex');

    // Create DB entry
    const apk = await prisma.aPKRegistry.create({
      data: {
        packageName,
        appName,
        displayName,
        description,
        category: category as APKCategory,
        version,
        versionCode: parseInt(versionCode as string, 10) || 1,
        fileSize: file.size,
        filePath: `/apks/${file.filename}`, // Safe relative public path
        fileHash,
        uploadedBy: (req as any).user?.id || 'admin',
        supportedDeviceModels: [],
      }
    });

    // BigInt serialization fix for JSON
    const returnApk = {
      ...apk,
      fileSize: apk.fileSize.toString()
    };

    res.status(201).json(returnApk);
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Error uploading APK', error: error.message });
  }
};

export const getAPKs = async (req: Request, res: Response): Promise<void> => {
  try {
    const apks = await prisma.aPKRegistry.findMany({
      orderBy: { uploadedAt: 'desc' }
    });

    // Convert BigInt for JSON serialization
    const safeApks = apks.map(apk => ({
      ...apk,
      fileSize: apk.fileSize.toString()
    }));

    res.status(200).json(safeApks);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching APKs', error: error.message });
  }
};

export const getCompatibleAPKs = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceModels = req.query.deviceModels
      ? String(req.query.deviceModels).split(',').map(m => m.trim()).filter(Boolean)
      : [];

    const apks = await prisma.aPKRegistry.findMany({
      where: {
        isActive: true,
        ...(deviceModels.length > 0 && {
          OR: [
            { supportedDeviceModels: { isEmpty: true } }, // no restriction = compatible with all
            { supportedDeviceModels: { hasSome: deviceModels } },
          ]
        })
      },
      orderBy: { uploadedAt: 'desc' }
    });

    const safeApks = apks.map(apk => ({ ...apk, fileSize: apk.fileSize.toString() }));
    res.status(200).json({ apks: safeApks });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching compatible APKs', error: error.message });
  }
};

export const deleteAPK = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const apk = await prisma.aPKRegistry.findUnique({ where: { id: id as string } });

    if (!apk) {
      res.status(404).json({ message: 'APK not found' });
      return;
    }

    // Delete physical file
    const fullPath = path.join(__dirname, '../../public', apk.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    // Delete database record
    await prisma.aPKRegistry.delete({ where: { id: id as string } });

    res.status(200).json({ message: 'APK deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting APK', error: error.message });
  }
};
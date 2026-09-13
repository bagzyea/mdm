import { Request, Response } from 'express';
import { APKCategory } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  hashFile,
  readApkManifest,
  assertPackageNameMatches,
  ApkInspectionError,
} from '../services/apkInspector';
import { signApkDownload } from '../services/signedDownloads';
import prisma from '../db';


/** Remove a rejected upload so unverified APKs never linger in the served directory. */
async function discardUpload(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    console.warn('Could not remove rejected upload:', filePath, error);
  }
}

export const uploadAPK = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No APK file provided' });
      return;
    }

    const {
      packageName: declaredPackageName,
      appName = file.originalname.replace('.apk', ''),
      displayName = file.originalname.replace('.apk', ''),
      description = '',
      category = 'BUSINESS',
      version,
      versionCode
    } = req.body;

    // The APK's own manifest is authoritative for its identity. Previously packageName
    // came from the request body with a default of 'com.example.app' and was never
    // checked, so an APK could be registered — and installed on the fleet — under an
    // identity that was not its own (finding F-06).
    let manifest;
    try {
      manifest = await readApkManifest(file.path);
      assertPackageNameMatches(declaredPackageName, manifest);
    } catch (error) {
      await discardUpload(file.path);

      if (error instanceof ApkInspectionError) {
        res.status(400).json({ message: error.message, code: 'APK_VERIFICATION_FAILED' });
        return;
      }
      throw error;
    }

    // Streaming hash: the previous readFileSync pulled up to 500 MB into memory and
    // blocked the event loop for the duration of the read.
    const fileHash = await hashFile(file.path);

    // Create DB entry
    const apk = await prisma.aPKRegistry.create({
      data: {
        packageName: manifest.packageName,
        appName,
        displayName,
        description,
        category: category as APKCategory,
        version: version || manifest.versionName || '1.0.0',
        versionCode: parseInt(versionCode as string, 10) || manifest.versionCode || 1,
        fileSize: file.size,
        // Stored as a bare filename; the download route resolves it and signs access.
        filePath: `/apks/${file.filename}`,
        fileHash,
        // The token payload field is `userId`; `id` was always undefined, so every
        // upload was attributed to the literal 'admin' (finding F-21).
        uploadedBy: req.user?.userId || 'unknown',
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

/**
 * Mint a short-lived signed download URL for one APK.
 *
 * Downloads used to be served from an unauthenticated static mount. Callers now ask
 * for a link, which is valid only for that file and only for a short window.
 */
export const getAPKDownloadUrl = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const apk = await prisma.aPKRegistry.findUnique({ where: { id: id as string } });

    if (!apk) {
      res.status(404).json({ message: 'APK not found' });
      return;
    }

    const filename = path.basename(apk.filePath);
    const signed = signApkDownload(filename);

    res.status(200).json({
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
      fileHash: apk.fileHash,
      packageName: apk.packageName,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating download URL', error: error.message });
  }
};

export const deleteAPK = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
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
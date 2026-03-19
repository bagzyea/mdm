import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import {
  getAllAPKs,
  uploadAndRegisterAPK,
  addDataFolder,
  getAPKWithDataFolders,
  getCompatibleAPKs,
  uploadAPK
} from '../controllers/apkRegistryController';

const prisma = new PrismaClient();

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/apk-registry - Get all APKs with filtering and pagination
router.get('/', getAllAPKs);

// GET /api/apk-registry/compatible - Get compatible APKs for device models
router.get('/compatible', getCompatibleAPKs);

// GET /api/apk-registry/:id - Get specific APK with data folders
router.get('/:id', getAPKWithDataFolders);

// POST /api/apk-registry/upload - Upload and register new APK
router.post('/upload', uploadAPK.single('apk'), uploadAndRegisterAPK);

// POST /api/apk-registry/:id/data-folders - Add data folder to APK
router.post('/:id/data-folders', addDataFolder);

// PUT /api/apk-registry/:id - Update APK information
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedAPK = await prisma.aPKRegistry.update({
      where: { id },
      data: {
        ...updates,
        supportedDeviceModels: updates.supportedDeviceModels ? 
          JSON.parse(updates.supportedDeviceModels) : undefined,
        updatedAt: new Date()
      },
      include: {
        dataFolders: true
      }
    });

    res.json({
      message: 'APK updated successfully',
      apk: updatedAPK
    });
  } catch (error) {
    console.error('Error updating APK:', error);
    res.status(500).json({ error: 'Failed to update APK' });
  }
});

// DELETE /api/apk-registry/:id - Deactivate APK
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const updatedAPK = await prisma.aPKRegistry.update({
      where: { id },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });

    res.json({
      message: 'APK deactivated successfully',
      apk: updatedAPK
    });
  } catch (error) {
    console.error('Error deactivating APK:', error);
    res.status(500).json({ error: 'Failed to deactivate APK' });
  }
});

// PUT /api/apk-registry/:id/data-folders/:folderId - Update data folder
router.put('/:id/data-folders/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;
    const updates = req.body;

    const updatedFolder = await prisma.aPKDataFolder.update({
      where: { id: folderId },
      data: {
        ...updates,
        applicableDistricts: updates.applicableDistricts ?
          JSON.parse(updates.applicableDistricts) : undefined,
        updatedAt: new Date()
      }
    });

    res.json({
      message: 'Data folder updated successfully',
      dataFolder: updatedFolder
    });
  } catch (error) {
    console.error('Error updating data folder:', error);
    res.status(500).json({ error: 'Failed to update data folder' });
  }
});

// DELETE /api/apk-registry/:id/data-folders/:folderId - Delete data folder
router.delete('/:id/data-folders/:folderId', async (req, res) => {
  try {
    const { folderId } = req.params;

    await prisma.aPKDataFolder.delete({
      where: { id: folderId }
    });

    res.json({
      message: 'Data folder deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting data folder:', error);
    res.status(500).json({ error: 'Failed to delete data folder' });
  }
});

// GET /api/apk-registry/categories - Get all available categories
router.get('/categories', async (req, res) => {
  try {
    const categories = [
      'CENSUS',
      'PRODUCTIVITY', 
      'UTILITY',
      'COMMUNICATION',
      'MEDIA',
      'EDUCATION',
      'GOVERNMENT',
      'CUSTOM'
    ];

    // Get category counts
    const categoryCounts = await prisma.aPKRegistry.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { category: true }
    });

    const categoriesWithCounts = categories.map(cat => ({
      name: cat,
      count: categoryCounts.find(c => c.category === cat)?._count?.category || 0
    }));

    res.json({
      categories: categoriesWithCounts,
      totalAPKs: categoryCounts.reduce((sum, c) => sum + c._count.category, 0)
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;
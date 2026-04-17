import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadAPK, getAPKs, deleteAPK } from '../controllers/apkRegistryController';
import { authenticateToken, requirePermission } from '../middleware/auth';

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../public/apks');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to ONLY allow APKs
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.originalname.endsWith('.apk') || file.mimetype === 'application/vnd.android.package-archive') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only .apk files are allowed.'), false);
  }
};

const upload = multer({ storage, fileFilter });

// API Routes
router.get('/', authenticateToken, getAPKs);
router.post('/upload', authenticateToken, requirePermission('provisioning', 'create'), upload.single('apk'), uploadAPK);
router.delete('/:id', authenticateToken, requirePermission('provisioning', 'delete'), deleteAPK);

export default router;
import express from 'express';
import { 
  getAllCertificates, 
  getCertificate, 
  createCertificate, 
  deployCertificate, 
  revokeCertificate,
  getDeviceCertificates
} from '../controllers/certificateController';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

// Authentication is applied at the mount point; authorization is per route.
// Previously the whole router sat behind a single certificates:read check, so a
// read-only token could issue and revoke certificates.

router.get('/', requirePermission('certificates', 'read'), getAllCertificates);
router.get('/device/:deviceId', requirePermission('certificates', 'read'), getDeviceCertificates);
router.get('/:id', requirePermission('certificates', 'read'), getCertificate);

router.post('/', requirePermission('certificates', 'create'), createCertificate);
router.post('/:certificateId/deploy', requirePermission('certificates', 'update'), deployCertificate);
router.put('/:id/revoke', requirePermission('certificates', 'update'), revokeCertificate);

export default router;

import express from 'express';
import { 
  getAllCertificates, 
  getCertificate, 
  createCertificate, 
  deployCertificate, 
  revokeCertificate,
  getDeviceCertificates
} from '../controllers/certificateController';
const router = express.Router();

// Authentication is handled at the server level

// Certificate management routes
router.get('/', getAllCertificates);
router.get('/:id', getCertificate);
router.post('/', createCertificate);
router.post('/:certificateId/deploy', deployCertificate);
router.put('/:id/revoke', revokeCertificate);
router.get('/device/:deviceId', getDeviceCertificates);

export default router;

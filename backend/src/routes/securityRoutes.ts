import express from 'express';
import { 
  getSecurityStatus, 
  updateSecurityStatus, 
  runComplianceCheck, 
  getComplianceReports,
  enforceEncryptionPolicy,
  detectRootStatus
} from '../controllers/securityController';
const router = express.Router();

// Authentication is handled at the server level

// Security management routes
router.get('/device/:deviceId/status', getSecurityStatus);
router.put('/device/:deviceId/status', updateSecurityStatus);
router.post('/device/:deviceId/compliance', runComplianceCheck);
router.get('/device/:deviceId/compliance', getComplianceReports);
router.post('/device/:deviceId/encryption', enforceEncryptionPolicy);
router.post('/device/:deviceId/root-detection', detectRootStatus);

export default router;

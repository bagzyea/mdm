import express from 'express';
import { 
  getSecurityStatus, 
  updateSecurityStatus, 
  runComplianceCheck, 
  getComplianceReports,
  enforceEncryptionPolicy,
  detectRootStatus
} from '../controllers/securityController';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

// Authentication is applied at the mount point; authorization is per route.
// Previously the whole router sat behind a single security:read check.

router.get('/device/:deviceId/status', requirePermission('security', 'read'), getSecurityStatus);
router.get('/device/:deviceId/compliance', requirePermission('security', 'read'), getComplianceReports);

router.put('/device/:deviceId/status', requirePermission('security', 'update'), updateSecurityStatus);

// Writes a new compliance report for the device.
router.post('/device/:deviceId/compliance', requirePermission('security', 'create'), runComplianceCheck);

// Both of these mutate SecurityStatus and dispatch a RemoteCommand to the device.
router.post('/device/:deviceId/encryption', requirePermission('security', 'update'), enforceEncryptionPolicy);
router.post('/device/:deviceId/root-detection', requirePermission('security', 'update'), detectRootStatus);

export default router;

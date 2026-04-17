import express from 'express';
import {
  getAllProvisioningProfiles,
  getProvisioningProfile,
  createProvisioningProfile,
  updateProvisioningProfile,
  deleteProvisioningProfile,
  getCompatibleDevices,
  validateProfile,
  bulkDeployApplications,
  getDeploymentProgress,
  cancelDeployment,
  createFieldConfiguration,
  getFieldConfigurations,
  getFieldConfiguration,
  updateFieldConfiguration,
  deleteFieldConfiguration,
  applyFieldConfiguration,
  detectDeviceModel
} from '../controllers/provisioningProfileController';
import {
  getAllProvisioningSessions,
  getProvisioningSession,
  createProvisioningSession,
  startProvisioningSession,
  pauseProvisioningSession,
  cancelProvisioningSession,
  updateProvisioningProgress,
  reportDeviceProvisioningProgress,
  getSessionStatistics
} from '../controllers/provisioningSessionController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Provisioning Profiles
router.get('/profiles', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getAllProvisioningProfiles);
router.get('/profiles/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getProvisioningProfile);
router.post('/profiles', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), createProvisioningProfile);
router.put('/profiles/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), updateProvisioningProfile);
router.delete('/profiles/:id', requireRole('SUPER_ADMIN', 'ADMIN'), deleteProvisioningProfile);
router.get('/profiles/:id/compatible-devices', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getCompatibleDevices);
router.post('/profiles/:id/validate', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), validateProfile);

// Bulk Application Deployment
router.post('/profiles/:id/bulk-deploy', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), bulkDeployApplications);
router.get('/deployment/:sessionId/progress', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getDeploymentProgress);
router.post('/deployment/:sessionId/cancel', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), cancelDeployment);

// Field Configuration Management
router.get('/field-configurations', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getFieldConfigurations);
router.get('/field-configurations/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getFieldConfiguration);
router.post('/field-configurations', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), createFieldConfiguration);
router.put('/field-configurations/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), updateFieldConfiguration);
router.delete('/field-configurations/:id', requireRole('SUPER_ADMIN', 'ADMIN'), deleteFieldConfiguration);
router.post('/field-configurations/:id/apply', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), applyFieldConfiguration);

// Device Model Recognition
router.get('/devices/:deviceId/detect-model', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), detectDeviceModel);

// Provisioning Sessions
router.get('/sessions', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getAllProvisioningSessions);
router.get('/sessions/:id', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getProvisioningSession);
router.post('/sessions', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), createProvisioningSession);
router.post('/sessions/:id/start', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), startProvisioningSession);
router.post('/sessions/:id/pause', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), pauseProvisioningSession);
router.post('/sessions/:id/cancel', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), cancelProvisioningSession);
router.put('/sessions/:id/progress', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR'), updateProvisioningProgress);
router.put('/sessions/:sessionId/device-progress', reportDeviceProvisioningProgress);
router.get('/sessions/:id/statistics', requireRole('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'), getSessionStatistics);

export default router;
import express from 'express';
import { 
  getAllDevices, 
  getDevice, 
  enrollDevice, 
  generateEnrollmentCode,
  sendCommand, 
  updateDeviceStatus,
  deviceHeartbeat,
  updateDeviceAnalytics,
  getDeviceAnalytics,
  getDeviceHealthSummary,
  deleteDevice
} from '../controllers/deviceController';

const router = express.Router();

// Authentication is handled at the server level - no need to apply here

// Basic device operations
router.get('/', getAllDevices);
router.get('/:deviceId', getDevice);
router.post('/enroll', enrollDevice);
router.post('/enrollment-code', generateEnrollmentCode);
router.post('/:deviceId/command', sendCommand);
router.put('/:deviceId/status', updateDeviceStatus);
router.post('/:deviceId/heartbeat', deviceHeartbeat);
router.delete('/:deviceId', deleteDevice);

// Enhanced monitoring routes
router.put('/:deviceId/analytics', updateDeviceAnalytics);
router.get('/:deviceId/analytics', getDeviceAnalytics);
router.get('/health/summary', getDeviceHealthSummary);

export default router;
import { Router } from 'express';
import {
  getAllDevices,
  getDevice,
  enrollDevice,
  sendCommand,
  updateDeviceStatus
} from '../controllers/deviceController';

const router = Router();

// GET /api/devices - Get all devices
router.get('/', getAllDevices);

// GET /api/devices/:deviceId - Get specific device
router.get('/:deviceId', getDevice);

// POST /api/devices/enroll - Enroll new device
router.post('/enroll', enrollDevice);

// POST /api/devices/:deviceId/commands - Send command to device
router.post('/:deviceId/commands', sendCommand);

// PUT /api/devices/:deviceId/status - Update device status
router.put('/:deviceId/status', updateDeviceStatus);

export default router;
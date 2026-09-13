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
import { requirePermission } from '../middleware/auth';
import { validate, validateParams } from '../middleware/validation';
import {
  deviceIdParamSchema,
  updateDeviceStatusSchema,
  deviceHeartbeatSchema,
  sendDeviceCommandSchema,
  deviceAnalyticsSchema,
  createEnrollmentCodeSchema,
} from '../schemas/deviceSchemas';

const router = express.Router();

// Authentication (authenticateToken) is applied where this router is mounted.
// Authorization is declared per route below: the mount point previously carried a
// single devices:read check, which every route inherited — so a VIEWER token could
// reach DELETE /:deviceId and the command endpoint. Every route now states the
// permission it actually requires.

// --- Reads ---
router.get('/', requirePermission('devices', 'read'), getAllDevices);
router.get('/health/summary', requirePermission('devices', 'read'), getDeviceHealthSummary);
router.get('/:deviceId', requirePermission('devices', 'read'), validateParams(deviceIdParamSchema), getDevice);
router.get('/:deviceId/analytics', requirePermission('devices', 'read'), validateParams(deviceIdParamSchema), getDeviceAnalytics);

// --- Enrollment ---
// The unauthenticated enrollment path devices actually use is mounted separately in
// server.ts. This authenticated variant lets an operator enroll on a device's behalf.
router.post('/enroll', requirePermission('devices', 'create'), enrollDevice);
router.post('/enrollment-code', requirePermission('devices', 'create'), validate(createEnrollmentCodeSchema), generateEnrollmentCode);

// --- Mutations ---
// Dispatching a command is a commands action, not a devices one: guarding this with
// devices:update would let a role with no command rights drive the fleet.
router.post('/:deviceId/command', requirePermission('commands', 'create'), validateParams(deviceIdParamSchema), validate(sendDeviceCommandSchema), sendCommand);
router.put('/:deviceId/status', requirePermission('devices', 'update'), validateParams(deviceIdParamSchema), validate(updateDeviceStatusSchema), updateDeviceStatus);
router.put('/:deviceId/analytics', requirePermission('devices', 'update'), validateParams(deviceIdParamSchema), validate(deviceAnalyticsSchema), updateDeviceAnalytics);

// Device-facing endpoint. The DEVICE role holds device-self permissions, not devices:*,
// so this is unreachable for devices over HTTP today — it was equally unreachable under
// the old devices:read mount. Devices report over the socket instead. Finding F-18
// (no coherent device API surface) covers fixing this properly; this guard at least
// stops a VIEWER forging heartbeats.
router.post('/:deviceId/heartbeat', requirePermission('devices', 'update'), validateParams(deviceIdParamSchema), validate(deviceHeartbeatSchema), deviceHeartbeat);

// --- Destructive ---
router.delete('/:deviceId', requirePermission('devices', 'delete'), validateParams(deviceIdParamSchema), deleteDevice);

export default router;

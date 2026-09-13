import express from 'express';
import {
  // Device Transfer routes
  getDeviceTransfers,
  requestDeviceTransfer,
  approveDeviceTransfer,
  
  // Device Retirement routes
  getDeviceRetirements,
  initiateDeviceRetirement,
  updateRetirementStatus,
  
  
  // Department Management routes
  getDepartments,
  createDepartment
} from '../controllers/deviceLifecycleController';
import { requirePermission } from '../middleware/auth';

const router = express.Router();

// Authentication is applied at the mount point; authorization is per route.
// This router is mounted under the 'devices' resource and previously inherited a
// single devices:read check — so a read-only token could retire devices, which
// defaults to dataWipeRequired: true.

// --- Device Transfers ---
router.get('/transfers', requirePermission('devices', 'read'), getDeviceTransfers);
router.post('/transfers', requirePermission('devices', 'update'), requestDeviceTransfer);
router.put('/transfers/:transferId/approve', requirePermission('devices', 'update'), approveDeviceTransfer);

// --- Device Retirement ---
router.get('/retirements', requirePermission('devices', 'read'), getDeviceRetirements);

// Retirement defaults to dataWipeRequired: true, so it is guarded as a destructive
// action rather than an update. The readiness review's Phase 3 recommends a
// second-approver flow on top of this guard.
router.post('/retirements', requirePermission('devices', 'delete'), initiateDeviceRetirement);
router.put('/retirements/:retirementId', requirePermission('devices', 'update'), updateRetirementStatus);

// --- Department Management ---
router.get('/departments', requirePermission('devices', 'read'), getDepartments);
router.post('/departments', requirePermission('devices', 'create'), createDepartment);

export default router;

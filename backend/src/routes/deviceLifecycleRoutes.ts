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

const router = express.Router();

// Device Transfer Routes
router.get('/transfers', getDeviceTransfers);
router.post('/transfers', requestDeviceTransfer);
router.put('/transfers/:transferId/approve', approveDeviceTransfer);

// Device Retirement Routes
router.get('/retirements', getDeviceRetirements);
router.post('/retirements', initiateDeviceRetirement);
router.put('/retirements/:retirementId', updateRetirementStatus);


// Department Management Routes
router.get('/departments', getDepartments);
router.post('/departments', createDepartment);

export default router;
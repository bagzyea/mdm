import { Router } from 'express';
import {
  getAllPolicies,
  getPolicyById,
  createPolicy,
  updatePolicy,
  deletePolicy,
  applyPolicyToDevice
} from '../controllers/policyController';

const router = Router();

// GET /api/policies - Get all policies with pagination and filtering
// Query params: page, limit, type (SECURITY|NETWORK|APPLICATION|COMPLIANCE), isActive
router.get('/', getAllPolicies);

// GET /api/policies/:id - Get specific policy by ID
router.get('/:id', getPolicyById);

// POST /api/policies - Create new policy
router.post('/', createPolicy);

// PUT /api/policies/:id - Update existing policy
router.put('/:id', updatePolicy);

// DELETE /api/policies/:id - Delete policy
// Query params: force (boolean) - force delete even if assigned to devices
router.delete('/:id', deletePolicy);

// POST /api/policies/:id/apply - Apply policy to specific devices
// Body: { deviceIds: string[] }
router.post('/:id/apply', applyPolicyToDevice);

export default router;
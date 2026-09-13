import { Router } from 'express';
import {
  getAllPolicies,
  getPolicyById,
  createPolicy,
  updatePolicy,
  deletePolicy,
  applyPolicyToDevice
} from '../controllers/policyController';
import { requirePermission } from '../middleware/auth';
import { validate, validateParams } from '../middleware/validation';
import {
  createPolicySchema,
  updatePolicySchema,
  applyPolicySchema,
  policyIdParamSchema,
} from '../schemas/policySchemas';

const router = Router();

// Authentication is applied at the mount point; authorization is per route.
// Previously the whole router sat behind a single policies:read check.

// GET /api/policies - Get all policies with pagination and filtering
// Query params: page, limit, type (SECURITY|NETWORK|APPLICATION|COMPLIANCE), isActive
router.get('/', requirePermission('policies', 'read'), getAllPolicies);

// GET /api/policies/:id - Get specific policy by ID
router.get('/:id', requirePermission('policies', 'read'), validateParams(policyIdParamSchema), getPolicyById);

// POST /api/policies - Create new policy
router.post('/', requirePermission('policies', 'create'), validate(createPolicySchema), createPolicy);

// PUT /api/policies/:id - Update existing policy
router.put('/:id', requirePermission('policies', 'update'), validateParams(policyIdParamSchema), validate(updatePolicySchema), updatePolicy);

// DELETE /api/policies/:id - Delete policy
// Query params: force (boolean) - force delete even if assigned to devices
router.delete('/:id', requirePermission('policies', 'delete'), validateParams(policyIdParamSchema), deletePolicy);

// POST /api/policies/:id/apply - Apply policy to specific devices
// Body: { deviceIds: string[] }
// 'apply' is a distinct action the OPERATOR role holds without holding update.
router.post('/:id/apply', requirePermission('policies', 'apply'), validateParams(policyIdParamSchema), validate(applyPolicySchema), applyPolicyToDevice);

export default router;

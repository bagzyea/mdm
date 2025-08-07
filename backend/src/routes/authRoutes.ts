import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserAuditLog,
  validateToken
} from '../controllers/authController';
import {
  authenticateToken,
  requireRole,
  requirePermission,
  auditLog,
  createRoleBasedRateLimit
} from '../middleware/auth';

const router = Router();

// Create role-based rate limiter
const roleBasedRateLimit = createRoleBasedRateLimit();

// Apply rate limiting to all auth routes
router.use(roleBasedRateLimit);

// Public routes (no authentication required)
router.post('/login', auditLog('LOGIN', 'auth'), login);
router.post('/refresh', refreshToken);

// Semi-public routes (optional authentication)
router.post('/validate', authenticateToken, validateToken);

// Protected routes (authentication required)
router.use(authenticateToken); // All routes below require authentication

// User profile management
router.get('/profile', auditLog('GET_PROFILE', 'auth'), getProfile);
router.put('/profile', auditLog('UPDATE_PROFILE', 'auth'), updateProfile);
router.post('/change-password', auditLog('CHANGE_PASSWORD', 'auth'), changePassword);
router.post('/logout', auditLog('LOGOUT', 'auth'), logout);

// Admin-only routes
router.post('/register', 
  requireRole('SUPER_ADMIN', 'ADMIN'),
  requirePermission('users', 'create'),
  auditLog('CREATE_USER', 'users'),
  register
);

router.get('/users', 
  requireRole('SUPER_ADMIN', 'ADMIN'),
  requirePermission('users', 'read'),
  auditLog('GET_USERS', 'users'),
  getUsers
);

router.get('/users/:id', 
  requireRole('SUPER_ADMIN', 'ADMIN'),
  requirePermission('users', 'read'),
  auditLog('GET_USER', 'users'),
  getUserById
);

router.put('/users/:id', 
  requireRole('SUPER_ADMIN', 'ADMIN'),
  requirePermission('users', 'update'),
  auditLog('UPDATE_USER', 'users'),
  updateUser
);

router.delete('/users/:id', 
  requireRole('SUPER_ADMIN'),
  requirePermission('users', 'delete'),
  auditLog('DELETE_USER', 'users'),
  deleteUser
);

router.get('/users/:id/audit-log', 
  requireRole('SUPER_ADMIN', 'ADMIN'),
  requirePermission('users', 'read'),
  auditLog('GET_USER_AUDIT_LOG', 'users'),
  getUserAuditLog
);

export default router;
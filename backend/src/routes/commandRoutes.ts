import { Router } from 'express';
import {
  getAllCommands,
  getCommandById,
  createCommand,
  updateCommandResult,
  cancelCommand,
  getCommandStatistics,
  bulkCommandOperation
} from '../controllers/commandController';
import { requirePermission } from '../middleware/auth';
import { validate, validateParams } from '../middleware/validation';
import {
  createCommandSchema,
  updateCommandResultSchema,
  bulkCommandSchema,
  commandIdParamSchema,
} from '../schemas/commandSchemas';

const router = Router();

// Authentication is applied at the mount point; authorization is per route.
// This router previously inherited a single commands:read check, which meant a
// VIEWER token could POST a WIPE_DEVICE command to the entire fleet.

// GET /api/commands - Get all commands with filtering
// Query params: page, limit, deviceId, command, status, startDate, endDate
router.get('/', requirePermission('commands', 'read'), getAllCommands);

// GET /api/commands/stats - Get command statistics
// Query params: deviceId, days
router.get('/stats', requirePermission('commands', 'read'), getCommandStatistics);

// GET /api/commands/:id - Get specific command by ID
router.get('/:id', requirePermission('commands', 'read'), validateParams(commandIdParamSchema), getCommandById);

// POST /api/commands - Create and send new command(s)
// Body: { deviceIds: string[], command: CommandType, parameters?, priority?, executeAt?, expiresAt? }
router.post('/', requirePermission('commands', 'create'), validate(createCommandSchema), createCommand);

// PUT /api/commands/:id/result - Update command result (called by device)
// Body: { result: CommandResult, status?: string }
// Device-facing, but the DEVICE role holds commands-self rather than commands:*, so
// devices cannot reach this over HTTP — see finding F-18. Guarded as a mutation so a
// read-only token cannot forge command results.
router.put('/:id/result', requirePermission('commands', 'update'), validateParams(commandIdParamSchema), validate(updateCommandResultSchema), updateCommandResult);

// PUT /api/commands/:id/cancel - Cancel pending command
router.put('/:id/cancel', requirePermission('commands', 'update'), validateParams(commandIdParamSchema), cancelCommand);

// POST /api/commands/bulk - Bulk command operations (cancel, retry)
// Body: { operation: 'cancel' | 'retry', commandIds: string[] }
// 'retry' re-dispatches commands, so this needs update rather than read.
router.post('/bulk', requirePermission('commands', 'update'), validate(bulkCommandSchema), bulkCommandOperation);

export default router;

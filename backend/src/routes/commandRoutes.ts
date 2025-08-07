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

const router = Router();

// GET /api/commands - Get all commands with filtering
// Query params: page, limit, deviceId, command, status, startDate, endDate
router.get('/', getAllCommands);

// GET /api/commands/stats - Get command statistics
// Query params: deviceId, days
router.get('/stats', getCommandStatistics);

// GET /api/commands/:id - Get specific command by ID
router.get('/:id', getCommandById);

// POST /api/commands - Create and send new command(s)
// Body: { deviceIds: string[], command: CommandType, parameters?, priority?, executeAt?, expiresAt? }
router.post('/', createCommand);

// PUT /api/commands/:id/result - Update command result (called by device)
// Body: { result: CommandResult, status?: string }
router.put('/:id/result', updateCommandResult);

// PUT /api/commands/:id/cancel - Cancel pending command
router.put('/:id/cancel', cancelCommand);

// POST /api/commands/bulk - Bulk command operations (cancel, retry)
// Body: { operation: 'cancel' | 'retry', commandIds: string[] }
router.post('/bulk', bulkCommandOperation);

export default router;
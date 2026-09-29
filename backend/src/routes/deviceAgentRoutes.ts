import express from 'express';
import { requireDevice } from '../middleware/deviceAuth';
import { validate } from '../middleware/validation';
import { deviceHeartbeatSchema } from '../schemas/deviceSchemas';
import {
  agentHeartbeat,
  agentPendingCommands,
  agentPolicies,
  agentCommandResult,
} from '../controllers/deviceAgentController';

/**
 * Routes the Android agent calls with its own device token.
 *
 * Mounted ahead of the operator routers on the same prefixes. `requireDevice` claims
 * only device-token requests and sends anything else on to the operator router, so the
 * operator API is unchanged.
 */

const device = requireDevice();

/** Mounted at /api/devices */
export const deviceAgentRoutes = express.Router();

deviceAgentRoutes.post('/:deviceId/heartbeat', device, validate(deviceHeartbeatSchema), agentHeartbeat);
deviceAgentRoutes.get('/:deviceId/commands/pending', device, agentPendingCommands);
deviceAgentRoutes.get('/:deviceId/policies', device, agentPolicies);

/** Mounted at /api/commands */
export const deviceCommandResultRoutes = express.Router();

// The agent's Retrofit client posts; the operator API historically documented PUT.
deviceCommandResultRoutes.post('/:commandId/result', device, agentCommandResult);
deviceCommandResultRoutes.put('/:commandId/result', device, agentCommandResult);

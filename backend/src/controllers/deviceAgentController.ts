import { Request, Response, NextFunction } from 'express';
import prisma from '../db';
import { authenticatedDeviceId } from '../middleware/deviceAuth';
import { recordHeartbeat, DeviceNotAllowedError } from '../services/telemetryService';
import { getCommandService } from '../services/commandServiceInstance';

/**
 * The agent-facing HTTP API: what `MDMApiService.kt` calls when it has no socket.
 *
 * Response shapes follow the agent's Retrofit models (`HeartbeatResponse`,
 * `List<RemoteCommand>`, `List<DevicePolicy>`), because that is what the agent parses.
 */

/** POST /api/devices/:deviceId/heartbeat */
export async function agentHeartbeat(req: Request, res: Response, next: NextFunction) {
  try {
    const { pendingCommands, nextHeartbeatMs } = await recordHeartbeat(
      authenticatedDeviceId(res),
      req.body
    );
    res.json({
      success: true,
      message: 'Heartbeat processed successfully',
      pendingCommands,
      nextHeartbeat: new Date(Date.now() + nextHeartbeatMs).toISOString()
    });
  } catch (error) {
    if (error instanceof DeviceNotAllowedError) {
      res.status(403).json({ error: error.message, code: 'DEVICE_REVOKED' });
      return;
    }
    next(error);
  }
}

/** GET /api/devices/:deviceId/commands/pending */
export async function agentPendingCommands(req: Request, res: Response, next: NextFunction) {
  try {
    const deviceId = authenticatedDeviceId(res);
    const commands = await getCommandService().takePendingCommands(deviceId);

    res.json(
      commands.map((c) => ({
        id: c.id,
        command: c.command,
        parameters: c.parameters ?? {},
        deviceId,
        priority: 'NORMAL',
        timeout: 30000,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
}

/** GET /api/devices/:deviceId/policies */
export async function agentPolicies(req: Request, res: Response, next: NextFunction) {
  try {
    const policies = await prisma.policy.findMany({
      where: { isActive: true, devices: { some: { deviceId: authenticatedDeviceId(res) } } },
      orderBy: { priority: 'desc' }
    });

    res.json(
      policies.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        type: p.type,
        rules: p.rules,
        targetDevices: p.targetDevices,
        priority: p.priority,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
}

/**
 * POST|PUT /api/commands/:commandId/result
 *
 * Accepts both result shapes the agent produces: the socket-style `{ success, result,
 * error }` and the Retrofit `CommandResult` with `status: SUCCESS | ERROR | ...`.
 */
export async function agentCommandResult(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body ?? {};
    const success =
      typeof body.success === 'boolean' ? body.success : String(body.status).toUpperCase() === 'SUCCESS';

    const accepted = await getCommandService().handleCommandResponse(
      authenticatedDeviceId(res),
      req.params.commandId as string,
      {
        success,
        data: body.result ?? body.data,
        ...(body.error ? { message: String(body.error) } : {}),
        timestamp: new Date()
      }
    );

    if (!accepted) {
      res.status(404).json({ error: 'Command not found for this device', code: 'COMMAND_NOT_FOUND' });
      return;
    }

    res.json({ success: true, message: 'Command result recorded' });
  } catch (error) {
    next(error);
  }
}

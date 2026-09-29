import { Prisma, ProvisioningDeviceStatus } from '@prisma/client';
import prisma from '../db';
import { emitToAdmins } from '../socket/registry';

/**
 * Recording what a device reports about a provisioning or field-configuration session.
 *
 * Two paths report progress: the agent's `provisioningProgress` socket event while a
 * PROVISION_DEVICE runs, and command results (which also arrive over HTTP when the
 * tablet has no socket). Both now come here.
 *
 * The socket handler used to append to `logs` with `{ push: ... }`, which Prisma only
 * supports on list columns; `logs` is JSON, so every progress report threw and nothing
 * was recorded. It also marked the whole session FAILED the moment one device failed,
 * while others were still running.
 */

const TERMINAL: ProvisioningDeviceStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export interface DeviceOutcome {
  status: ProvisioningDeviceStatus;
  currentStep?: string | null;
  completedSteps?: number;
  totalSteps?: number;
  errorMessage?: string | null;
  /** Appended to the progress record's log. */
  log?: { level: 'INFO' | 'WARN' | 'ERROR'; message: string; details?: unknown };
}

export async function recordDeviceOutcome(
  sessionId: string,
  deviceDbId: string,
  outcome: DeviceOutcome
): Promise<void> {
  const progress = await prisma.provisioningProgress.findUnique({
    where: { sessionId_deviceId: { sessionId, deviceId: deviceDbId } },
    select: { logs: true }
  });
  if (!progress) return; // not a device in this session

  const logs = Array.isArray(progress.logs) ? [...(progress.logs as Prisma.JsonArray)] : [];
  if (outcome.log) {
    logs.push({ timestamp: new Date().toISOString(), ...outcome.log } as Prisma.JsonObject);
  }

  const terminal = TERMINAL.includes(outcome.status);

  await prisma.provisioningProgress.update({
    where: { sessionId_deviceId: { sessionId, deviceId: deviceDbId } },
    data: {
      status: outcome.status,
      ...(outcome.currentStep !== undefined ? { currentStep: outcome.currentStep } : {}),
      ...(outcome.completedSteps !== undefined ? { completedSteps: outcome.completedSteps } : {}),
      ...(outcome.totalSteps !== undefined ? { totalSteps: outcome.totalSteps } : {}),
      errorMessage: outcome.errorMessage ?? null,
      logs: logs as Prisma.InputJsonValue,
      ...(terminal ? { completedAt: new Date() } : {})
    }
  });

  if (terminal) {
    if (outcome.status === 'COMPLETED' || outcome.status === 'FAILED') {
      await prisma.device.update({
        where: { id: deviceDbId },
        data: { provisioningStatus: outcome.status }
      });
    }
    await refreshSessionCounters(sessionId);
  }
}

/**
 * Recount a session from its devices. It stays IN_PROGRESS until every device has
 * finished, then becomes COMPLETED if none failed and FAILED otherwise.
 */
export async function refreshSessionCounters(sessionId: string): Promise<void> {
  const counts = await prisma.provisioningProgress.groupBy({
    by: ['status'],
    where: { sessionId },
    _count: { _all: true }
  });
  const count = (s: ProvisioningDeviceStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const total = counts.reduce((sum, c) => sum + c._count._all, 0);
  const completed = count('COMPLETED');
  const failed = count('FAILED');
  const finished = completed + failed + count('CANCELLED');

  const status = finished < total ? 'IN_PROGRESS' : failed > 0 ? 'FAILED' : 'COMPLETED';

  await prisma.provisioningSession.update({
    where: { id: sessionId },
    data: {
      completedDevices: completed,
      failedDevices: failed,
      status,
      ...(status !== 'IN_PROGRESS' ? { completedAt: new Date() } : {})
    }
  });

  emitToAdmins('provisioningSessionUpdate', { sessionId, status, completedDevices: completed, failedDevices: failed });
}

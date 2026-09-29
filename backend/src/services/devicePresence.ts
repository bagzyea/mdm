import { DeviceStatus, Prisma } from '@prisma/client';
import prisma from '../db';

/**
 * Device status and presence.
 *
 * `Device.status` holds two different kinds of state:
 *
 *  - **Presence** (ENROLLED, ACTIVE, INACTIVE) — whether the device is talking to us.
 *    The system changes this on its own: heartbeats, disconnects, the stale sweep.
 *  - **Lifecycle** (SUSPENDED, WIPED) — a decision an administrator made. Only an
 *    administrator may change it.
 *
 * Previously every heartbeat wrote `status: 'ACTIVE'` unconditionally, and the stale
 * sweep and socket disconnect wrote `INACTIVE` over anything that was not already
 * INACTIVE. A suspended tablet's next heartbeat therefore un-suspended it, and because
 * token refresh refuses only devices whose status is currently SUSPENDED or WIPED, it
 * also kept its credentials. Every automatic status write now goes through this module
 * and is conditional on the device still being in a presence state, so the database
 * enforces the rule atomically rather than a read-then-write in application code.
 */

/** Statuses the system may move between on its own. */
export const PRESENCE_STATUSES: DeviceStatus[] = ['ENROLLED', 'ACTIVE', 'INACTIVE'];

/** Statuses that mean a device must not connect or hold a credential. */
export const REVOKED_STATUSES: DeviceStatus[] = ['SUSPENDED', 'WIPED'];

/** Statuses a stale or disconnected device is moved out of. */
const ONLINE_STATUSES: DeviceStatus[] = ['ENROLLED', 'ACTIVE'];

/** A device is considered offline after this long without contact. */
export const STALE_AFTER_MS = 5 * 60 * 1000;

export function isRevoked(device: { status: DeviceStatus; isRetired: boolean }): boolean {
  return device.isRetired || REVOKED_STATUSES.includes(device.status);
}

/** Only presence statuses may be reported by a device about itself. */
export function isPresenceStatus(status: unknown): status is DeviceStatus {
  return typeof status === 'string' && (PRESENCE_STATUSES as string[]).includes(status);
}

export type DeviceAccess = 'allowed' | 'revoked' | 'unknown';

/** Whether a device may connect at all. Used at the socket handshake and by device HTTP routes. */
export async function getDeviceAccess(deviceId: string): Promise<DeviceAccess> {
  const device = await prisma.device.findUnique({
    where: { deviceId },
    select: { status: true, isRetired: true },
  });
  if (!device) return 'unknown';
  return isRevoked(device) ? 'revoked' : 'allowed';
}

/**
 * Record contact from a device, together with any telemetry fields, and set its presence
 * status (ACTIVE unless the device reported another presence status).
 *
 * Returns false — and writes nothing — when the device is unknown, retired, suspended or
 * wiped. Callers must then refuse the device rather than carry on as if it were online.
 */
export async function markDeviceSeen(
  deviceId: string,
  data: Prisma.DeviceUpdateManyMutationInput = {},
  status: DeviceStatus = 'ACTIVE'
): Promise<boolean> {
  if (!isPresenceStatus(status)) {
    throw new Error(`markDeviceSeen cannot set lifecycle status ${status}`);
  }
  const result = await prisma.device.updateMany({
    where: { deviceId, isRetired: false, status: { in: PRESENCE_STATUSES } },
    data: { ...data, lastSeen: new Date(), status },
  });
  return result.count > 0;
}

/** Mark a device INACTIVE after it disconnects. Never touches a lifecycle status. */
export async function markDeviceOffline(deviceId: string): Promise<boolean> {
  const result = await prisma.device.updateMany({
    where: { deviceId, status: { in: ONLINE_STATUSES } },
    data: { status: 'INACTIVE' },
  });
  return result.count > 0;
}

export interface StaleDevice {
  deviceId: string;
  lastSeen: Date;
}

/**
 * Move every device silent since before `threshold` to INACTIVE, and return exactly the
 * devices that were moved.
 *
 * One statement with RETURNING, because the previous findMany-then-updateMany pair raced
 * with heartbeats: a device that reported in between the two queries was not marked
 * inactive, yet still received an "offline" alert email.
 */
export async function sweepStaleDevices(
  threshold: Date = new Date(Date.now() - STALE_AFTER_MS)
): Promise<StaleDevice[]> {
  return prisma.$queryRaw<StaleDevice[]>`
    UPDATE "Device"
       SET "status" = 'INACTIVE'::"DeviceStatus", "updatedAt" = NOW()
     WHERE "lastSeen" < ${threshold}
       AND "status" IN ('ENROLLED'::"DeviceStatus", 'ACTIVE'::"DeviceStatus")
    RETURNING "deviceId", "lastSeen"
  `;
}

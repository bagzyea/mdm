import { Prisma } from '@prisma/client';
import type { DeviceHeartbeatData } from '@mdm/shared-types';
import prisma from '../db';
import { markDeviceSeen } from './devicePresence';
import { emitToAdmins } from '../socket/registry';

/**
 * The one heartbeat pipeline.
 *
 * Heartbeats used to be handled in four places — the socket `deviceHeartbeat` event,
 * the socket `message` event (the path the Android agent actually uses), and two HTTP
 * handlers — each with its own field mapping, response shape and event logging. They
 * had drifted: only one recorded storage and memory, only one skipped the event log,
 * and they disagreed on when the next heartbeat was due. Every entry point now calls
 * `recordHeartbeat`.
 */

export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Heartbeat telemetry is sampled into DeviceEvent at most this often per device.
 *
 * Writing one row per heartbeat is ~2,900 rows per device per day with nothing reading
 * them (finding F-22). The live values are on the Device row; the event log only needs
 * enough history to show a trend.
 */
export const HEARTBEAT_EVENT_SAMPLE_MS = 15 * 60 * 1000;

const lastSampledAt = new Map<string, number>();

export class DeviceNotAllowedError extends Error {
  constructor(readonly deviceId: string) {
    super('Device is not enrolled, or has been suspended, wiped or retired');
    this.name = 'DeviceNotAllowedError';
  }
}

export interface HeartbeatResult {
  pendingCommands: number;
  nextHeartbeatMs: number;
}

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/** Map the wire payload onto Device columns, writing only what the device reported. */
function toDeviceMetrics(hb: Partial<DeviceHeartbeatData>): Prisma.DeviceUpdateManyMutationInput {
  const data: Prisma.DeviceUpdateManyMutationInput = {};
  if (hb.batteryLevel !== undefined) data.batteryLevel = hb.batteryLevel;
  if (hb.isCharging !== undefined) data.isCharging = hb.isCharging;
  if (hb.location) data.location = json(hb.location);
  if (hb.networkInfo) data.networkInfo = json(hb.networkInfo);
  if (hb.systemHealth) data.systemHealth = json(hb.systemHealth);
  if (hb.appUsage) data.appUsageStats = json(hb.appUsage);
  if (hb.storageInfo) {
    data.totalStorage = BigInt(Math.trunc(hb.storageInfo.total));
    data.availableStorage = BigInt(Math.trunc(hb.storageInfo.available));
  }
  if (hb.memoryInfo) {
    data.totalRAM = BigInt(Math.trunc(hb.memoryInfo.total));
    data.availableRAM = BigInt(Math.trunc(hb.memoryInfo.available));
  }
  return data;
}

function shouldSample(deviceId: string, now: number): boolean {
  const last = lastSampledAt.get(deviceId);
  if (last !== undefined && now - last < HEARTBEAT_EVENT_SAMPLE_MS) return false;
  lastSampledAt.set(deviceId, now);
  return true;
}

/**
 * Apply a heartbeat from an authenticated device.
 *
 * @throws DeviceNotAllowedError when the device is unknown, suspended, wiped or retired.
 *         Nothing is written in that case; the caller should refuse or disconnect it.
 */
export async function recordHeartbeat(
  deviceId: string,
  hb: Partial<DeviceHeartbeatData>
): Promise<HeartbeatResult> {
  const seen = await markDeviceSeen(deviceId, toDeviceMetrics(hb));
  if (!seen) throw new DeviceNotAllowedError(deviceId);

  const now = new Date();

  if (shouldSample(deviceId, now.getTime())) {
    await prisma.deviceEvent.create({
      data: {
        device: { connect: { deviceId } },
        eventType: 'HEARTBEAT',
        eventData: json({
          batteryLevel: hb.batteryLevel,
          isCharging: hb.isCharging,
          storageInfo: hb.storageInfo,
          memoryInfo: hb.memoryInfo,
          networkInfo: hb.networkInfo,
          timestamp: now,
        }),
      },
    });
  }

  emitToAdmins('deviceHeartbeat', {
    deviceId,
    batteryLevel: hb.batteryLevel,
    isCharging: hb.isCharging,
    location: hb.location,
    networkInfo: hb.networkInfo,
    systemHealth: hb.systemHealth,
    storageInfo: hb.storageInfo,
    memoryInfo: hb.memoryInfo,
    lastSeen: now,
    status: 'ACTIVE',
  });

  const pendingCommands = await prisma.remoteCommand.count({
    where: { device: { deviceId }, status: 'PENDING' },
  });

  return { pendingCommands, nextHeartbeatMs: HEARTBEAT_INTERVAL_MS };
}

/** Forget sampling state. For tests. */
export function resetHeartbeatSampling(): void {
  lastSampledAt.clear();
}

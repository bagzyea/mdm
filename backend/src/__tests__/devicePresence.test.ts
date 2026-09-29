/**
 * Presence versus lifecycle status.
 *
 * A suspended tablet's heartbeat used to write `status: 'ACTIVE'` over the suspension, and
 * the stale sweep and socket disconnect wrote INACTIVE over SUSPENDED and WIPED. Token
 * refresh only refuses devices whose *current* status is revoked, so a suspended device
 * un-suspended itself and kept its credentials. These tests pin the rule into the
 * queries themselves: every automatic write is conditional on a presence status.
 */

const mockPrisma = {
  device: { updateMany: jest.fn(), findUnique: jest.fn() },
  deviceEvent: { create: jest.fn() },
  remoteCommand: { count: jest.fn() },
  $queryRaw: jest.fn(),
};

jest.mock('../db', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
  closeDatabase: jest.fn(),
}));

import {
  markDeviceSeen,
  markDeviceOffline,
  getDeviceAccess,
  isRevoked,
  PRESENCE_STATUSES,
} from '../services/devicePresence';
import {
  recordHeartbeat,
  DeviceNotAllowedError,
  resetHeartbeatSampling,
} from '../services/telemetryService';

describe('device presence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHeartbeatSampling();
  });

  it('only marks a device ACTIVE while it is in a presence status and not retired', async () => {
    mockPrisma.device.updateMany.mockResolvedValue({ count: 1 });

    await expect(markDeviceSeen('dev-1')).resolves.toBe(true);

    const { where, data } = mockPrisma.device.updateMany.mock.calls[0][0];
    expect(where).toEqual({ deviceId: 'dev-1', isRetired: false, status: { in: PRESENCE_STATUSES } });
    expect(where.status.in).not.toContain('SUSPENDED');
    expect(where.status.in).not.toContain('WIPED');
    expect(data.status).toBe('ACTIVE');
  });

  it('reports a suspended device as not seen, so callers refuse it', async () => {
    mockPrisma.device.updateMany.mockResolvedValue({ count: 0 });
    await expect(markDeviceSeen('dev-suspended')).resolves.toBe(false);
  });

  it('refuses to set a lifecycle status from a presence write', async () => {
    await expect(markDeviceSeen('dev-1', {}, 'SUSPENDED')).rejects.toThrow(/lifecycle status/);
    expect(mockPrisma.device.updateMany).not.toHaveBeenCalled();
  });

  it('never moves a suspended or wiped device to INACTIVE on disconnect', async () => {
    mockPrisma.device.updateMany.mockResolvedValue({ count: 0 });
    await markDeviceOffline('dev-1');

    const { where } = mockPrisma.device.updateMany.mock.calls[0][0];
    expect(where.status.in).toEqual(['ENROLLED', 'ACTIVE']);
  });

  it.each([
    [{ status: 'ACTIVE', isRetired: false }, 'allowed'],
    [{ status: 'INACTIVE', isRetired: false }, 'allowed'],
    [{ status: 'SUSPENDED', isRetired: false }, 'revoked'],
    [{ status: 'WIPED', isRetired: false }, 'revoked'],
    [{ status: 'ACTIVE', isRetired: true }, 'revoked'],
    [null, 'unknown'],
  ])('classifies %o as %s', async (device, expected) => {
    mockPrisma.device.findUnique.mockResolvedValue(device);
    await expect(getDeviceAccess('dev-1')).resolves.toBe(expected);
  });

  it('treats retirement as revocation', () => {
    expect(isRevoked({ status: 'ACTIVE', isRetired: true })).toBe(true);
  });
});

describe('heartbeat pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHeartbeatSampling();
    mockPrisma.remoteCommand.count.mockResolvedValue(2);
  });

  it('throws and writes no telemetry for a revoked device', async () => {
    mockPrisma.device.updateMany.mockResolvedValue({ count: 0 });

    await expect(recordHeartbeat('dev-suspended', { batteryLevel: 50 })).rejects.toBeInstanceOf(
      DeviceNotAllowedError
    );
    expect(mockPrisma.deviceEvent.create).not.toHaveBeenCalled();
  });

  it('maps metrics onto the device row and counts pending commands', async () => {
    mockPrisma.device.updateMany.mockResolvedValue({ count: 1 });

    const result = await recordHeartbeat('dev-1', {
      batteryLevel: 77,
      isCharging: true,
      storageInfo: { total: 1000, available: 400 },
    });

    const { data } = mockPrisma.device.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({
      batteryLevel: 77,
      isCharging: true,
      totalStorage: BigInt(1000),
      availableStorage: BigInt(400),
      status: 'ACTIVE',
    });
    expect(result).toEqual({ pendingCommands: 2, nextHeartbeatMs: 30_000 });
  });

  it('samples heartbeat events instead of writing one per heartbeat', async () => {
    mockPrisma.device.updateMany.mockResolvedValue({ count: 1 });

    await recordHeartbeat('dev-1', { batteryLevel: 10 });
    await recordHeartbeat('dev-1', { batteryLevel: 11 });
    await recordHeartbeat('dev-2', { batteryLevel: 12 });

    // One sample per device inside the window.
    expect(mockPrisma.deviceEvent.create).toHaveBeenCalledTimes(2);
  });
});

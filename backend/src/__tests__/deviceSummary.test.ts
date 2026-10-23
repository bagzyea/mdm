/**
 * Fleet counts (GET /api/devices/health/summary), 15 Oct 2026.
 *
 * The summary loaded every device row into memory, and the dashboard tiles were counted
 * in the browser from one page of the device list. The counts now come from the
 * database; this pins down what each figure means.
 */

const mockPrisma = {
  device: { groupBy: jest.fn(), count: jest.fn() },
  $queryRaw: jest.fn(),
};
jest.mock('../db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma, closeDatabase: jest.fn() }));

import { getDeviceHealthSummary } from '../controllers/deviceController';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('device health summary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts by status and by time since last seen, over the whole fleet', async () => {
    mockPrisma.device.groupBy.mockResolvedValue([
      { status: 'ACTIVE', _count: { _all: 4 } },
      { status: 'INACTIVE', _count: { _all: 10 } },
      { status: 'ENROLLED', _count: { _all: 1 } },
      { status: 'WIPED', _count: { _all: 2 } },
    ]);
    // retired, low battery, then the four last-seen buckets, in call order.
    const counts = [3, 5, 4, 2, 6, 3];
    mockPrisma.device.count.mockImplementation(() => Promise.resolve(counts.shift()));
    mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(7) }]);

    const res = mockRes();
    await getDeviceHealthSummary({} as any, res);

    const body = res.json.mock.calls[0][0];
    expect(body.totalDevices).toBe(17);
    expect(body.byStatus).toEqual({ ENROLLED: 1, ACTIVE: 4, INACTIVE: 10, SUSPENDED: 0, WIPED: 2 });
    // "Active" means reporting now. ENROLLED, with no heartbeat yet, used to count too.
    expect(body.activeDevices).toBe(4);
    expect(body.enrolledDevices).toBe(1);
    expect(body.revokedDevices).toBe(2);
    expect(body.retiredDevices).toBe(3);
    expect(body.lowBatteryDevices).toBe(5);
    expect(body.lowStorageDevices).toBe(7);
    expect(body.lastSeen).toEqual({ within24h: 4, from1to3Days: 2, from3to7Days: 6, over7Days: 3 });
    expect(body.offlineDevices).toBe(2 + 6 + 3);
  });

  it('never loads device rows to count them', async () => {
    mockPrisma.device.groupBy.mockResolvedValue([]);
    mockPrisma.device.count.mockResolvedValue(0);
    mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

    // The mock has no findMany: loading rows would throw and end in a 500.
    const res = mockRes();
    await getDeviceHealthSummary({} as any, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].totalDevices).toBe(0);
  });
});

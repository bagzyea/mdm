/**
 * Field configuration and provisioning outcomes come from the devices.
 *
 * Field configuration used to mark every device COMPLETED without sending anything.
 * Progress reports from the agent threw on `logs: { push }` against a JSON column, so
 * none was recorded; and the first failure marked the whole session FAILED while other
 * devices were still running.
 */

const mockPrisma: any = {
  provisioningProgress: { findUnique: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
  provisioningSession: { update: jest.fn() },
  device: { update: jest.fn() },
  remoteCommand: { findUnique: jest.fn(), update: jest.fn() },
  deviceEvent: { create: jest.fn() },
};

jest.mock('../db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma, closeDatabase: jest.fn() }));
jest.mock('../socket/registry', () => ({
  emitToAdmins: jest.fn(),
  deviceRoom: (id: string) => `device_${id}`,
}));

import { recordDeviceOutcome, refreshSessionCounters } from '../services/provisioningOutcome';
import { CommandService } from '../services/commandService';

const group = (entries: Record<string, number>) =>
  Object.entries(entries).map(([status, n]) => ({ status, _count: { _all: n } }));

describe('provisioning outcomes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.provisioningProgress.findUnique.mockResolvedValue({ logs: [{ message: 'earlier' }] });
  });

  it('appends to the JSON log instead of using a list-only push', async () => {
    mockPrisma.provisioningProgress.groupBy.mockResolvedValue(group({ PENDING: 1 }));

    await recordDeviceOutcome('s-1', 'db-1', { status: 'INSTALLING_APPS', log: { level: 'INFO', message: 'step' } });

    const { data } = mockPrisma.provisioningProgress.update.mock.calls[0][0];
    expect(data.logs).toHaveLength(2);
    expect(data.logs[1]).toMatchObject({ level: 'INFO', message: 'step' });
  });

  it('keeps the session IN_PROGRESS while any device is still working', async () => {
    mockPrisma.provisioningProgress.groupBy.mockResolvedValue(group({ FAILED: 1, PENDING: 2 }));

    await refreshSessionCounters('s-1');

    expect(mockPrisma.provisioningSession.update.mock.calls[0][0].data).toMatchObject({
      status: 'IN_PROGRESS',
      failedDevices: 1,
    });
  });

  it.each([
    [{ COMPLETED: 3 }, 'COMPLETED'],
    [{ COMPLETED: 2, FAILED: 1 }, 'FAILED'],
  ])('settles a finished session %o as %s', async (counts, expected) => {
    mockPrisma.provisioningProgress.groupBy.mockResolvedValue(group(counts));
    await refreshSessionCounters('s-1');
    expect(mockPrisma.provisioningSession.update.mock.calls[0][0].data.status).toBe(expected);
  });

  it("settles a device's field configuration from the command result", async () => {
    mockPrisma.remoteCommand.findUnique.mockResolvedValue({
      id: 'cmd-1',
      deviceId: 'db-1',
      command: 'APPLY_FIELD_CONFIGURATION',
      parameters: { sessionId: 's-1' },
      device: { deviceId: 'tab-1' },
    });
    mockPrisma.provisioningProgress.groupBy.mockResolvedValue(group({ FAILED: 1 }));
    const service = new CommandService({ to: () => ({ emit: jest.fn() }) } as any);

    await service.handleCommandResponse('tab-1', 'cmd-1', {
      success: false,
      message: 'Applied 1 of 3 settings. Not applied: security.passwordMinLength (requires Device Owner)',
      data: { applied: 1, total: 3 },
      timestamp: new Date(),
    });

    const { where, data } = mockPrisma.provisioningProgress.update.mock.calls[0][0];
    expect(where).toEqual({ sessionId_deviceId: { sessionId: 's-1', deviceId: 'db-1' } });
    expect(data).toMatchObject({ status: 'FAILED', completedSteps: 1, totalSteps: 3 });
    expect(data.errorMessage).toMatch(/requires Device Owner/);
    expect(mockPrisma.device.update).toHaveBeenCalledWith({ where: { id: 'db-1' }, data: { provisioningStatus: 'FAILED' } });
  });
});

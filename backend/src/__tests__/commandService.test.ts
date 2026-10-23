import { Server as SocketIOServer } from 'socket.io';

/**
 * CommandService reads the shared client from src/db.ts, so that module is what has to
 * be mocked. This suite previously assigned its mock to `(global as any).prisma`, which
 * the service never consulted — so every query returned undefined and the assertions
 * failed regardless of the code under test.
 */
const mockPrisma = {
  remoteCommand: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  deviceEvent: { create: jest.fn() },
  device: { findUnique: jest.fn(), update: jest.fn() },
};

jest.mock('../db', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
  closeDatabase: jest.fn(),
}));

import { CommandService } from '../services/commandService';

describe('CommandService', () => {
  let commandService: CommandService;
  let mockIO: jest.Mocked<SocketIOServer>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockIO = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() })
    } as any;

    commandService = new CommandService(mockIO);
  });

  describe('handleCommandResponse', () => {
    it('should handle successful command response', async () => {
      const commandId = 'cmd-123';
      const deviceId = 'device-456';
      const result = { success: true, message: 'Command executed', timestamp: new Date() };

      // Mock the database query
      (mockPrisma.remoteCommand.findUnique as jest.Mock).mockResolvedValue({
        id: commandId,
        device: { deviceId },
        deviceId: 'device-db-id',
        command: 'LOCK_DEVICE'
      });

      (mockPrisma.remoteCommand.update as jest.Mock).mockResolvedValue({
        id: commandId,
        status: 'EXECUTED'
      });

      (mockPrisma.deviceEvent.create as jest.Mock).mockResolvedValue({
        id: 'event-123'
      });

      const response = await commandService.handleCommandResponse(deviceId, commandId, result);

      expect(response).toBe(true);
      expect(mockPrisma.remoteCommand.update).toHaveBeenCalledWith({
        where: { id: commandId },
        data: {
          status: 'EXECUTED',
          result
        }
      });
      expect(mockIO.to).toHaveBeenCalledWith('admins');
    });

    it('should handle failed command response', async () => {
      const commandId = 'cmd-123';
      const deviceId = 'device-456';
      const result = { success: false, message: 'Command failed', timestamp: new Date() };

      (mockPrisma.remoteCommand.findUnique as jest.Mock).mockResolvedValue({
        id: commandId,
        device: { deviceId },
        deviceId: 'device-db-id',
        command: 'LOCK_DEVICE'
      });

      (mockPrisma.remoteCommand.update as jest.Mock).mockResolvedValue({
        id: commandId,
        status: 'FAILED'
      });

      (mockPrisma.deviceEvent.create as jest.Mock).mockResolvedValue({
        id: 'event-123'
      });

      const response = await commandService.handleCommandResponse(deviceId, commandId, result);

      expect(response).toBe(true);
      expect(mockPrisma.remoteCommand.update).toHaveBeenCalledWith({
        where: { id: commandId },
        data: {
          status: 'FAILED',
          result
        }
      });
    });

    it('should reject command from mismatched device', async () => {
      const commandId = 'cmd-123';
      const deviceId = 'device-456';
      const wrongDeviceId = 'device-wrong';
      const result = { success: true, timestamp: new Date() };

      (mockPrisma.remoteCommand.findUnique as jest.Mock).mockResolvedValue({
        id: commandId,
        device: { deviceId },
        deviceId: 'device-db-id',
        command: 'LOCK_DEVICE'
      });

      const response = await commandService.handleCommandResponse(wrongDeviceId, commandId, result);

      expect(response).toBe(false);
      expect(mockPrisma.remoteCommand.update).not.toHaveBeenCalled();
    });

    it('should handle non-existent command', async () => {
      const commandId = 'non-existent';
      const deviceId = 'device-456';
      const result = { success: true, timestamp: new Date() };

      (mockPrisma.remoteCommand.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await commandService.handleCommandResponse(deviceId, commandId, result);

      expect(response).toBe(false);
      expect(mockPrisma.remoteCommand.update).not.toHaveBeenCalled();
    });
  });

  describe('delivery and queue (F-25)', () => {
    let emit: jest.Mock;
    let fetchSockets: jest.Mock;

    beforeEach(() => {
      emit = jest.fn();
      fetchSockets = jest.fn();
      mockIO = {
        to: jest.fn().mockReturnValue({ emit }),
        in: jest.fn().mockReturnValue({ fetchSockets }),
      } as any;
      commandService = new CommandService(mockIO);
    });

    it("pushes to the device's own room instead of scanning every socket", async () => {
      fetchSockets.mockResolvedValue([{ id: 'sock-1' }]);

      const sent = await commandService.notifyDeviceOfCommand('tab-1', 'cmd-1', 'LOCK_DEVICE', {});

      expect(sent).toBe(true);
      expect(mockIO.in).toHaveBeenCalledWith('device_tab-1');
      expect(mockIO.to).toHaveBeenCalledWith('device_tab-1');
      expect(emit).toHaveBeenCalledWith('executeCommand', expect.objectContaining({ commandId: 'cmd-1' }));
      expect(mockPrisma.remoteCommand.update).toHaveBeenCalledWith({ where: { id: 'cmd-1' }, data: { status: 'SENT' } });
    });

    it('leaves the command PENDING for polling when the device is not connected', async () => {
      fetchSockets.mockResolvedValue([]);

      const sent = await commandService.notifyDeviceOfCommand('tab-1', 'cmd-1', 'LOCK_DEVICE', {});

      expect(sent).toBe(false);
      expect(emit).not.toHaveBeenCalled();
      expect(mockPrisma.remoteCommand.update).not.toHaveBeenCalled();
    });

    it('expires commands only after the configured TTL, not after five minutes', async () => {
      mockPrisma.remoteCommand.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.remoteCommand.findMany.mockResolvedValue([]);

      const before = Date.now();
      await commandService.processCommandQueue();

      const { where, data } = mockPrisma.remoteCommand.updateMany.mock.calls[0][0];
      expect(where.status).toBe('PENDING');
      const cutoffAgeMs = before - where.createdAt.lt.getTime();
      expect(cutoffAgeMs).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000);
      expect(data.status).toBe('FAILED');
    });

    it('retries only commands for connected devices', async () => {
      mockPrisma.remoteCommand.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.remoteCommand.findMany.mockResolvedValue([]);

      await commandService.processCommandQueue();

      expect(mockPrisma.remoteCommand.findMany.mock.calls[0][0].where).toEqual({
        status: 'PENDING',
        device: { status: 'ACTIVE' },
      });
    });
  });
});

describe('CommandService.createCommands — the one creation path', () => {
  const { UnsupportedCommandError, CommandRequestError } = jest.requireActual('../services/commandService');

  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.device as any).findMany = jest.fn();
    (mockPrisma.remoteCommand as any).createManyAndReturn = jest.fn();
    (mockPrisma.deviceEvent as any).createMany = jest.fn();
  });

  const service = () =>
    new CommandService({
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }),
    } as any);

  it('refuses a command the agent does not implement, before touching the database', async () => {
    await expect(service().createCommands({ deviceIds: ['d1'], command: 'WIPE_DEVICE' })).rejects.toBeInstanceOf(
      UnsupportedCommandError
    );
    expect((mockPrisma.device as any).findMany).not.toHaveBeenCalled();
  });

  it('requires a policyId for policy commands', async () => {
    await expect(service().createCommands({ deviceIds: ['d1'], command: 'APPLY_POLICY' })).rejects.toBeInstanceOf(
      CommandRequestError
    );
  });

  it('never queues commands for suspended, wiped or retired devices', async () => {
    (mockPrisma.device as any).findMany.mockResolvedValue([
      { id: 'db-1', deviceId: 'tab-1', status: 'INACTIVE', isRetired: false },
      { id: 'db-2', deviceId: 'tab-2', status: 'SUSPENDED', isRetired: false },
      { id: 'db-3', deviceId: 'tab-3', status: 'ACTIVE', isRetired: true },
    ]);
    (mockPrisma.remoteCommand as any).createManyAndReturn.mockImplementation(({ data }: any) =>
      data.map((d: any, i: number) => ({ id: `cmd-${i}`, ...d }))
    );

    const result = await service().createCommands({ deviceIds: ['tab-1', 'tab-2', 'tab-3'], command: 'LOCK_DEVICE' });

    // The offline (INACTIVE) tablet is still queued — it collects the command by poll.
    expect(result.commands.map((c: any) => c.deviceId)).toEqual(['db-1']);
    expect(result.devicesSkipped.sort()).toEqual(['tab-2', 'tab-3']);
    expect((mockPrisma.deviceEvent as any).createMany).toHaveBeenCalled();
  });

  it('reports which commands were delivered and when queued ones expire', async () => {
    const createdAt = new Date('2026-10-15T09:00:00Z');
    (mockPrisma.device as any).findMany.mockResolvedValue([
      { id: 'db-1', deviceId: 'tab-online', status: 'ACTIVE', isRetired: false },
      { id: 'db-2', deviceId: 'tab-offline', status: 'INACTIVE', isRetired: false },
    ]);
    (mockPrisma.remoteCommand as any).createManyAndReturn.mockImplementation(({ data }: any) =>
      data.map((d: any, i: number) => ({ id: `cmd-${i}`, createdAt, ...d }))
    );
    (mockPrisma.remoteCommand.update as jest.Mock).mockResolvedValue({});
    const io = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      // Only the first tablet has an open socket.
      in: jest.fn((room: string) => ({
        fetchSockets: jest.fn().mockResolvedValue(room.includes('tab-online') ? [{}] : []),
      })),
    } as any;

    const result = await new CommandService(io).createCommands({
      deviceIds: ['tab-online', 'tab-offline'],
      command: 'LOCK_DEVICE',
    });

    // The rows are read back before dispatch; the response must not say PENDING for a
    // command that was delivered, or the dashboard tells the operator it was queued.
    expect(result.commands.map((c: any) => c.status)).toEqual(['SENT', 'PENDING']);
    expect(result.notificationsSent).toBe(1);
    expect(result.expiresAt.getTime()).toBe(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it('reports no eligible devices when every target is revoked', async () => {
    (mockPrisma.device as any).findMany.mockResolvedValue([
      { id: 'db-2', deviceId: 'tab-2', status: 'WIPED', isRetired: false },
    ]);

    await expect(service().createCommands({ deviceIds: ['tab-2'], command: 'LOCK_DEVICE' })).rejects.toMatchObject({
      code: 'NO_ELIGIBLE_DEVICES',
    });
  });
});

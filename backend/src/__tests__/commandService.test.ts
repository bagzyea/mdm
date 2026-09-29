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

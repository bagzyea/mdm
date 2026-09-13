import { Server as SocketIOServer } from 'socket.io';

/**
 * CommandService reads the shared client from src/db.ts, so that module is what has to
 * be mocked. This suite previously assigned its mock to `(global as any).prisma`, which
 * the service never consulted — so every query returned undefined and the assertions
 * failed regardless of the code under test.
 */
const mockPrisma = {
  remoteCommand: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
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
});

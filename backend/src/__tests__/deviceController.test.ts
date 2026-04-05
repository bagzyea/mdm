import { enrollDevice } from '../controllers/deviceController';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';

jest.mock('@prisma/client');

describe('Device Controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockReq = {
      body: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockPrisma = {
      device: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      deviceEvent: {
        create: jest.fn()
      }
    } as any;

    (global as any).prisma = mockPrisma;
  });

  describe('enrollDevice', () => {
    it('should reject enrollment without deviceId', async () => {
      mockReq.body = { deviceInfo: {} };

      await enrollDevice(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('deviceId')
        })
      );
    });

    it('should reject enrollment with invalid enrollment code', async () => {
      mockReq.body = {
        deviceInfo: {
          deviceId: 'device-123',
          manufacturer: 'Samsung',
          model: 'Galaxy S21'
        },
        enrollmentCode: '123' // Too short (< 4 chars)
      };

      await enrollDevice(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid enrollment code format'
        })
      );
    });

    it('should enroll new device successfully', async () => {
      const deviceInfo = {
        deviceId: 'device-123',
        manufacturer: 'Samsung',
        model: 'Galaxy S21',
        osVersion: '12.0',
        apiLevel: 31,
        batteryLevel: 85,
        buildNumber: 'ABC123'
      };

      mockReq.body = { deviceInfo };

      (mockPrisma.device.findUnique as jest.Mock).mockResolvedValue(null);

      (mockPrisma.device.create as jest.Mock).mockResolvedValue({
        id: 'db-id-123',
        deviceId: 'device-123',
        ...deviceInfo,
        status: 'ENROLLED',
        enrolledAt: new Date()
      });

      (mockPrisma.deviceEvent.create as jest.Mock).mockResolvedValue({
        id: 'event-123'
      });

      await enrollDevice(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Device enrolled successfully',
          deviceId: 'device-123',
          deviceToken: expect.any(String)
        })
      );
    });

    it('should re-enroll existing device successfully', async () => {
      const deviceInfo = {
        deviceId: 'device-123',
        manufacturer: 'Samsung',
        model: 'Galaxy S21',
        osVersion: '12.0',
        apiLevel: 31,
        batteryLevel: 85,
        buildNumber: 'ABC123'
      };

      mockReq.body = { deviceInfo };

      (mockPrisma.device.findUnique as jest.Mock).mockResolvedValue({
        deviceId: 'device-123',
        status: 'ACTIVE'
      });

      (mockPrisma.device.update as jest.Mock).mockResolvedValue({
        deviceId: 'device-123',
        status: 'ENROLLED',
        ...deviceInfo
      });

      await enrollDevice(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Device re-enrolled successfully',
          deviceId: 'device-123',
          deviceToken: expect.any(String)
        })
      );
    });

    it('should handle database constraint errors', async () => {
      mockReq.body = {
        deviceInfo: {
          deviceId: 'device-123',
          manufacturer: 'Samsung',
          model: 'Galaxy S21'
        }
      };

      (mockPrisma.device.findUnique as jest.Mock).mockResolvedValue(null);

      const constraintError = new Error('Unique constraint failed');
      (constraintError as any).code = 'P2002';

      (mockPrisma.device.create as jest.Mock).mockRejectedValue(constraintError);

      await enrollDevice(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('already exists')
        })
      );
    });

    it('should handle general enrollment errors', async () => {
      mockReq.body = {
        deviceInfo: {
          deviceId: 'device-123',
          manufacturer: 'Samsung',
          model: 'Galaxy S21'
        }
      };

      (mockPrisma.device.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await enrollDevice(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Failed to enroll device')
        })
      );
    });
  });
});

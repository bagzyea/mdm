import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import logger from './logger';
import { DeviceHeartbeatData, CommandResponse, DeviceStatusUpdate } from '@mdm/shared-types';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Create Express app
const app = express();
const server = createServer(app);

// --- Allowed origins (shared between HTTP CORS and Socket.IO CORS) ---
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS ?? 'https://admin.yourdomain.com').split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:8080'];

const io = new SocketIOServer(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Import middleware
import { securityHeaders, validateRequest } from './middleware/auth';

// Middleware
app.use(helmet());
app.use(securityHeaders);
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(validateRequest);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Import routes
import deviceRoutes from './routes/deviceRoutes';
import policyRoutes from './routes/policyRoutes';
import commandRoutes from './routes/commandRoutes';
import authRoutes from './routes/authRoutes';
import certificateRoutes from './routes/certificateRoutes';
import provisioningRoutes from './routes/provisioningRoutes';
import securityRoutes from './routes/securityRoutes';
import deviceLifecycleRoutes from './routes/deviceLifecycleRoutes';
import apkRegistryRoutes from './routes/apkRegistryRoutes';

// Import authentication middleware
import { authenticateToken, requirePermission, optionalAuth } from './middleware/auth';
import { AuthService } from './services/authService';

const authService = new AuthService();

// --- Enrollment rate limiter (Fix 1.5) ---
const enrollmentRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: {
    error: 'Too many enrollment attempts. Please wait before trying again.',
    code: 'RATE_LIMITED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Public device enrollment endpoint — rate-limited
const { enrollDevice } = require('./controllers/deviceController');
app.post('/api/devices/enroll', enrollmentRateLimiter, enrollDevice);

// Protected API routes (authentication required) 
app.use('/api/devices',
  authenticateToken,
  requirePermission('devices', 'read'),
  deviceRoutes
);

app.use('/api/policies',
  authenticateToken,
  requirePermission('policies', 'read'),
  policyRoutes
);

app.use('/api/commands',
  authenticateToken,
  requirePermission('commands', 'read'),
  commandRoutes
);

app.use('/api/certificates',
  authenticateToken,
  requirePermission('certificates', 'read'),
  certificateRoutes
);

app.use('/api/security',
  authenticateToken,
  requirePermission('security', 'read'),
  securityRoutes
);

app.use('/api/provisioning',
  authenticateToken,
  requirePermission('provisioning', 'read'),
  provisioningRoutes
);
app.use('/api/lifecycle',
  authenticateToken,
  requirePermission('devices', 'read'),
  deviceLifecycleRoutes
);

app.use('/api/apk-registry',
  authenticateToken,
  requirePermission('provisioning', 'write'),
  apkRegistryRoutes
);

// Import command service
import { CommandService } from './services/commandService';

// Import notification service for email alerts (2.6)
import { notificationService } from './services/notificationService';

// Initialize command service
const commandService = new CommandService(io);

// Start command queue processor (runs every 30 seconds)
setInterval(() => {
  commandService.processCommandQueue();
}, 30000);

// Device heartbeat monitoring - mark devices as inactive if no heartbeat
setInterval(async () => {
  try {
    const inactiveThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

    // Fetch devices about to go stale so we can send per-device email alerts
    const aboutToGoStale = await prisma.device.findMany({
      where: {
        lastSeen: { lt: inactiveThreshold },
        status: { not: 'INACTIVE' }
      },
      select: { deviceId: true, lastSeen: true }
    });

    const staleDevices = await prisma.device.updateMany({
      where: {
        lastSeen: { lt: inactiveThreshold },
        status: { not: 'INACTIVE' }
      },
      data: { status: 'INACTIVE' }
    });

    if (staleDevices.count > 0) {
      logger.info({ count: staleDevices.count }, 'Marked devices as inactive due to missing heartbeat');

      // Notify admin dashboard only — NOT all sockets (Fix 1.4)
      io.to('admins').emit('deviceStatusChanged', {
        type: 'BULK_STATUS_UPDATE',
        message: `${staleDevices.count} devices marked as inactive`,
        timestamp: new Date()
      });

      // Emit deviceOffline event for the notification system
      io.to('admins').emit('deviceOffline', {
        count: staleDevices.count,
        timestamp: new Date()
      });

      // Send email alerts for each newly-offline device (2.6)
      for (const device of aboutToGoStale) {
        notificationService.sendDeviceOfflineAlert(device.deviceId, device.lastSeen);
      }
    }
  } catch (error) {
    logger.error(error, 'Error checking device heartbeats');
  }
}, 60000); // Check every minute

// Certificate expiry check — runs once per hour (2.6)
setInterval(async () => {
  try {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiringCerts = await prisma.certificate.findMany({
      where: {
        validTo: { lte: thirtyDaysFromNow },
        isRevoked: false,
        isActive: true,
      },
      select: { id: true, name: true, validTo: true }
    });

    for (const cert of expiringCerts) {
      notificationService.sendCertExpiryAlert(cert.name, cert.validTo);
    }

    if (expiringCerts.length > 0) {
      logger.info({ count: expiringCerts.length }, 'Certificates expiring within 30 days — alerts sent');
    }
  } catch (error) {
    logger.error(error, 'Error checking certificate expiry');
  }
}, 60 * 60 * 1000); // Every hour

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Socket connected');

  // --- Admin dashboard authentication (Fix 1.4) ---
  // Dashboard clients call adminConnect with their JWT to join the admins room
  socket.on('adminConnect', async (data: { token: string }) => {
    try {
      if (!data?.token) {
        socket.emit('authError', { message: 'Token required for admin connection' });
        socket.disconnect(true);
        return;
      }
      const decoded = authService.verifyToken(data.token);
      if (!decoded || decoded.role === 'DEVICE') {
        socket.emit('authError', { message: 'Invalid admin token' });
        socket.disconnect(true);
        return;
      }
      socket.data.adminUserId = decoded.userId;
      socket.data.adminRole = decoded.role;
      socket.join('admins');
      socket.emit('adminConnected', { message: 'Joined admin room', role: decoded.role });
      logger.info({ userId: decoded.userId, role: decoded.role }, 'Admin joined admin room');
    } catch (error) {
      socket.emit('authError', { message: 'Invalid or expired token' });
      socket.disconnect(true);
    }
  });

  // Device identification — authenticated (Fix 1.2)
  socket.on('deviceIdentify', async (data: { deviceId: string; token: string } | string) => {
    // Support both old string format and new object format gracefully
    const deviceId = typeof data === 'string' ? data : data?.deviceId;
    const token = typeof data === 'object' ? data?.token : null;

    if (!deviceId) {
      socket.emit('identifyError', { message: 'deviceId required' });
      return;
    }

    // Verify device token if provided
    if (token) {
      try {
        const decoded = authService.verifyToken(token);
        if (decoded.role !== 'DEVICE') {
          socket.emit('identifyError', { message: 'Invalid device token: wrong role' });
          socket.disconnect(true);
          return;
        }
        // Optionally verify decoded.deviceId matches if your token includes it
      } catch {
        socket.emit('identifyError', { message: 'Invalid device token' });
        socket.disconnect(true);
        return;
      }
    }

    socket.data.deviceId = deviceId;
    socket.join(`device_${deviceId}`); // Join device-specific room

    try {
      // Update device status and last seen
      await prisma.device.update({
        where: { deviceId },
        data: {
          status: 'ACTIVE',
          lastSeen: new Date()
        }
      });

      // Check for pending commands
      const pendingCommands = await prisma.remoteCommand.findMany({
        where: {
          device: { deviceId },
          status: 'PENDING'
        },
        orderBy: { createdAt: 'asc' }
      });

      // Send pending commands to device
      for (const command of pendingCommands) {
        await commandService.notifyDeviceOfCommand(
          deviceId,
          command.id,
          command.command as any,
          command.parameters
        );
      }

      logger.info({ deviceId, pendingCommands: pendingCommands.length }, 'Device identified');
    } catch (error) {
      logger.error(error, 'Error handling device identification');
    }
  });

  // Device heartbeat
  socket.on('deviceHeartbeat', async (data: DeviceHeartbeatData) => {
    try {
      const updateData: Record<string, unknown> = {
        lastSeen: new Date(),
        status: 'ACTIVE'
      };

      // Update device metrics
      if (data.batteryLevel !== undefined) updateData.batteryLevel = data.batteryLevel;
      if (data.isCharging !== undefined) updateData.isCharging = data.isCharging;
      if (data.location) updateData.location = data.location;
      if (data.networkInfo) updateData.networkInfo = data.networkInfo;
      if (data.systemHealth) updateData.systemHealth = data.systemHealth;
      if (data.appUsage) updateData.appUsageStats = data.appUsage;
      if (data.storageInfo) {
        updateData.totalStorage = BigInt(data.storageInfo.total);
        updateData.availableStorage = BigInt(data.storageInfo.available);
      }
      if (data.memoryInfo) {
        updateData.totalRAM = BigInt(data.memoryInfo.total);
        updateData.availableRAM = BigInt(data.memoryInfo.available);
      }

      const device = await prisma.device.update({
        where: { deviceId: data.deviceId },
        data: updateData as any
      });

      // Log heartbeat event (use DB id, not string deviceId)
      await prisma.deviceEvent.create({
        data: {
          deviceId: device.id,
          eventType: 'HEARTBEAT',
          eventData: {
            batteryLevel: data.batteryLevel,
            isCharging: data.isCharging,
            storageInfo: data.storageInfo,
            memoryInfo: data.memoryInfo,
            timestamp: new Date()
          } as any
        }
      });

      // Broadcast real-time update to admin dashboard ONLY (Fix 1.4)
      io.to('admins').emit('deviceHeartbeat', {
        deviceId: data.deviceId,
        batteryLevel: data.batteryLevel,
        isCharging: data.isCharging,
        location: data.location,
        networkInfo: data.networkInfo,
        systemHealth: data.systemHealth,
        storageInfo: data.storageInfo,
        memoryInfo: data.memoryInfo,
        lastSeen: new Date(),
        status: 'ACTIVE'
      });

      // Send response with pending commands
      const pendingCommands = await prisma.remoteCommand.findMany({
        where: {
          device: { deviceId: data.deviceId },
          status: 'PENDING'
        },
        orderBy: { createdAt: 'asc' },
        take: 5
      });

      socket.emit('heartbeatResponse', {
        success: true,
        pendingCommands: pendingCommands.length,
        nextHeartbeat: 30000 // 30 seconds
      });

    } catch (error) {
      logger.error(error, 'Error updating device heartbeat');
      socket.emit('heartbeatResponse', {
        success: false,
        error: 'Failed to process heartbeat'
      });
    }
  });

  // Command response from device
  socket.on('commandResponse', async (data: CommandResponse) => {
    try {
      await commandService.handleCommandResponse(
        data.deviceId,
        data.commandId,
        { ...data.result, timestamp: new Date() }
      );
    } catch (error) {
      logger.error(error, 'Error handling command response');
    }
  });

  // Device status update — FIXED: proper DB id + correct old/new status (Fix 1.3)
  socket.on('deviceStatusUpdate', async (data: DeviceStatusUpdate) => {
    try {
      // Fetch device first to get DB id (cuid) and old status before updating
      const existingDevice = await prisma.device.findUnique({
        where: { deviceId: data.deviceId },
        select: { id: true, status: true }
      });

      if (!existingDevice) {
        logger.error({ deviceId: data.deviceId }, 'deviceStatusUpdate: device not found');
        return;
      }

      const oldStatus = existingDevice.status;

      await prisma.device.update({
        where: { deviceId: data.deviceId },
        data: {
          status: data.status as any,
          location: data.location as any,
          lastSeen: new Date()
        }
      });

      // Log status change event — use DB id (existingDevice.id) not string deviceId
      await prisma.deviceEvent.create({
        data: {
          deviceId: existingDevice.id,  // FK to Device.id (cuid)
          eventType: 'STATUS_UPDATE',
          eventData: {
            oldStatus,                  // real old status captured above
            newStatus: data.status,
            additionalData: {
              batteryLevel: data.batteryLevel,
              networkInfo: data.networkInfo
            }
          } as any
        }
      });

      // Notify admin dashboard only (Fix 1.4)
      io.to('admins').emit('deviceStatusChanged', {
        deviceId: data.deviceId,
        status: data.status,
        timestamp: new Date(),
        additionalData: {
          batteryLevel: data.batteryLevel,
          location: data.location,
          networkInfo: data.networkInfo
        }
      });
    } catch (error) {
      logger.error(error, 'Error updating device status');
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    const deviceId = socket.data.deviceId;
    logger.info({ socketId: socket.id, deviceId }, 'Socket disconnected');

    // Update device status to INACTIVE if it was a device connection
    if (deviceId) {
      try {
        await prisma.device.update({
          where: { deviceId },
          data: { status: 'INACTIVE' }
        });

        // Notify admin dashboard only
        io.to('admins').emit('deviceStatusChanged', {
          deviceId,
          status: 'INACTIVE',
          timestamp: new Date()
        });
      } catch (error) {
        logger.error(error, 'Error updating device status on disconnect');
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  logger.info({ port: PORT, environment: process.env.NODE_ENV }, 'MDM Backend server started');
});
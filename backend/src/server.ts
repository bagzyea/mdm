import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import logger from './logger';
// Imported for its side effect: validates required secrets and refuses to start without them.
import './config/env';
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

// Serve uploaded APKs publicly (Android devices fetch during Zero-Touch provisioning)
app.use('/public/apks', express.static(path.join(__dirname, '../public/apks')));

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
import { authenticateToken } from './middleware/auth';
import { installSocketAuth, resolveDeviceId, joinIdentityRooms } from './socket/auth';
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

// Protected API routes.
//
// Mounts establish authentication only. Authorization is declared per route inside
// each router, because a single permission check here was inherited by every route
// beneath it: each router was mounted behind its ':read' permission and then exposed
// full CRUD, so a VIEWER token could wipe, delete and re-policy the entire fleet.
//
// The mount for /api/apk-registry additionally asked for the action 'write', which
// does not exist in ROLE_PERMISSIONS (the actions are create/read/update/delete), so
// only SUPER_ADMIN's '*' wildcard matched and ADMIN/OPERATOR were locked out of the
// whole APK subsystem. Both problems are fixed by moving the checks into the routers.
//
// src/__tests__/routeAuthorization.test.ts walks the mounted router stack and fails
// if any route is missing an authorization guard, so this cannot silently regress.
app.use('/api/devices', authenticateToken, deviceRoutes);
app.use('/api/policies', authenticateToken, policyRoutes);
app.use('/api/commands', authenticateToken, commandRoutes);
app.use('/api/certificates', authenticateToken, certificateRoutes);
app.use('/api/security', authenticateToken, securityRoutes);
app.use('/api/provisioning', authenticateToken, provisioningRoutes);
app.use('/api/lifecycle', authenticateToken, deviceLifecycleRoutes);
app.use('/api/apk-registry', authenticateToken, apkRegistryRoutes);

// Import command service
import { initializeCommandService } from './services/commandServiceInstance';

// Import notification service for email alerts (2.6)
import { notificationService } from './services/notificationService';

// Initialize command service
const commandService = initializeCommandService(io);

// Start command queue processor (runs every 30 seconds)
const commandQueueTimer = setInterval(() => {
  commandService.processCommandQueue();
}, 30000);

// Device heartbeat monitoring - mark devices as inactive if no heartbeat
const heartbeatMonitorTimer = setInterval(async () => {
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
const certificateExpiryTimer = setInterval(async () => {
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

// These background jobs are bare setInterval loops with no distributed lock, so the
// server still cannot safely run as more than one instance (finding F-23). Here they are
// only made controllable: cleared under test, and unref'd otherwise so they never keep a
// process alive on their own — the listening socket does that in a real deployment.
const backgroundJobs = [commandQueueTimer, heartbeatMonitorTimer, certificateExpiryTimer];
if (process.env.NODE_ENV === 'test') {
  backgroundJobs.forEach((timer) => clearInterval(timer));
} else {
  backgroundJobs.forEach((timer) => timer.unref());
}

// WebSocket handshake authentication and device-identity pinning (finding F-03).
// Implemented in src/socket/auth.ts so the tests exercise the same code the server runs.
installSocketAuth(io);

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(
    { socketId: socket.id, role: socket.data.role, deviceId: socket.data.deviceId },
    'Socket connected'
  );

  // Room membership follows from the authenticated identity, not from a client event.
  joinIdentityRooms(socket);

  // Catch-all handler for custom events (handles deviceIdentify and other custom events)
  socket.onAny((event: string, ...args: any[]) => {
    console.log('[SOCKET] onAny event:', event, 'from socket:', socket.id);
    if (event === 'deviceIdentify') {
      console.log('[SOCKET] deviceIdentify caught by onAny, will be handled by specific listener');
      // This will be handled by the deviceIdentify listener below
      return;
    }
    logger.debug({ event, args }, 'Received custom event');
  });

  // Retained for dashboard compatibility: the client emits adminConnect after
  // connecting and waits for adminConnected. Authentication already happened at the
  // handshake, so the token in this payload is ignored rather than re-trusted.
  socket.on('adminConnect', () => {
    if (socket.data.role === 'DEVICE') {
      socket.emit('authError', { message: 'Device tokens cannot join the admin room' });
      return;
    }

    socket.join('admins');
    socket.emit('adminConnected', { message: 'Joined admin room', role: socket.data.role });
    logger.info({ userId: socket.data.userId, role: socket.data.role }, 'Admin joined admin room');
  });

  // Device identification. The socket's device identity is fixed at the handshake, so
  // this event no longer carries authentication — it only triggers the pending-command
  // flush. The legacy bare-string form and the optional-token path are both gone.
  socket.on('deviceIdentify', async () => {
    const deviceId = resolveDeviceId(socket);
    if (!deviceId) return;

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

  // Generic message handler (for heartbeats and other messages from devices)
  socket.on('message', async (data: any) => {
    try {
      const messageData = typeof data === 'string' ? JSON.parse(data) : data;

      // Identity comes from the token, not the message body.
      const deviceId = resolveDeviceId(socket, messageData.deviceId);
      if (!deviceId) return;
      messageData.deviceId = deviceId;

      if (messageData.type === 'heartbeat') {
        console.log('[MESSAGE] Processing as heartbeat');
        // Convert message format to deviceHeartbeat format
        const heartbeatData: DeviceHeartbeatData = {
          deviceId: messageData.deviceId,
          batteryLevel: messageData.batteryLevel,
          isCharging: messageData.isCharging,
          location: messageData.location
        };
        // Continue processing as heartbeat (see deviceHeartbeat handler below)
        const updateData: Record<string, unknown> = {
          lastSeen: new Date(),
          status: 'ACTIVE'
        };
        if (heartbeatData.batteryLevel !== undefined) updateData.batteryLevel = heartbeatData.batteryLevel;
        if (heartbeatData.isCharging !== undefined) updateData.isCharging = heartbeatData.isCharging;
        if (heartbeatData.location) updateData.location = heartbeatData.location;

        const device = await prisma.device.update({
          where: { deviceId: heartbeatData.deviceId },
          data: updateData as any
        });

        console.log('[MESSAGE] Updated device:', device.deviceId, 'to ACTIVE');
        io.to('admins').emit('deviceHeartbeat', {
          deviceId: heartbeatData.deviceId,
          batteryLevel: heartbeatData.batteryLevel,
          isCharging: heartbeatData.isCharging,
          location: heartbeatData.location,
          lastSeen: new Date(),
          status: 'ACTIVE'
        });
      } else if (messageData.type === 'command_result') {
        console.log('[MESSAGE] Processing command result for deviceId:', messageData.deviceId);
        // Handle command result from device
        await commandService.handleCommandResponse(
          messageData.deviceId,
          messageData.commandId,
          {
            success: messageData.success,
            data: messageData.result,
            error: messageData.error,
            timestamp: new Date()
          } as any
        );
      }
    } catch (error) {
      console.error('[MESSAGE] Error processing message:', error);
    }
  });

  // Device heartbeat
  socket.on('deviceHeartbeat', async (data: DeviceHeartbeatData) => {
    const deviceId = resolveDeviceId(socket, data?.deviceId);
    if (!deviceId) return;
    data = { ...data, deviceId };

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
    const deviceId = resolveDeviceId(socket, data?.deviceId);
    if (!deviceId) return;

    try {
      await commandService.handleCommandResponse(
        deviceId,
        data.commandId,
        { ...data.result, timestamp: new Date() }
      );
    } catch (error) {
      logger.error(error, 'Error handling command response');
    }
  });

  // Device status update — FIXED: proper DB id + correct old/new status (Fix 1.3)
  socket.on('deviceStatusUpdate', async (data: DeviceStatusUpdate) => {
    const deviceId = resolveDeviceId(socket, data?.deviceId);
    if (!deviceId) return;
    data = { ...data, deviceId };

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

  // Provisioning progress update from device
  socket.on('provisioningProgress', async (data: any) => {
    try {
      const {
        sessionId,
        commandId,
        step,
        subStep,
        completedSteps,
        totalSteps,
        error
      } = data;

      // Identity comes from the token, not the payload.
      const deviceIdStr = resolveDeviceId(socket, data?.deviceId);
      if (!deviceIdStr) return;

      // Find device by deviceId string to get DB id (cuid)
      const device = await prisma.device.findUnique({
        where: { deviceId: deviceIdStr },
        select: { id: true }
      });

      if (!device) {
        logger.warn({ deviceId: deviceIdStr }, 'provisioningProgress: device not found');
        return;
      }

      // Update ProvisioningProgress record
      await prisma.provisioningProgress.update({
        where: {
          sessionId_deviceId: {
            sessionId,
            deviceId: device.id
          }
        },
        data: {
          status: (step as any) || 'PENDING',
          currentStep: subStep,
          completedSteps,
          totalSteps,
          errorMessage: error || null,
          logs: {
            push: {
              timestamp: new Date(),
              level: error ? 'ERROR' : 'INFO',
              message: subStep,
              details: { step, completedSteps, totalSteps }
            }
          }
        }
      });

      // If completed or failed, update device provisioning status and session counters
      if (step === 'COMPLETED' || step === 'FAILED') {
        const newStatus = step === 'COMPLETED' ? 'COMPLETED' : 'FAILED';

        await prisma.device.update({
          where: { id: device.id },
          data: { provisioningStatus: (newStatus as any) }
        });

        // Update session counters
        const progressRecords = await prisma.provisioningProgress.findMany({
          where: { sessionId }
        });

        const completedCount = progressRecords.filter(p => p.status === 'COMPLETED').length;
        const failedCount = progressRecords.filter(p => p.status === 'FAILED').length;

        await prisma.provisioningSession.update({
          where: { id: sessionId },
          data: {
            completedDevices: completedCount,
            failedDevices: failedCount,
            status:
              failedCount > 0
                ? 'FAILED'
                : completedCount === progressRecords.length
                ? 'COMPLETED'
                : 'IN_PROGRESS'
          }
        });
      }

      // Broadcast update to admin dashboard
      io.to('admins').emit('provisioningProgressUpdate', {
        sessionId,
        deviceId: deviceIdStr,
        step,
        subStep,
        completedSteps,
        totalSteps,
        error,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error(error, 'Error handling provisioning progress');
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

// Start server only when run as the entry point. Importing this module (as the route
// authorization test does) must not bind a port or start accepting traffic.
const PORT = process.env.PORT || 5001;

if (require.main === module) {
  server.listen(PORT, () => {
    logger.info({ port: PORT, environment: process.env.NODE_ENV }, 'MDM Backend server started');
  });
}

export { app, server, io };
export default app;
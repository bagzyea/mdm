import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import logger from './logger';
// Imported for its side effect: validates required secrets and refuses to start without them.
import './config/env';
import { buildCorsPolicy, corsOriginCallback } from './config/cors';
import { verifyApkDownload, InvalidDownloadSignature } from './services/signedDownloads';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { closeDatabase } from './db';
import { DeviceHeartbeatData, CommandResponse, DeviceStatusUpdate } from '@mdm/shared-types';
import { Prisma } from '@prisma/client';

// Load environment variables
dotenv.config();

// Initialize Prisma client

// Create Express app
const app = express();
const server = createServer(app);

// --- Allowed origins (shared between HTTP CORS and Socket.IO CORS) ---
// Policy and its reasoning live in ./config/cors, where they are unit-tested.
const corsPolicy = buildCorsPolicy();
const corsOrigin = corsOriginCallback(corsPolicy);

logger.info(
  {
    allowedOrigins: corsPolicy.allowedOrigins,
    privateLanAllowed: corsPolicy.privateLanAllowed,
    dashboardPort: corsPolicy.dashboardPort,
  },
  'CORS allowlist resolved'
);

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin,
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
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(validateRequest);

/**
 * APK downloads (finding F-06).
 *
 * This was `app.use('/public/apks', express.static(...))` — no authentication at all,
 * which leaked the full application inventory of the census fleet to anyone who could
 * reach the server and put nothing between a hostile upload and every tablet.
 *
 * Devices download APKs with a bare HTTP GET during provisioning, so bearer auth is
 * awkward on this path. Instead the server mints short-lived signed URLs
 * (GET /api/apk-registry/:id/download-url) and this route verifies the signature. The
 * device downloader is unchanged — it just receives a URL that expires.
 */
app.get('/downloads/apks/:filename', (req, res) => {
  const filename = req.params.filename as string;

  try {
    verifyApkDownload(filename, req.query.expires, req.query.sig);
  } catch (error) {
    if (error instanceof InvalidDownloadSignature) {
      return res.status(403).json({ error: error.message, code: 'INVALID_DOWNLOAD_LINK' });
    }
    throw error;
  }

  const apkDirectory = path.join(__dirname, '../public/apks');
  const absolutePath = path.join(apkDirectory, filename);

  // Defence in depth: assertSafeFilename already rejects traversal, but the resolved
  // path must still land inside the APK directory.
  if (!absolutePath.startsWith(apkDirectory + path.sep)) {
    return res.status(403).json({ error: 'Invalid file name', code: 'INVALID_DOWNLOAD_LINK' });
  }

  return res.sendFile(absolutePath, (error: any) => {
    if (error && !res.headersSent) {
      res.status(error.statusCode === 404 ? 404 : 500).json({ error: 'APK not available' });
    }
  });
});

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
import { registerSocketServer, isDeviceConnected, disconnectDevice } from './socket/registry';
import { markDeviceSeen, markDeviceOffline, sweepStaleDevices, isPresenceStatus } from './services/devicePresence';
import { recordHeartbeat, DeviceNotAllowedError } from './services/telemetryService';
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

// Public device enrollment endpoints — rate-limited.
//
// Enrollment is public because a device has no credential before it enrolls, but it now
// requires a single-use, expiring, admin-issued code (findings F-02, F-13). The token
// refresh endpoint is public for the same reason: the caller's access token has expired
// by definition, so it authenticates with its refresh token instead.
const { enrollDevice, refreshDeviceToken } = require('./controllers/deviceController');
const { validate: validateBody } = require('./middleware/validation');
const {
  enrollDeviceSchema,
  refreshDeviceTokenSchema,
} = require('./schemas/deviceSchemas');

app.post(
  '/api/devices/enroll',
  enrollmentRateLimiter,
  validateBody(enrollDeviceSchema),
  enrollDevice
);

app.post(
  '/api/devices/token/refresh',
  enrollmentRateLimiter,
  validateBody(refreshDeviceTokenSchema),
  refreshDeviceToken
);

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
import prisma from './db';

// Initialize command service
const commandService = initializeCommandService(io);

// Start command queue processor (runs every 30 seconds)
const commandQueueTimer = setInterval(() => {
  commandService.processCommandQueue();
}, 30000);

// Device heartbeat monitoring - mark devices as inactive if no heartbeat.
// Suspended and wiped devices are left alone: see src/services/devicePresence.ts.
const heartbeatMonitorTimer = setInterval(async () => {
  try {
    const staleDevices = await sweepStaleDevices();

    if (staleDevices.length > 0) {
      logger.info({ count: staleDevices.length }, 'Marked devices as inactive due to missing heartbeat');

      // Notify admin dashboard only — NOT all sockets (Fix 1.4)
      io.to('admins').emit('deviceStatusChanged', {
        type: 'BULK_STATUS_UPDATE',
        message: `${staleDevices.length} devices marked as inactive`,
        timestamp: new Date()
      });

      // Emit deviceOffline event for the notification system
      io.to('admins').emit('deviceOffline', {
        count: staleDevices.length,
        timestamp: new Date()
      });

      // Email alerts for exactly the devices this sweep moved (2.6)
      for (const device of staleDevices) {
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
registerSocketServer(io);

/**
 * Drop a device socket that is no longer allowed to act (suspended, wiped, retired or
 * deleted since it connected). Returns true when the socket was dropped.
 */
function refuseIfRevoked(error: unknown, deviceId: string): boolean {
  if (!(error instanceof DeviceNotAllowedError)) return false;
  logger.warn({ deviceId }, 'Device is no longer permitted to connect; disconnecting');
  disconnectDevice(deviceId, 'This device is no longer permitted to connect');
  return true;
}

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(
    { socketId: socket.id, role: socket.data.role, deviceId: socket.data.deviceId },
    'Socket connected'
  );

  // Room membership follows from the authenticated identity, not from a client event.
  joinIdentityRooms(socket);

  // Event names only: payloads carry locations and tokens and are not logged.
  socket.onAny((event: string) => {
    logger.debug({ event, socketId: socket.id }, 'Socket event received');
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
      if (!(await markDeviceSeen(deviceId))) {
        refuseIfRevoked(new DeviceNotAllowedError(deviceId), deviceId);
        return;
      }

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
        await recordHeartbeat(deviceId, messageData);
      } else if (messageData.type === 'command_result') {
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
      if (refuseIfRevoked(error, socket.data.deviceId)) return;
      logger.error(error, 'Error processing device message');
    }
  });

  // Device heartbeat
  socket.on('deviceHeartbeat', async (data: DeviceHeartbeatData) => {
    const deviceId = resolveDeviceId(socket, data?.deviceId);
    if (!deviceId) return;

    try {
      const { pendingCommands, nextHeartbeatMs } = await recordHeartbeat(deviceId, data);
      socket.emit('heartbeatResponse', {
        success: true,
        pendingCommands,
        nextHeartbeat: nextHeartbeatMs
      });
    } catch (error) {
      if (refuseIfRevoked(error, deviceId)) return;
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

      // A device may only report presence. Lifecycle statuses (SUSPENDED, WIPED) are an
      // administrator's decision, and a device claiming one is ignored rather than obeyed.
      const reportedStatus = isPresenceStatus(data.status) ? data.status : 'ACTIVE';
      const seen = await markDeviceSeen(
        deviceId,
        data.location ? { location: data.location as unknown as Prisma.InputJsonValue } : {},
        reportedStatus
      );
      if (!seen) {
        refuseIfRevoked(new DeviceNotAllowedError(deviceId), deviceId);
        return;
      }

      // Log status change event — use DB id (existingDevice.id) not string deviceId
      await prisma.deviceEvent.create({
        data: {
          deviceId: existingDevice.id,  // FK to Device.id (cuid)
          eventType: 'STATUS_UPDATE',
          eventData: {
            oldStatus,                  // real old status captured above
            newStatus: reportedStatus,
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
        status: reportedStatus,
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
        // A reconnecting agent often opens its new socket before the old one's
        // disconnect arrives; don't mark it offline while it is still connected.
        if (await isDeviceConnected(deviceId)) return;
        if (!(await markDeviceOffline(deviceId))) return;

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

// ---------------------------------------------------------------------------
// Terminal middleware (finding F-24). Both must be mounted after every route.
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// Start server only when run as the entry point. Importing this module (as the route
// authorization test does) must not bind a port or start accepting traffic.
const PORT = process.env.PORT || 5001;

/**
 * Drain in-flight work before exiting (finding F-24).
 *
 * There was no SIGTERM handling, so a rolling deploy killed the process mid-request and
 * dropped in-flight commands. This stops accepting new connections, closes the socket
 * layer, releases the database pool, and only then exits — with a hard deadline so a
 * stuck connection cannot block the deploy indefinitely.
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out; forcing exit');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  try {
    backgroundJobs.forEach((timer) => clearInterval(timer));
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDatabase();

    logger.info('Shutdown complete');
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    logger.error(error, 'Error during shutdown');
    process.exit(1);
  }
}

if (require.main === module) {
  server.listen(PORT, () => {
    logger.info({ port: PORT, environment: process.env.NODE_ENV }, 'MDM Backend server started');
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Without these, a rejected promise outside a request was silently swallowed on older
  // Node versions and terminates the process without explanation on newer ones.
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal(error, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });
}

export { app, server, io };
export default app;
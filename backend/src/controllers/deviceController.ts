import { Request, Response } from 'express';
import { DeviceInfo, CommandPayload, DeviceAnalytics } from '../types';
import { redactSensitive } from '../utils/redact';
import { toJson, isPrismaError, errorMessage, definedOnly } from '../utils/prisma';
import prisma from '../db';
import { DeviceStatus } from '@prisma/client';
import {
  consumeEnrollmentToken,
  createEnrollmentToken,
  issueDeviceCredentials,
  refreshDeviceCredentials,
  revokeDeviceTokens,
  EnrollmentError,
} from '../services/enrollmentService';
import { REVOKED_STATUSES, isRevoked } from '../services/devicePresence';
import { recordHeartbeat, DeviceNotAllowedError } from '../services/telemetryService';
import { disconnectDevice } from '../socket/registry';
import { serializeDevice } from '../utils/serialize';
import logger from '../logger';
import { getCommandService } from '../services/commandServiceInstance';
import { sendCommandError } from '../services/commandService';


export const getAllDevices = async (req: Request, res: Response) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Parse filter parameters
    const status = req.query.status as string;
    const manufacturer = req.query.manufacturer as string;
    const search = req.query.search as string;
    
    // Build where clause
    const where: any = {};
    if (status) where.status = status;
    if (manufacturer) where.manufacturer = { contains: manufacturer, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { deviceId: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { manufacturer: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    // Get total count for pagination
    const totalCount = await prisma.device.count({ where });
    
    // Get devices with pagination
    const devices = await prisma.device.findMany({
      where,
      // Limit 100 is the dashboard overview, which wants the whole page and no LIMIT
      // clause. `take: undefined` is not the same as an absent `take` under
      // exactOptionalPropertyTypes, so the key is omitted rather than set to undefined.
      skip: limit === 100 ? 0 : skip,
      ...(limit === 100 ? {} : { take: limit }),
      include: {
        policies: true,
        commands: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        },
        events: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { enrolledAt: 'desc' }
    });
    
    // Convert BigInt values to strings for JSON serialization
    const devicesResponse = devices.map((device) => serializeDevice(device));
    
    // Return paginated response
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      data: devicesResponse,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: totalPages
      }
    });
    
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
};

export const getDevice = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const device = await prisma.device.findUnique({
      where: { deviceId },
      include: {
        policies: true,
        commands: true,
        events: true
      }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    // Convert BigInt values to strings for JSON serialization
    const deviceResponse = serializeDevice(device);
    
    res.json(deviceResponse);
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
};

export const enrollDevice = async (req: Request, res: Response) => {
  try {
    // Handle both direct DeviceInfo and EnrollmentRequest formats
    const enrollmentData = req.body;
    const deviceInfo: DeviceInfo = enrollmentData.deviceInfo || enrollmentData;
    const enrollmentCode = enrollmentData.enrollmentCode;
    const organizationId = enrollmentData.organizationId;

    if (!deviceInfo || !deviceInfo.deviceId) {
      res.status(400).json({
        success: false,
        error: 'Invalid enrollment data: deviceInfo and deviceId are required'
      });
      return;
    }

    // The body carries the enrollment code, so it is not logged verbatim.
    logger.info({ deviceId: deviceInfo.deviceId }, 'Enrollment request received');

    // Re-enrollment used to reset any existing device to ENROLLED, so a suspended or
    // wiped tablet holding any valid code reinstated itself. An administrator must
    // reactivate it first. Checked before the code is spent.
    const existingDevice = await prisma.device.findUnique({
      where: { deviceId: deviceInfo.deviceId },
      select: { status: true, isRetired: true }
    });
    if (existingDevice && isRevoked(existingDevice)) {
      res.status(403).json({
        success: false,
        error: 'This device has been suspended, wiped or retired; reactivate it before re-enrolling',
        code: 'DEVICE_REVOKED'
      });
      return;
    }

    const fields = {
      manufacturer: deviceInfo.manufacturer,
      model: deviceInfo.model,
      androidVersion: deviceInfo.osVersion,
      sdkVersion: deviceInfo.apiLevel,
      fingerprint: deviceInfo.buildNumber || `${deviceInfo.manufacturer}_${deviceInfo.model}_${deviceInfo.osVersion}`,
      status: 'ENROLLED' as const,
      batteryLevel: deviceInfo.batteryLevel,
      isCharging: deviceInfo.isCharging || false,
      totalStorage: deviceInfo.storageTotal ? BigInt(deviceInfo.storageTotal) : null,
      availableStorage: deviceInfo.storageTotal && deviceInfo.storageUsed
        ? BigInt(deviceInfo.storageTotal - deviceInfo.storageUsed) : null,
      totalRAM: deviceInfo.ramTotal ? BigInt(deviceInfo.ramTotal) : null,
      availableRAM: deviceInfo.ramTotal && deviceInfo.ramUsed
        ? BigInt(deviceInfo.ramTotal - deviceInfo.ramUsed) : null,
      networkInfo: toJson(deviceInfo.networkInfo),
      location: toJson(deviceInfo.location),
      assignedTo: organizationId
    };

    // Code, device and credentials in one transaction. Previously the single-use code
    // was spent first, so a failure creating the device burned it.
    //
    // Enrollment requires a single-use, expiring, admin-issued code bound optionally to
    // a pre-registered serial (findings F-02, F-13).
    const { device, credentials } = await prisma.$transaction(async (tx) => {
      await consumeEnrollmentToken(enrollmentCode, deviceInfo.deviceId, tx);

      const device = existingDevice
        ? await tx.device.update({
            where: { deviceId: deviceInfo.deviceId },
            data: definedOnly({ ...fields, lastSeen: new Date() })
          })
        : await tx.device.create({
            data: definedOnly({ deviceId: deviceInfo.deviceId, ...fields })
          });

      // Issuing credentials revokes any the device already held, so a stolen
      // credential does not survive a legitimate re-enrollment.
      const credentials = await issueDeviceCredentials(device.deviceId, tx);

      if (!existingDevice) {
        await tx.deviceEvent.create({
          data: {
            deviceId: device.id,
            eventType: 'ENROLLMENT',
            // enrollmentData is the request body, which carries the enrollment code —
            // a credential that must not be persisted in the event log.
            eventData: redactSensitive({ ...enrollmentData, deviceToken: '[REDACTED]' }) as any
          }
        });
      }

      return { device, credentials };
    });

    logger.info({ deviceId: device.deviceId, reEnrolled: !!existingDevice }, 'Device enrolled');

    res.status(existingDevice ? 200 : 201).json({
      success: true,
      message: existingDevice ? 'Device re-enrolled successfully' : 'Device enrolled successfully',
      deviceId: device.deviceId,
      // `deviceToken` is retained under its original name for agent compatibility.
      deviceToken: credentials.accessToken,
      expiresIn: credentials.expiresIn,
      refreshToken: credentials.refreshToken,
      refreshTokenExpiresAt: credentials.refreshTokenExpiresAt.toISOString(),
      serverEndpoints: {
        api: process.env.API_BASE_URL || "http://localhost:5001/api/",
        websocket: process.env.WEBSOCKET_URL || "http://localhost:5001"
      }
    });
  } catch (error) {
    if (error instanceof EnrollmentError) {
      res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
      return;
    }

    logger.error(error, 'Error enrolling device');

    if (isPrismaError(error) && error.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: 'Device with this ID or fingerprint already exists'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to enroll device: ' + errorMessage(error)
    });
  }
};

/**
 * Generate enrollment code for device enrollment
 */
/**
 * Issue an enrollment code (findings F-02, F-13).
 *
 * This previously returned `crypto.randomBytes(4)` hex that was never persisted, so the
 * code it handed out could not be validated, expired or revoked by anything — enrollment
 * accepted any string of length >= 4 regardless.
 *
 * The code is now stored as a hash and returned in plaintext exactly once.
 */
export const generateEnrollmentCode = async (req: Request, res: Response) => {
  try {
    const { boundSerial, ttlMinutes, maxUses, notes } = req.body ?? {};

    const token = await createEnrollmentToken({
      createdBy: req.user?.userId || 'unknown',
      boundSerial,
      ttlMinutes,
      maxUses,
      notes,
    });

    res.status(201).json({
      success: true,
      id: token.id,
      // Shown once. It is stored only as a hash and cannot be retrieved again.
      code: token.code,
      expiresAt: token.expiresAt.toISOString(),
      boundSerial: token.boundSerial,
      maxUses: token.maxUses,
    });
    return;
  } catch (error) {
    if (error instanceof EnrollmentError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
      return;
    }

    console.error('Error generating enrollment code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate enrollment code'
    });
    return;
  }
};

/**
 * Exchange a device refresh token for a fresh access token.
 *
 * This is the revocation path device credentials previously lacked (finding F-13):
 * device tokens were only signature-checked and never compared against device state, so
 * a retired, wiped or stolen tablet kept a valid 365-day credential. The device's status
 * is now re-checked on every refresh.
 *
 * Public by necessity — the caller's expired access token cannot authenticate it — and
 * rate-limited at the mount point.
 */
export const refreshDeviceToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body ?? {};
    const credentials = await refreshDeviceCredentials(refreshToken);

    res.json({
      success: true,
      deviceToken: credentials.accessToken,
      expiresIn: credentials.expiresIn,
      refreshTokenExpiresAt: credentials.refreshTokenExpiresAt.toISOString(),
    });
    return;
  } catch (error) {
    if (error instanceof EnrollmentError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
      return;
    }

    console.error('Error refreshing device token:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh device token' });
    return;
  }
};

export const sendCommand = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const commandPayload: CommandPayload = req.body;

    const device = await prisma.device.findUnique({ where: { deviceId }, select: { id: true } });
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const { commands, expiresAt } = await getCommandService().createCommands({
      deviceIds: [device.id],
      command: commandPayload.command,
      parameters: commandPayload.parameters
    });

    res.status(201).json({ ...commands[0], expiresAt });
  } catch (error) {
    if (sendCommandError(res, error)) return;
    logger.error(error, 'Error sending command');
    res.status(500).json({ error: 'Failed to send command' });
  }
};

/**
 * Administrative status change (the dashboard's suspend / reactivate).
 *
 * Suspending or wiping takes effect immediately: the device's refresh tokens are revoked
 * and its sockets are closed. Previously the new status was only consulted at the next
 * token refresh, and the device's own heartbeats overwrote it back to ACTIVE before then.
 *
 * This is an operator action, so it no longer bumps `lastSeen` or logs a HEARTBEAT event —
 * that made a device suspended while offline look as if it had just checked in.
 */
export const updateDeviceStatus = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { status, location, batteryLevel, isCharging, networkInfo } = req.body;

    const existing = await prisma.device.findUnique({
      where: { deviceId },
      select: { status: true }
    });
    if (!existing) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (location) updateData.location = location;
    if (batteryLevel !== undefined) updateData.batteryLevel = batteryLevel;
    if (isCharging !== undefined) updateData.isCharging = isCharging;
    if (networkInfo) updateData.networkInfo = networkInfo;

    const device = await prisma.device.update({
      where: { deviceId },
      data: updateData
    });

    if (status && REVOKED_STATUSES.includes(status)) {
      await revokeDeviceTokens(deviceId, req.user?.userId || `device-${status.toLowerCase()}`);
      disconnectDevice(deviceId, 'This device is no longer permitted to connect');
    }

    if (status && status !== existing.status) {
      await prisma.deviceEvent.create({
        data: {
          deviceId: device.id,
          eventType: 'STATUS_CHANGED',
          eventData: {
            oldStatus: existing.status,
            newStatus: status,
            changedBy: req.user?.userId ?? null
          }
        }
      });
    }

    res.json({ success: true, device: serializeDevice(device), message: 'Device status updated' });
  } catch (error) {
    logger.error(error, 'Error updating device status');
    res.status(500).json({ error: 'Failed to update device status' });
  }
};

export const deviceHeartbeat = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { pendingCommands, nextHeartbeatMs } = await recordHeartbeat(deviceId, req.body);

    res.json({
      success: true,
      message: 'Heartbeat processed successfully',
      pendingCommands,
      nextHeartbeat: new Date(Date.now() + nextHeartbeatMs).toISOString()
    });
  } catch (error) {
    if (error instanceof DeviceNotAllowedError) {
      res.status(403).json({ error: error.message, code: 'DEVICE_REVOKED' });
      return;
    }
    logger.error(error, 'Error processing device heartbeat');
    res.status(500).json({ error: 'Failed to process heartbeat' });
  }
};

// Enhanced monitoring methods
export const updateDeviceAnalytics = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const analytics: DeviceAnalytics = req.body;

    const device = await prisma.device.findUnique({
      where: { deviceId }
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const updatedDevice = await prisma.device.update({
      where: { deviceId },
      data: {
        batteryLevel: analytics.batteryInfo.level,
        isCharging: analytics.batteryInfo.isCharging,
        totalStorage: BigInt(analytics.storageInfo.totalStorage),
        availableStorage: BigInt(analytics.storageInfo.availableStorage),
        totalRAM: BigInt(analytics.memoryInfo.totalRAM),
        availableRAM: BigInt(analytics.memoryInfo.availableRAM),
        networkInfo: analytics.networkInfo ? JSON.parse(JSON.stringify(analytics.networkInfo)) : null,
        appUsageStats: analytics.appUsageStats ? JSON.parse(JSON.stringify(analytics.appUsageStats)) : null,
        systemHealth: analytics.systemHealth ? JSON.parse(JSON.stringify(analytics.systemHealth)) : null,
        lastSeen: new Date()
      }
    });
    
    // Log analytics event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'ANALYTICS_UPDATE',
        eventData: JSON.parse(JSON.stringify(analytics))
      }
    });
    
    // Convert BigInt values to strings for JSON serialization
    const deviceResponse = serializeDevice(updatedDevice);
    
    res.json(deviceResponse);
  } catch (error) {
    console.error('Error updating device analytics:', error);
    res.status(500).json({ error: 'Failed to update device analytics' });
  }
};

export const getDeviceAnalytics = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { days = 7 } = req.query;
    
    const device = await prisma.device.findUnique({
      where: { deviceId },
      select: {
        id: true,
        deviceId: true,
        batteryLevel: true,
        isCharging: true,
        totalStorage: true,
        availableStorage: true,
        totalRAM: true,
        availableRAM: true,
        networkInfo: true,
        appUsageStats: true,
        systemHealth: true,
        lastSeen: true
      }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    // Get historical analytics data
    const historicalData = await prisma.deviceEvent.findMany({
      where: {
        deviceId: device.id,
        eventType: 'ANALYTICS_UPDATE',
        createdAt: {
          gte: new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    // Convert BigInt values to strings for JSON serialization
    const deviceResponse = serializeDevice(device);

    res.json({
      current: deviceResponse,
      historical: historicalData.map(event => ({
        ...((typeof event.eventData === 'object' && event.eventData !== null) ? event.eventData : {}),
        timestamp: event.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching device analytics:', error);
    res.status(500).json({ error: 'Failed to fetch device analytics' });
  }
};

/**
 * Fleet counts for the dashboard: by status, by how recently devices reported, and
 * health alarms.
 *
 * Counted by the database. This used to load every device row into memory, and the
 * dashboard's own tiles were computed in the browser from one page of the device list,
 * so at fleet scale the figures were either slow or wrong.
 */
export const getDeviceHealthSummary = async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000);
    // Devices that can still report: suspended, revoked and retired ones never will.
    const reporting = { status: { in: ['ENROLLED', 'ACTIVE', 'INACTIVE'] as DeviceStatus[] }, isRetired: false };

    const [
      byStatusRows, retiredDevices, lowBatteryDevices, lowStorageRows,
      within24h, from1to3Days, from3to7Days, over7Days
    ] = await Promise.all([
      prisma.device.groupBy({ by: ['status'], where: { isRetired: false }, _count: { _all: true } }),
      prisma.device.count({ where: { isRetired: true } }),
      prisma.device.count({ where: { ...reporting, batteryLevel: { lt: 20 } } }),
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "Device"
        WHERE "isRetired" = false AND "totalStorage" > 0 AND "availableStorage" IS NOT NULL
          AND ("totalStorage" - "availableStorage")::float / "totalStorage" > 0.9`,
      prisma.device.count({ where: { ...reporting, lastSeen: { gte: hoursAgo(24) } } }),
      prisma.device.count({ where: { ...reporting, lastSeen: { lt: hoursAgo(24), gte: hoursAgo(72) } } }),
      prisma.device.count({ where: { ...reporting, lastSeen: { lt: hoursAgo(72), gte: hoursAgo(168) } } }),
      prisma.device.count({ where: { ...reporting, lastSeen: { lt: hoursAgo(168) } } })
    ]);

    const byStatus: Record<DeviceStatus, number> = { ENROLLED: 0, ACTIVE: 0, INACTIVE: 0, SUSPENDED: 0, WIPED: 0 };
    for (const row of byStatusRows) byStatus[row.status] = row._count._all;

    res.json({
      totalDevices: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      retiredDevices,
      // Reporting now. ENROLLED devices have not yet sent a first heartbeat.
      activeDevices: byStatus.ACTIVE,
      enrolledDevices: byStatus.ENROLLED,
      inactiveDevices: byStatus.INACTIVE,
      suspendedDevices: byStatus.SUSPENDED,
      revokedDevices: byStatus.WIPED,
      lowBatteryDevices,
      lowStorageDevices: Number(lowStorageRows[0]?.count ?? 0),
      offlineDevices: from1to3Days + from3to7Days + over7Days,
      lastSeen: { within24h, from1to3Days, from3to7Days, over7Days }
    });
  } catch (error) {
    logger.error(error, 'Error fetching device health summary');
    res.status(500).json({ error: 'Failed to fetch device health summary' });
  }
};

export const deleteDevice = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { force = false } = req.query;
    
    // Check if device exists
    const device = await prisma.device.findUnique({
      where: { deviceId },
      include: {
        commands: { where: { status: 'PENDING' } },
        policies: true,
        events: true
      }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    // Check if device has pending commands and force is not set
    if (device.commands.length > 0 && !force) {
      res.status(409).json({
        error: 'Device has pending commands',
        message: 'Complete or cancel pending commands first, or use force=true',
        pendingCommands: device.commands.length
      });
      return;
    }
    
    // Revoke the device's credentials before deleting it, so a deleted device cannot
    // keep using an unexpired access token or refresh into a new one (finding F-13).
    await revokeDeviceTokens(deviceId as string, req.user?.userId || 'device-deleted');

    // Log device deletion event before deletion
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'DEVICE_DELETED',
        eventData: {
          // The token payload field is `userId`; `req.user?.id` was always undefined,
          // so every deletion was attributed to 'system' (finding F-21).
          deletedBy: req.user?.userId || 'system',
          force,
          reason: 'Manual deletion from admin dashboard'
        } as any
      }
    });
    
    // Delete device and all related records (Prisma will handle cascading)
    await prisma.device.delete({
      where: { deviceId }
    });
    
    console.log(`Device ${deviceId} deleted successfully`);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
};
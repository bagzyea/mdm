import { Request, Response } from 'express';
import { DeviceInfo, CommandPayload, DeviceAnalytics } from '../types';
import { redactSensitive } from '../utils/redact';
import { toJson, isPrismaError, errorMessage, definedOnly } from '../utils/prisma';
import prisma from '../db';
import {
  consumeEnrollmentToken,
  createEnrollmentToken,
  issueDeviceCredentials,
  refreshDeviceCredentials,
  revokeDeviceTokens,
  EnrollmentError,
} from '../services/enrollmentService';
import { REVOKED_STATUSES } from '../services/devicePresence';
import { recordHeartbeat, DeviceNotAllowedError } from '../services/telemetryService';
import { disconnectDevice } from '../socket/registry';
import { serializeDevice } from '../utils/serialize';
import logger from '../logger';


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
    // The body carries the enrollment code, so it is not logged verbatim.
    console.log('Enrollment request received for device:', req.body?.deviceInfo?.deviceId ?? req.body?.deviceId);
    
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

    // Enrollment now requires a single-use, expiring, admin-issued code bound
    // optionally to a pre-registered serial (findings F-02, F-13). Previously the
    // code was optional, checked only for length >= 4, and generated codes were
    // never persisted — so device identity could be claimed by anyone who could
    // reach this endpoint, and re-posting an existing deviceId minted a fresh
    // credential for that device.
    try {
      await consumeEnrollmentToken(enrollmentCode, deviceInfo.deviceId);
    } catch (error) {
      if (error instanceof EnrollmentError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }

    // Check if device already exists
    const existingDevice = await prisma.device.findUnique({
      where: { deviceId: deviceInfo.deviceId }
    });
    
    if (existingDevice) {
      // Update existing device instead of returning error
      const updatedDevice = await prisma.device.update({
        where: { deviceId: deviceInfo.deviceId },
        data: definedOnly({
          manufacturer: deviceInfo.manufacturer,
          model: deviceInfo.model,
          androidVersion: deviceInfo.osVersion,
          sdkVersion: deviceInfo.apiLevel,
          fingerprint: deviceInfo.buildNumber || `${deviceInfo.manufacturer}_${deviceInfo.model}_${deviceInfo.osVersion}`,
          status: 'ENROLLED',
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
          assignedTo: organizationId,
          lastSeen: new Date(),
          updatedAt: new Date()
        })
      });
      
      // Issuing credentials revokes any the device already held, so a stolen
      // credential does not survive a legitimate re-enrollment.
      const credentials = await issueDeviceCredentials(updatedDevice.deviceId);

      res.status(200).json({
        success: true,
        message: 'Device re-enrolled successfully',
        deviceId: updatedDevice.deviceId,
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
      return;
    }
    
    const device = await prisma.device.create({
      data: definedOnly({
        deviceId: deviceInfo.deviceId,
        manufacturer: deviceInfo.manufacturer,
        model: deviceInfo.model,
        androidVersion: deviceInfo.osVersion,
        sdkVersion: deviceInfo.apiLevel,
        fingerprint: deviceInfo.buildNumber || `${deviceInfo.manufacturer}_${deviceInfo.model}_${deviceInfo.osVersion}`,
        status: 'ENROLLED',
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
      })
    });
    
    const credentials = await issueDeviceCredentials(device.deviceId);

    // Log enrollment event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'ENROLLMENT',
        // enrollmentData is the request body, which carries the enrollment code —
        // a credential that must not be persisted in the event log.
        eventData: redactSensitive({ ...enrollmentData, deviceToken: '[REDACTED]' }) as any
      }
    });
    
    console.log('Device enrolled successfully:', device.deviceId);
    
    res.status(201).json({
      success: true,
      message: 'Device enrolled successfully',
      deviceId: device.deviceId,
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
    console.error('Error enrolling device:', error);

    // Check if it's a Prisma constraint error
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
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    const command = await prisma.remoteCommand.create({
      data: definedOnly({
        deviceId: device.id,
        command: commandPayload.command,
        parameters: commandPayload.parameters,
        status: 'PENDING'
      })
    });
    
    // Log command event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'COMMAND_SENT',
        eventData: { commandId: command.id, command: commandPayload.command }
      }
    });
    
    res.status(201).json(command);
  } catch (error) {
    console.error('Error sending command:', error);
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

export const getDeviceHealthSummary = async (req: Request, res: Response) => {
  try {
    const devices = await prisma.device.findMany({
      select: {
        id: true,
        deviceId: true,
        status: true,
        batteryLevel: true,
        isCharging: true,
        totalStorage: true,
        availableStorage: true,
        totalRAM: true,
        availableRAM: true,
        lastSeen: true
      }
    });
    
    const healthSummary = {
      totalDevices: devices.length,
      activeDevices: devices.filter(d => d.status === 'ACTIVE' || d.status === 'ENROLLED').length,
      lowBatteryDevices: devices.filter(d => d.batteryLevel && d.batteryLevel < 20).length,
      lowStorageDevices: devices.filter(d => {
        if (!d.totalStorage || !d.availableStorage) return false;
        const usagePercentage = ((Number(d.totalStorage) - Number(d.availableStorage)) / Number(d.totalStorage)) * 100;
        return usagePercentage > 90;
      }).length,
      offlineDevices: devices.filter(d => {
        const lastSeen = new Date(d.lastSeen);
        const now = new Date();
        const hoursSinceLastSeen = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);
        return hoursSinceLastSeen > 24;
      }).length
    };
    
    res.json(healthSummary);
  } catch (error) {
    console.error('Error fetching device health summary:', error);
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
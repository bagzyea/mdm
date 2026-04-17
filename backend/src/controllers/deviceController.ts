import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { DeviceInfo, CommandPayload, DeviceAnalytics } from '../types';
import crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

/**
 * Generate a JWT device token with role=DEVICE so that the server's
 * authService.verifyToken() can authenticate websocket connections.
 */
const generateDeviceToken = (deviceId: string): string => {
  return jwt.sign(
    {
      userId: deviceId,
      username: deviceId,
      email: `${deviceId}@device.mdm`,
      role: 'DEVICE',
    },
    JWT_SECRET,
    {
      expiresIn: '365d',
      issuer: 'mdm-system',
      audience: 'mdm-users',
    } as jwt.SignOptions
  );
};

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
      skip: limit === 100 ? 0 : skip, // Skip pagination if limit is 100 (dashboard overview)
      take: limit === 100 ? undefined : limit,
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
    const devicesResponse = devices.map(device => ({
      ...device,
      totalStorage: device.totalStorage ? device.totalStorage.toString() : null,
      availableStorage: device.availableStorage ? device.availableStorage.toString() : null,
      totalRAM: device.totalRAM ? device.totalRAM.toString() : null,
      availableRAM: device.availableRAM ? device.availableRAM.toString() : null,
    }));
    
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

export const getDevice = async (req: Request, res: Response) => {
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
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Convert BigInt values to strings for JSON serialization
    const deviceResponse = {
      ...device,
      totalStorage: device.totalStorage ? device.totalStorage.toString() : null,
      availableStorage: device.availableStorage ? device.availableStorage.toString() : null,
      totalRAM: device.totalRAM ? device.totalRAM.toString() : null,
      availableRAM: device.availableRAM ? device.availableRAM.toString() : null,
    };
    
    res.json(deviceResponse);
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
};

export const enrollDevice = async (req: Request, res: Response) => {
  try {
    console.log('Enrollment request received:', req.body);
    
    // Handle both direct DeviceInfo and EnrollmentRequest formats
    const enrollmentData = req.body;
    const deviceInfo: DeviceInfo = enrollmentData.deviceInfo || enrollmentData;
    const enrollmentCode = enrollmentData.enrollmentCode;
    const organizationId = enrollmentData.organizationId;
    
    if (!deviceInfo || !deviceInfo.deviceId) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid enrollment data: deviceInfo and deviceId are required' 
      });
    }

    // Optional: Validate enrollment code if provided
    // In a full implementation, you would check against stored codes and expiration
    if (enrollmentCode) {
      console.log('Enrollment code provided:', enrollmentCode);
      // TODO: Add database validation for enrollment codes
      // For now, we accept any non-empty enrollment code
      if (enrollmentCode.length < 4) {
        return res.status(400).json({
          success: false,
          error: 'Invalid enrollment code format'
        });
      }
    }
    
    // Check if device already exists
    const existingDevice = await prisma.device.findUnique({
      where: { deviceId: deviceInfo.deviceId }
    });
    
    if (existingDevice) {
      // Update existing device instead of returning error
      const updatedDevice = await prisma.device.update({
        where: { deviceId: deviceInfo.deviceId },
        data: {
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
          networkInfo: deviceInfo.networkInfo || null,
          location: deviceInfo.location || null,
          assignedTo: organizationId,
          lastSeen: new Date(),
          updatedAt: new Date()
        }
      });
      
      // Generate device token for authentication
      const deviceToken = generateDeviceToken(deviceInfo.deviceId);
      
      console.log('Device re-enrolled successfully:', deviceInfo.deviceId);
      
      return res.status(200).json({
        success: true,
        message: 'Device re-enrolled successfully',
        deviceId: updatedDevice.deviceId,
        deviceToken,
        serverEndpoints: {
          api: process.env.API_BASE_URL || "http://localhost:5001/api/",
          websocket: process.env.WEBSOCKET_URL || "http://localhost:5001"
        }
      });
    }
    
    const device = await prisma.device.create({
      data: {
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
        networkInfo: deviceInfo.networkInfo || null,
        location: deviceInfo.location || null,
        assignedTo: organizationId
      }
    });
    
    // Generate device token for authentication
    const deviceToken = generateDeviceToken(device.deviceId);
    
    // Log enrollment event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'ENROLLMENT',
        eventData: { ...enrollmentData, deviceToken: '[REDACTED]' } as any
      }
    });
    
    console.log('Device enrolled successfully:', device.deviceId);
    
    res.status(201).json({
      success: true,
      message: 'Device enrolled successfully',
      deviceId: device.deviceId,
      deviceToken,
      serverEndpoints: {
        api: process.env.API_BASE_URL || "http://localhost:5001/api/",
        websocket: process.env.WEBSOCKET_URL || "http://localhost:5001"
      }
    });
  } catch (error) {
    console.error('Error enrolling device:', error);
    
    // Check if it's a Prisma constraint error
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        success: false,
        error: 'Device with this ID or fingerprint already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to enroll device: ' + (error.message || 'Unknown error')
    });
  }
};

/**
 * Generate enrollment code for device enrollment
 */
export const generateEnrollmentCode = async (req: Request, res: Response) => {
  try {
    // Generate a secure enrollment code
    const enrollmentCode = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-character code
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    // For now, we'll just return the code. In a full implementation, 
    // you might want to store it in a database table for validation
    const enrollmentData = {
      code: enrollmentCode,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      isUsed: false
    };
    
    console.log('Generated enrollment code:', enrollmentCode);
    
    res.json({
      success: true,
      code: enrollmentCode,
      expiresAt: enrollmentData.expiresAt,
      validFor: '1 hour'
    });
    
  } catch (error) {
    console.error('Error generating enrollment code:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate enrollment code' 
    });
  }
};

export const sendCommand = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const commandPayload: CommandPayload = req.body;
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const command = await prisma.remoteCommand.create({
      data: {
        deviceId: device.id,
        command: commandPayload.command,
        parameters: commandPayload.parameters,
        status: 'PENDING'
      }
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

export const updateDeviceStatus = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { status, location, batteryLevel, isCharging, networkInfo } = req.body;
    
    const updateData: any = {
      lastSeen: new Date()
    };
    
    if (status) updateData.status = status;
    if (location) updateData.location = location;
    if (batteryLevel !== undefined) updateData.batteryLevel = batteryLevel;
    if (isCharging !== undefined) updateData.isCharging = isCharging;
    if (networkInfo) updateData.networkInfo = networkInfo;
    
    const device = await prisma.device.update({
      where: { deviceId },
      data: updateData
    });
    
    // Log heartbeat/status update event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'HEARTBEAT',
        eventData: {
          batteryLevel,
          isCharging,
          location: location ? { lat: location.latitude, lng: location.longitude } : null,
          timestamp: new Date()
        }
      }
    });

    // Convert BigInt values to strings for JSON serialization
    const deviceResponse = {
      ...device,
      totalStorage: device.totalStorage ? device.totalStorage.toString() : null,
      availableStorage: device.availableStorage ? device.availableStorage.toString() : null,
      totalRAM: device.totalRAM ? device.totalRAM.toString() : null,
      availableRAM: device.availableRAM ? device.availableRAM.toString() : null,
    };

    res.json({ success: true, device: deviceResponse, message: 'Heartbeat received successfully' });
  } catch (error) {
    console.error('Error updating device status:', error);
    res.status(500).json({ error: 'Failed to update device status' });
  }
};

export const deviceHeartbeat = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { batteryLevel, isCharging, location, networkInfo, systemHealth } = req.body;
    
    // Update device with heartbeat data
    const updateData: any = {
      lastSeen: new Date(),
      status: 'ACTIVE'
    };
    
    if (batteryLevel !== undefined) updateData.batteryLevel = batteryLevel;
    if (isCharging !== undefined) updateData.isCharging = isCharging;
    if (location) updateData.location = location;
    if (networkInfo) updateData.networkInfo = networkInfo;
    
    const device = await prisma.device.update({
      where: { deviceId },
      data: updateData
    });
    
    // Log heartbeat event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'HEARTBEAT',
        eventData: { 
          batteryLevel,
          isCharging,
          location: location ? { lat: location.latitude, lng: location.longitude } : null,
          networkInfo,
          systemHealth,
          timestamp: new Date()
        }
      }
    });
    
    // Check for pending commands
    const pendingCommands = await prisma.remoteCommand.findMany({
      where: { 
        device: { deviceId },
        status: 'PENDING'
      },
      orderBy: { createdAt: 'asc' },
      take: 10 // Limit to prevent overwhelming the device
    });
    
    res.json({ 
      success: true, 
      message: 'Heartbeat processed successfully',
      pendingCommands: pendingCommands.length,
      nextHeartbeat: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
    });
    
  } catch (error) {
    console.error('Error processing device heartbeat:', error);
    res.status(500).json({ error: 'Failed to process heartbeat' });
  }
};

// Enhanced monitoring methods
export const updateDeviceAnalytics = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const analytics: DeviceAnalytics = req.body;

    const device = await prisma.device.findUnique({
      where: { deviceId }
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
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
    const deviceResponse = {
      ...updatedDevice,
      totalStorage: updatedDevice.totalStorage ? updatedDevice.totalStorage.toString() : null,
      availableStorage: updatedDevice.availableStorage ? updatedDevice.availableStorage.toString() : null,
      totalRAM: updatedDevice.totalRAM ? updatedDevice.totalRAM.toString() : null,
      availableRAM: updatedDevice.availableRAM ? updatedDevice.availableRAM.toString() : null,
    };
    
    res.json(deviceResponse);
  } catch (error) {
    console.error('Error updating device analytics:', error);
    res.status(500).json({ error: 'Failed to update device analytics' });
  }
};

export const getDeviceAnalytics = async (req: Request, res: Response) => {
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
      return res.status(404).json({ error: 'Device not found' });
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
    const deviceResponse = {
      ...device,
      totalStorage: device.totalStorage ? device.totalStorage.toString() : null,
      availableStorage: device.availableStorage ? device.availableStorage.toString() : null,
      totalRAM: device.totalRAM ? device.totalRAM.toString() : null,
      availableRAM: device.availableRAM ? device.availableRAM.toString() : null,
    };

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

export const deleteDevice = async (req: Request, res: Response) => {
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
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Check if device has pending commands and force is not set
    if (device.commands.length > 0 && !force) {
      return res.status(409).json({
        error: 'Device has pending commands',
        message: 'Complete or cancel pending commands first, or use force=true',
        pendingCommands: device.commands.length
      });
    }
    
    // Log device deletion event before deletion
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'DEVICE_DELETED',
        eventData: {
          deletedBy: req.user?.id || 'system',
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
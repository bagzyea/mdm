import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { DeviceInfo, CommandPayload } from '../types';

const prisma = new PrismaClient();

export const getAllDevices = async (req: Request, res: Response) => {
  try {
    const devices = await prisma.device.findMany({
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
      }
    });
    res.json(devices);
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
    
    res.json(device);
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
};

export const enrollDevice = async (req: Request, res: Response) => {
  try {
    const deviceInfo: DeviceInfo = req.body;
    
    // Check if device already exists
    const existingDevice = await prisma.device.findUnique({
      where: { deviceId: deviceInfo.deviceId }
    });
    
    if (existingDevice) {
      return res.status(409).json({ error: 'Device already enrolled' });
    }
    
    const device = await prisma.device.create({
      data: {
        ...deviceInfo,
        status: 'ENROLLED'
      }
    });
    
    // Log enrollment event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'ENROLLMENT',
        eventData: deviceInfo as any
      }
    });
    
    res.status(201).json(device);
  } catch (error) {
    console.error('Error enrolling device:', error);
    res.status(500).json({ error: 'Failed to enroll device' });
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
    const { status, location } = req.body;
    
    const device = await prisma.device.update({
      where: { deviceId },
      data: {
        status,
        location,
        lastSeen: new Date()
      }
    });
    
    // Log status change event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'STATUS_CHANGE',
        eventData: { newStatus: status, location }
      }
    });
    
    res.json(device);
  } catch (error) {
    console.error('Error updating device status:', error);
    res.status(500).json({ error: 'Failed to update device status' });
  }
};
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Create Express app
const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Import middleware
import { securityHeaders, validateRequest } from './middleware/auth';

// Middleware
app.use(helmet());
app.use(securityHeaders);
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 
    ['https://admin.yourdomain.com', 'https://yourdomain.com'] : 
    ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:8080'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(validateRequest);
app.use(morgan('combined'));

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

// Import authentication middleware
import { authenticateToken, requirePermission, optionalAuth } from './middleware/auth';

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

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

// Import command service
import { CommandService } from './services/commandService';

// Initialize command service
const commandService = new CommandService(io);

// Start command queue processor (runs every 30 seconds)
setInterval(() => {
  commandService.processCommandQueue();
}, 30000);

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Device connected:', socket.id);
  
  // Device identification
  socket.on('deviceIdentify', async (deviceId: string) => {
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
      
      console.log(`Device ${deviceId} identified and ${pendingCommands.length} pending commands sent`);
    } catch (error) {
      console.error('Error handling device identification:', error);
    }
  });
  
  // Device heartbeat
  socket.on('deviceHeartbeat', async (deviceId: string) => {
    try {
      await prisma.device.update({
        where: { deviceId },
        data: { lastSeen: new Date() }
      });
    } catch (error) {
      console.error('Error updating device heartbeat:', error);
    }
  });
  
  // Command response from device
  socket.on('commandResponse', async (data: {
    commandId: string;
    deviceId: string;
    result: any;
  }) => {
    try {
      await commandService.handleCommandResponse(
        data.deviceId,
        data.commandId,
        data.result
      );
    } catch (error) {
      console.error('Error handling command response:', error);
    }
  });
  
  // Device status update
  socket.on('deviceStatusUpdate', async (data: {
    deviceId: string;
    status: string;
    location?: any;
    batteryLevel?: number;
    networkInfo?: any;
  }) => {
    try {
      await prisma.device.update({
        where: { deviceId: data.deviceId },
        data: {
          status: data.status as any,
          location: data.location,
          lastSeen: new Date()
        }
      });
      
      // Log status change event
      await prisma.deviceEvent.create({
        data: {
          deviceId: data.deviceId,
          eventType: 'STATUS_UPDATE',
          eventData: {
            oldStatus: data.status,
            newStatus: data.status,
            additionalData: {
              batteryLevel: data.batteryLevel,
              networkInfo: data.networkInfo
            }
          } as any
        }
      });
      
      // Notify admin dashboard of device status change
      io.emit('deviceStatusChanged', {
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
      console.error('Error updating device status:', error);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', async () => {
    const deviceId = socket.data.deviceId;
    console.log(`Device disconnected: ${socket.id}${deviceId ? ` (${deviceId})` : ''}`);
    
    // Update device status to INACTIVE if it was a device connection
    if (deviceId) {
      try {
        await prisma.device.update({
          where: { deviceId },
          data: { status: 'INACTIVE' }
        });
        
        // Notify admin dashboard
        io.emit('deviceStatusChanged', {
          deviceId,
          status: 'INACTIVE',
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Error updating device status on disconnect:', error);
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`MDM Backend server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
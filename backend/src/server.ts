import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
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

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// API routes
app.use('/api/devices', deviceRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Device connected:', socket.id);
  
  socket.on('deviceHeartbeat', async (deviceId) => {
    try {
      await prisma.device.update({
        where: { deviceId },
        data: { lastSeen: new Date() }
      });
    } catch (error) {
      console.error('Error updating device heartbeat:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Device disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`MDM Backend server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
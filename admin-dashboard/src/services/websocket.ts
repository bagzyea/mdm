import { io, Socket } from 'socket.io-client';

export type WebSocketEventHandler = (data: any) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, WebSocketEventHandler[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingAdminToken: string | null = null;

  constructor() {
    this.connect();
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io('http://localhost:5001', {
      transports: ['websocket'],
      upgrade: true,
      rememberUpgrade: true,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;

      // If we have a pending admin token, authenticate immediately
      if (this.pendingAdminToken) {
        this.authenticateAdmin(this.pendingAdminToken);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      
      // Attempt to reconnect if disconnected unexpectedly
      if (reason === 'io server disconnect') {
        // Server-initiated disconnect, don't reconnect automatically
        return;
      }
      
      this.scheduleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.scheduleReconnect();
    });

    // Set up event listeners for MDM-specific events
    this.setupMDMEventListeners();
  }

  private setupMDMEventListeners(): void {
    if (!this.socket) return;

    // Device-related events
    this.socket.on('deviceStatusChanged', (data) => {
      this.triggerHandlers('deviceStatusChanged', data);
    });

    this.socket.on('deviceEnrolled', (data) => {
      this.triggerHandlers('deviceEnrolled', data);
    });

    this.socket.on('deviceHeartbeat', (data) => {
      this.triggerHandlers('deviceHeartbeat', data);
    });

    // Command-related events
    this.socket.on('commandUpdate', (data) => {
      this.triggerHandlers('commandUpdate', data);
    });

    this.socket.on('commandCompleted', (data) => {
      this.triggerHandlers('commandCompleted', data);
    });

    // Policy-related events
    this.socket.on('policyUpdated', (data) => {
      this.triggerHandlers('policyUpdated', data);
    });

    // User-related events
    this.socket.on('userActivity', (data) => {
      this.triggerHandlers('userActivity', data);
    });

    // Notification events (for admin notification system)
    this.socket.on('deviceOffline', (data) => {
      this.triggerHandlers('deviceOffline', data);
    });

    this.socket.on('adminConnected', (data) => {
      console.log('Admin room joined:', data);
      this.triggerHandlers('adminConnected', data);
    });

    // System alerts
    this.socket.on('systemAlert', (data) => {
      this.triggerHandlers('systemAlert', data);
    });

    // Real-time dashboard updates
    this.socket.on('dashboardUpdate', (data) => {
      this.triggerHandlers('dashboardUpdate', data);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    setTimeout(() => {
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this.connect();
    }, delay);
  }

  private triggerHandlers(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in WebSocket event handler for ${event}:`, error);
        }
      });
    }
  }

  // Subscribe to events
  on(event: string, handler: WebSocketEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  // Unsubscribe from events
  off(event: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Emit events to server
  emit(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('WebSocket not connected, cannot emit event:', event);
    }
  }

  // Get connection status
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Disconnect
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.eventHandlers.clear();
    this.reconnectAttempts = 0;
  }

  // Subscribe to device updates
  subscribeToDeviceUpdates(handler: WebSocketEventHandler): void {
    this.on('deviceStatusChanged', handler);
    this.on('deviceEnrolled', handler);
    this.on('deviceHeartbeat', handler);
  }

  // Subscribe to real-time heartbeat updates
  subscribeToHeartbeatUpdates(handler: WebSocketEventHandler): void {
    this.on('deviceHeartbeat', handler);
  }

  // Subscribe to command updates
  subscribeToCommandUpdates(handler: WebSocketEventHandler): void {
    this.on('commandUpdate', handler);
    this.on('commandCompleted', handler);
  }

  // Subscribe to policy updates
  subscribeToPolicyUpdates(handler: WebSocketEventHandler): void {
    this.on('policyUpdated', handler);
  }

  // Subscribe to system alerts
  subscribeToSystemAlerts(handler: WebSocketEventHandler): void {
    this.on('systemAlert', handler);
  }

  // Subscribe to dashboard updates
  subscribeToDashboardUpdates(handler: WebSocketEventHandler): void {
    this.on('dashboardUpdate', handler);
  }

  // Request real-time device location updates
  requestDeviceLocationUpdates(deviceIds: string[]): void {
    this.emit('subscribeToDeviceLocations', { deviceIds });
  }

  // Stop real-time device location updates
  stopDeviceLocationUpdates(deviceIds: string[]): void {
    this.emit('unsubscribeFromDeviceLocations', { deviceIds });
  }

  /**
   * Authenticate as an admin and join the 'admins' room.
   * The server expects an 'adminConnect' event with { token }.
   */
  joinAdminRoom(token?: string): void {
    const jwt = token ?? localStorage.getItem('mdm_token');
    if (!jwt) {
      console.warn('Cannot join admin room: no auth token');
      return;
    }
    this.pendingAdminToken = jwt;

    if (this.socket?.connected) {
      this.authenticateAdmin(jwt);
    }
    // else: will be sent automatically on next 'connect' event
  }

  // Leave admin room
  leaveAdminRoom(): void {
    this.pendingAdminToken = null;
  }

  private authenticateAdmin(token: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('adminConnect', { token });
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();
export default websocketService;
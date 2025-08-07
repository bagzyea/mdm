// Remote command types and interfaces

export type CommandType = 
  | 'LOCK_DEVICE'
  | 'UNLOCK_DEVICE'
  | 'WIPE_DEVICE'
  | 'REBOOT_DEVICE'
  | 'LOCATE_DEVICE'
  | 'RING_DEVICE'
  | 'INSTALL_APP'
  | 'UNINSTALL_APP'
  | 'APPLY_POLICY'
  | 'REMOVE_POLICY'
  | 'UPDATE_POLICY'
  | 'GET_DEVICE_INFO'
  | 'SET_KIOSK_MODE'
  | 'EXIT_KIOSK_MODE'
  | 'SET_WIFI_CONFIG'
  | 'CLEAR_PASSCODE'
  | 'ENABLE_LOST_MODE'
  | 'DISABLE_LOST_MODE'
  | 'TAKE_SCREENSHOT'
  | 'GET_APP_LIST'
  | 'SYNC_SETTINGS';

export interface CommandParameters {
  // Lock/Unlock commands
  lockMessage?: string;
  lockPhoneNumber?: string;
  
  // App management
  packageName?: string;
  appUrl?: string;
  appName?: string;
  
  // Policy management
  policyId?: string;
  
  // WiFi configuration
  ssid?: string;
  password?: string;
  security?: 'WPA' | 'WPA2' | 'WPA3' | 'OPEN';
  
  // Lost mode
  lostModeMessage?: string;
  lostModePhone?: string;
  footnote?: string;
  
  // Kiosk mode
  allowedApps?: string[];
  exitCode?: string;
  
  // Location
  enableHighAccuracy?: boolean;
  
  // General parameters
  force?: boolean;
  timeout?: number;
  [key: string]: any;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: any;
  timestamp: Date;
  errorCode?: string;
  deviceInfo?: {
    batteryLevel?: number;
    location?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      timestamp: Date;
    };
    appList?: Array<{
      packageName: string;
      appName: string;
      version: string;
      isSystemApp: boolean;
    }>;
    systemInfo?: {
      osVersion: string;
      securityPatchLevel: string;
      totalStorage: number;
      availableStorage: number;
      totalRAM: number;
      availableRAM: number;
    };
    networkInfo?: {
      wifiEnabled: boolean;
      connectedWifi?: string;
      cellularEnabled: boolean;
      bluetoothEnabled: boolean;
    };
  };
}

export interface CreateCommandRequest {
  deviceIds: string[]; // Can send to multiple devices
  command: CommandType;
  parameters?: CommandParameters;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  executeAt?: Date; // Schedule command for later
  expiresAt?: Date; // Command expiration
}

export interface CommandStatus {
  id: string;
  deviceId: string;
  command: CommandType;
  status: 'PENDING' | 'SENT' | 'EXECUTED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  parameters?: CommandParameters;
  result?: CommandResult;
  createdAt: Date;
  updatedAt: Date;
  executedAt?: Date;
  device: {
    id: string;
    deviceId: string;
    manufacturer: string;
    model: string;
    status: string;
  };
}
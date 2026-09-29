// Remote command types and interfaces

// The single command vocabulary lives in @mdm/shared-types, checked against the agent.
export type { CommandType } from '@mdm/shared-types';
import type { CommandType } from '@mdm/shared-types';

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

  // Provisioning parameters
  sessionId?: string;
  profileId?: string;
  apps?: Array<{
    packageName: string;
    appName: string;
    apkUrl: string;
    apkHash?: string;
    permissions?: string[];
    installOrder: number;
    isRequired: boolean;
  }>;
  networkConfig?: any;  // APNConfiguration
  securityConfig?: any; // ProvisioningSecurityConfig

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
export interface DeviceInfo {
  deviceId: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkVersion: number;
  fingerprint: string;
}

export interface PolicyRule {
  type: string;
  enabled: boolean;
  parameters: Record<string, any>;
}

export interface CommandPayload {
  command: string;
  parameters?: Record<string, any>;
}

export interface DeviceStatus {
  id: string;
  status: 'ENROLLED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'WIPED';
  lastSeen: Date;
  location?: {
    latitude: number;
    longitude: number;
    timestamp: Date;
  };
}
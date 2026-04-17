export interface DeviceHeartbeatData {
  deviceId: string;
  batteryLevel?: number;
  isCharging?: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
  networkInfo?: Record<string, unknown>;
  systemHealth?: Record<string, unknown>;
  appUsage?: Record<string, unknown>;
  storageInfo?: {
    total: number;
    available: number;
  };
  memoryInfo?: {
    total: number;
    available: number;
  };
}

export interface DeviceInfo {
  deviceId: string;
  manufacturer?: string;
  model?: string;
  androidVersion?: string;
  serialNumber?: string;
  imei?: string;
  phoneNumber?: string;
  carrier?: string;
  batteryLevel?: number;
  isCharging?: boolean;
  status?: string;
}

export interface DeviceStatusUpdate {
  deviceId: string;
  status: string;
  location?: unknown;
  batteryLevel?: number;
  networkInfo?: unknown;
}

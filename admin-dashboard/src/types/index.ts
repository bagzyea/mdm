// Core types for the MDM Admin Dashboard

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'DEVICE';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresIn: string;
}

export interface Device {
  id: string;
  deviceId: string;
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkVersion: number;
  fingerprint: string;
  status: DeviceStatus;
  enrolledAt: string;
  lastSeen: string;
  location?: DeviceLocation;
  assignedTo?: string;
  policies: Policy[];
  createdAt: string;
  updatedAt: string;
}

export type DeviceStatus = 'ENROLLED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'WIPED';

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  type: PolicyType;
  rules: PolicyRules;
  targetDevices: string[];
  priority: number;
  isActive: boolean;
  devices?: Device[];
  createdAt: string;
  updatedAt: string;
}

export type PolicyType = 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE';

export interface PolicyRules {
  security?: SecurityPolicy;
  network?: NetworkPolicy;
  application?: ApplicationPolicy;
  compliance?: CompliancePolicy;
}

export interface SecurityPolicy {
  passwordRequired: boolean;
  passwordMinLength?: number;
  passwordComplexity?: 'simple' | 'complex' | 'alphanumeric';
  passwordExpiry?: number;
  maxFailedAttempts?: number;
  lockoutDuration?: number;
  encryptionRequired: boolean;
  screenLockTimeout?: number;
  biometricAllowed?: boolean;
  automaticLock: boolean;
}

export interface NetworkPolicy {
  wifiRestrictions: {
    allowedNetworks?: string[];
    blockedNetworks?: string[];
    requireCertificate?: boolean;
    allowPersonalHotspot?: boolean;
  };
  vpnRequired?: boolean;
  vpnConfiguration?: {
    serverAddress: string;
    username?: string;
    certificateId?: string;
  };
  cellularDataAllowed: boolean;
  roamingAllowed: boolean;
  bluetoothAllowed: boolean;
}

export interface ApplicationPolicy {
  appWhitelist?: string[];
  appBlacklist?: string[];
  allowAppInstallation: boolean;
  allowUnknownSources: boolean;
  managedAppStore?: {
    url: string;
    certificate?: string;
  };
  restrictedAppCategories?: string[];
  allowAppUninstall: boolean;
  kioskMode?: {
    enabled: boolean;
    allowedApps: string[];
  };
}

export interface CompliancePolicy {
  requiredOSVersion?: string;
  maxOSVersion?: string;
  jailbreakDetection: boolean;
  antivirusRequired?: boolean;
  deviceHealthChecks: boolean;
  locationServicesRequired?: boolean;
  backupRequired?: boolean;
  updatePolicy?: {
    automatic: boolean;
    delayDays?: number;
  };
}

export interface RemoteCommand {
  id: string;
  deviceId: string;
  command: CommandType;
  parameters?: CommandParameters;
  status: CommandStatus;
  result?: CommandResult;
  device: {
    id: string;
    deviceId: string;
    manufacturer: string;
    model: string;
    status: string;
  };
  createdAt: string;
  updatedAt: string;
}

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

export type CommandStatus = 'PENDING' | 'SENT' | 'EXECUTED' | 'FAILED' | 'CANCELLED';

export interface CommandParameters {
  [key: string]: any;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: any;
  timestamp: string;
  errorCode?: string;
}

export interface DashboardStats {
  totalDevices: number;
  activeDevices: number;
  inactiveDevices: number;
  suspendedDevices: number;
  totalPolicies: number;
  activePolicies: number;
  pendingCommands: number;
  executedCommands: number;
  failedCommands: number;
  totalUsers: number;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

// Component Props Types
export interface TableColumn {
  id: string;
  label: string;
  minWidth?: number;
  align?: 'right' | 'left' | 'center';
  format?: (value: any) => string;
  sortable?: boolean;
}

export interface FilterOption {
  value: string | number;
  label: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  color?: string;
}

export interface NotificationMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}
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
  commands?: RemoteCommand[];
  createdAt: string;
  updatedAt: string;
  
  // Enhanced monitoring fields
  batteryLevel?: number;
  isCharging?: boolean;
  totalStorage?: number;
  availableStorage?: number;
  totalRAM?: number;
  availableRAM?: number;
  networkInfo?: NetworkInfo;
  appUsageStats?: AppUsageStats[];
  systemHealth?: SystemHealth;
  
  // Provisioning fields
  deviceModel?: string;
  lastProvisionedAt?: string;
  provisioningStatus?: ProvisioningDeviceStatus;
  provisioningProgress?: ProvisioningProgress[];
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

export type PolicyType = 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE' | 'HARDWARE' | 'SYSTEM';

export interface PolicyRules {
  security?: SecurityPolicy;
  network?: NetworkPolicy;
  application?: ApplicationPolicy;
  compliance?: CompliancePolicy;
  hardware?: any;
  system?: any;
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
  executedAt?: string;
  completedAt?: string;
  error?: string;
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
  devices?: T[]; // Legacy support
  pagination?: {
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

// Enhanced monitoring interfaces
export interface BatteryInfo {
  level: number; // 0-100
  isCharging: boolean;
  temperature?: number;
  voltage?: number;
  health?: string;
}

export interface StorageInfo {
  totalStorage: number; // bytes
  availableStorage: number; // bytes
  usedStorage: number; // bytes
  internalStorage?: number;
  externalStorage?: number;
}

export interface MemoryInfo {
  totalRAM: number; // bytes
  availableRAM: number; // bytes
  usedRAM: number; // bytes
  lowMemory: boolean;
}

export interface NetworkInfo {
  wifiEnabled: boolean;
  connectedWifi?: string;
  wifiSignalStrength?: number;
  cellularEnabled: boolean;
  cellularType?: string; // 4G, 5G, etc.
  bluetoothEnabled: boolean;
  dataUsage?: {
    wifiBytesReceived: number;
    wifiBytesSent: number;
    cellularBytesReceived: number;
    cellularBytesSent: number;
  };
}

export interface AppUsageStats {
  packageName: string;
  appName: string;
  usageTime: number; // milliseconds
  lastUsed: Date;
  launchCount: number;
}

export interface SystemHealth {
  cpuUsage: number; // percentage
  temperature: number; // celsius
  uptime: number; // seconds
  securityPatchLevel: string;
  encryptionStatus: string;
  rootStatus: boolean;
}

export interface DeviceAnalytics {
  deviceId: string;
  batteryInfo: BatteryInfo;
  storageInfo: StorageInfo;
  memoryInfo: MemoryInfo;
  networkInfo: NetworkInfo;
  appUsageStats: AppUsageStats[];
  systemHealth: SystemHealth;
  timestamp: Date;
}

export interface DeviceHealthSummary {
  totalDevices: number;
  activeDevices: number;
  lowBatteryDevices: number;
  lowStorageDevices: number;
  offlineDevices: number;
}

// Advanced Security Types
export interface Certificate {
  id: string;
  name: string;
  description?: string;
  type: 'SSL_TLS' | 'CLIENT_AUTH' | 'CODE_SIGNING' | 'ROOT_CA' | 'INTERMEDIATE_CA' | 'DEVICE_CA';
  certificateData: string;
  privateKey?: string;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  isRevoked: boolean;
  revocationDate?: string;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  devices?: DeviceCertificate[];
}

export interface DeviceCertificate {
  id: string;
  deviceId: string;
  certificateId: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'PENDING' | 'FAILED';
  installedAt: string;
  expiresAt: string;
  lastVerified?: string;
  certificate?: Certificate;
}

export interface SecurityStatus {
  id: string;
  deviceId: string;
  encryptionStatus: 'UNKNOWN' | 'NOT_ENCRYPTED' | 'PARTIALLY_ENCRYPTED' | 'FULLY_ENCRYPTED' | 'ENCRYPTION_FAILED';
  encryptionType?: string;
  encryptionStrength?: number;
  rootStatus: boolean;
  jailbreakDetected: boolean;
  securityPatchLevel?: string;
  lastSecurityScan?: string;
  complianceStatus: 'UNKNOWN' | 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'PENDING';
  complianceScore?: number;
  lastComplianceCheck?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceReport {
  id: string;
  deviceId: string;
  reportType: 'SECURITY' | 'ENCRYPTION' | 'CERTIFICATE' | 'ROOT_DETECTION' | 'PATCH_LEVEL' | 'OVERALL';
  status: 'UNKNOWN' | 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'PENDING';
  score: number;
  details: Record<string, any>;
  violations?: Record<string, any>[];
  recommendations?: Record<string, any>[];
  generatedAt: string;
  expiresAt?: string;
}

export interface CertificateRequest {
  name: string;
  description?: string;
  type: Certificate['type'];
  subject: string;
  issuer: string;
  validDays: number;
  privateKey?: string;
}

export interface EncryptionPolicy {
  enabled: boolean;
  encryptionType: 'AES' | 'ChaCha20' | 'AES_GCM';
  encryptionStrength: 128 | 256;
  enforceDeviceEncryption: boolean;
  enforceAppEncryption: boolean;
  requireEncryptedStorage: boolean;
}

export interface ComplianceCheck {
  deviceId: string;
  checkTypes: ComplianceReport['reportType'][];
  includeRecommendations?: boolean;
}

// Provisioning Interfaces
export interface ProvisioningProfile {
  id: string;
  name: string;
  description?: string;
  deviceModels: string[];
  applications: ProvisioningApp[];
  networkConfig?: APNConfiguration;
  securityConfig?: ProvisioningSecurityConfig;
  filePackages: FilePackage[];
  geographicRules?: GeographicRules;
  isActive: boolean;
  sessions?: ProvisioningSession[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  _count?: {
    applications: number;
    filePackages: number;
    sessions: number;
  };
}

export interface ProvisioningApp {
  id: string;
  profileId: string;
  packageName: string;
  appName: string;
  version?: string;
  apkUrl?: string;
  apkHash?: string;
  requiredPermissions: string[];
  installOrder: number;
  isRequired: boolean;
}

export interface FilePackage {
  id: string;
  profileId: string;
  name: string;
  description?: string;
  fileType: 'CONFIG' | 'FORM' | 'DATA' | 'CERTIFICATE' | 'DOCUMENTATION' | 'MEDIA' | 'OTHER';
  filePath: string;
  fileHash?: string;
  targetPath: string;
  isRequired: boolean;
  fileSize?: number;
}

export interface ProvisioningSession {
  id: string;
  profileId: string;
  name: string;
  description?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  deviceIds: string[];
  progress: ProvisioningProgress[];
  totalDevices: number;
  completedDevices: number;
  failedDevices: number;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  profile?: ProvisioningProfile;
  createdAt: string;
  updatedAt: string;
  stats?: SessionStats;
}

export interface ProvisioningProgress {
  id: string;
  sessionId: string;
  deviceId: string;
  status: ProvisioningDeviceStatus;
  currentStep?: string;
  totalSteps: number;
  completedSteps: number;
  errorMessage?: string;
  errorCode?: string;
  logs?: ProvisioningLog[];
  startedAt?: string;
  completedAt?: string;
  device?: {
    id: string;
    deviceId: string;
    manufacturer: string;
    model: string;
    status: string;
  };
}

export type ProvisioningDeviceStatus = 
  | 'NOT_PROVISIONED'
  | 'PENDING'
  | 'DOWNLOADING_APPS'
  | 'INSTALLING_APPS'
  | 'CONFIGURING_NETWORK'
  | 'CONFIGURING_SECURITY'
  | 'DEPLOYING_FILES'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface APNConfiguration {
  carrier: 'MTN' | 'AIRTEL' | 'CUSTOM';
  apn: string;
  name: string;
  type: '3G' | '4G' | '5G' | 'AUTO';
  protocol: 'IPV4' | 'IPV6' | 'IPV4V6';
  username?: string;
  password?: string;
  proxy?: string;
  port?: number;
  mmsc?: string;
  mmsProxy?: string;
  mmsPort?: number;
}

export interface ProvisioningSecurityConfig {
  devicePin?: string;
  screenTimeout?: number; // seconds
  enableEncryption: boolean;
  encryptionType?: 'AES' | 'ChaCha20';
  requireSecureBoot: boolean;
  allowDeveloperOptions: boolean;
  allowUSBDebugging: boolean;
  enforceAppPermissions: boolean;
}

export interface GeographicRules {
  districts?: string[];
  regions?: string[];
  coordinates?: {
    latitude: number;
    longitude: number;
    radius: number; // meters
  }[];
  restrictToLocation?: boolean;
}

export interface ProvisioningLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  details?: Record<string, any>;
}

export interface SessionStats {
  totalDevices: number;
  completedDevices: number;
  failedDevices: number;
  pendingDevices: number;
  successRate: string;
  averageTimePerDevice: string;
}

// Request/Response interfaces
export interface SelectedAPK {
  apk: {
    packageName: string;
    appName: string;
    version: string;
    apkUrl: string;
    apkHash: string;
    permissions: string[];
    filePath: string;
    fileSize?: number;
  };
  installOrder: number;
  isRequired: boolean;
}

export interface CreateProvisioningProfileRequest {
  name: string;
  description?: string;
  deviceModels: string[];
  applications: Omit<ProvisioningApp, 'id' | 'profileId'>[];
  selectedAPKs?: SelectedAPK[];
  networkConfig?: APNConfiguration;
  securityConfig?: ProvisioningSecurityConfig;
  filePackages: Omit<FilePackage, 'id' | 'profileId'>[];
  geographicRules?: GeographicRules;
}

export interface CreateProvisioningSessionRequest {
  profileId: string;
  name: string;
  description?: string;
  deviceIds: string[];
}

export interface StartProvisioningRequest {
  options?: {
    parallelLimit?: number;
    retryAttempts?: number;
    skipValidation?: boolean;
  };
}

export interface ProvisioningStatusUpdate {
  deviceId: string;
  status: ProvisioningDeviceStatus;
  currentStep?: string;
  completedSteps?: number;
  totalSteps?: number;
  errorMessage?: string;
  errorCode?: string;
  logs?: ProvisioningLog[];
}

export interface ProvisioningValidationResult {
  profileId: string;
  profileName: string;
  validation: {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  };
}

export interface CompatibleDevicesResponse {
  profileId: string;
  supportedModels: string[];
  compatibleDevices: Pick<Device, 'id' | 'deviceId' | 'manufacturer' | 'model' | 'deviceModel' | 'status' | 'provisioningStatus' | 'lastProvisionedAt' | 'lastSeen'>[];
  totalCompatible: number;
}

export interface ProvisioningStatistics {
  timeRange: string;
  statistics: {
    totalSessions: number;
    completedSessions: number;
    failedSessions: number;
    inProgressSessions: number;
    totalDevicesProvisioned: number;
    averageDevicesPerSession: string;
    successRate: string;
  };
  sessions: Array<{
    id: string;
    name: string;
    status: string;
    totalDevices: number;
    completedDevices: number;
    failedDevices: number;
    createdAt: string;
    completedAt?: string;
  }>;
}
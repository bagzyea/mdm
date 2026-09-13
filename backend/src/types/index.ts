/**
 * The device wire contract lives in @mdm/shared-types (finding F-19).
 *
 * This file previously declared its own DeviceInfo with `androidVersion` / `sdkVersion`
 * / `fingerprint`, while the enrollment controller read `osVersion` / `apiLevel` /
 * `buildNumber` and the Android agent sent the latter. 98 of the backend's type errors
 * traced to that drift. Re-exported here so existing imports keep working.
 */
export type {
  DeviceInfo,
  DeviceLocation,
  InstalledApp,
  DeviceHeartbeatData,
  DeviceStatusUpdate,
  EnrollmentResponse,
} from '@mdm/shared-types';

/**
 * The wire-level network block an agent reports inside DeviceInfo. Deliberately not
 * re-exported as `NetworkInfo`: this file already declares a richer NetworkInfo used by
 * the monitoring code, and the two are different shapes.
 */
export type { NetworkInfo as DeviceNetworkInfo } from '@mdm/shared-types';

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

// Advanced Security Interfaces
export interface Certificate {
  id: string;
  name: string;
  description?: string;
  type: 'SSL_TLS' | 'CLIENT_AUTH' | 'CODE_SIGNING' | 'ROOT_CA' | 'INTERMEDIATE_CA' | 'DEVICE_CA';
  certificateData: string; // PEM encoded
  privateKey?: string; // Encrypted
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  isRevoked: boolean;
  revocationDate?: Date;
  revocationReason?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface DeviceCertificate {
  id: string;
  deviceId: string;
  certificateId: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'PENDING' | 'FAILED';
  installedAt: Date;
  expiresAt: Date;
  lastVerified?: Date;
  certificate?: Certificate;
}

export interface SecurityStatus {
  id: string;
  deviceId: string;
  encryptionStatus: 'UNKNOWN' | 'NOT_ENCRYPTED' | 'PARTIALLY_ENCRYPTED' | 'FULLY_ENCRYPTED' | 'ENCRYPTION_FAILED';
  encryptionType?: string; // AES, ChaCha20, etc.
  encryptionStrength?: number; // 128, 256, etc.
  rootStatus: boolean;
  jailbreakDetected: boolean;
  securityPatchLevel?: string;
  lastSecurityScan?: Date;
  complianceStatus: 'UNKNOWN' | 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'PENDING';
  complianceScore?: number; // 0-100
  lastComplianceCheck?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceReport {
  id: string;
  deviceId: string;
  reportType: 'SECURITY' | 'ENCRYPTION' | 'CERTIFICATE' | 'ROOT_DETECTION' | 'PATCH_LEVEL' | 'OVERALL';
  status: 'UNKNOWN' | 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'PENDING';
  score: number; // 0-100
  details: Record<string, any>; // Detailed compliance check results
  violations?: Record<string, any>[]; // List of compliance violations
  recommendations?: Record<string, any>[]; // Recommendations for compliance
  generatedAt: Date;
  expiresAt?: Date;
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
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
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
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
  profile?: ProvisioningProfile;
  createdAt: Date;
  updatedAt: Date;
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
  startedAt?: Date;
  completedAt?: Date;
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
  timestamp: Date;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  details?: Record<string, any>;
}

// Request/Response interfaces
export interface CreateProvisioningProfileRequest {
  name: string;
  description?: string;
  deviceModels: string[];
  applications: Omit<ProvisioningApp, 'id' | 'profileId'>[];
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
  sessionId: string;
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
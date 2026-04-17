// Policy type definitions for different policy categories

export interface SecurityPolicy {
  passwordRequired: boolean;
  passwordMinLength?: number;
  passwordComplexity?: 'simple' | 'complex' | 'alphanumeric';
  passwordExpiryDays?: number; // Advanced
  passwordHistoryCount?: number; // Advanced
  maxFailedAttempts?: number;
  autoWipeOnFailure?: boolean; // Advanced
  encryptionRequired: boolean;
  screenLockTimeout?: number;
  biometricAllowed?: boolean;
  trustAgentsAllowed?: boolean; // Advanced
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
  nfcDisabled?: boolean; // Advanced
  airplaneModeDisabled?: boolean; // Advanced
  globalProxyUrl?: string; // Advanced
}

export interface ApplicationPolicy {
  appWhitelist?: string[];
  appBlacklist?: string[];
  allowAppInstallation: boolean;
  allowUnknownSources: boolean;
  clipboardDlpEnabled?: boolean; // Advanced: Data loss prevention
  preventAppDataClearing?: boolean; // Advanced
  safeSearchEnforced?: boolean; // Advanced
  allowAppUninstall: boolean;
  kioskMode?: {
    enabled: boolean;
    allowedApps: string[];
  };
}

export interface HardwarePolicy {
  cameraDisabled?: boolean;
  usbFileTransferDisabled?: boolean;
  externalStorageDisabled?: boolean;
  screenCaptureDisabled?: boolean;
  microphoneDisabled?: boolean;
}

export interface SystemPolicy {
  systemUpdatePolicy?: 'AUTOMATIC' | 'POSTPONED' | 'WINDOWED';
  updateWindowStart?: string; // e.g., "02:00"
  updateWindowEnd?: string; // e.g., "05:00"
  factoryResetDisabled?: boolean;
  safeBootDisabled?: boolean;
  timeDateModificationDisabled?: boolean;
  accountModificationDisabled?: boolean; // Prevents adding personal Google accounts
}

export interface CompliancePolicy {
  requiredOSVersion?: string;
  maxOSVersion?: string;
  jailbreakDetection: boolean;
  deviceHealthChecks: boolean;
}

export interface PolicyRules {
  security?: SecurityPolicy;
  network?: NetworkPolicy;
  application?: ApplicationPolicy;
  compliance?: CompliancePolicy;
  hardware?: HardwarePolicy;
  system?: SystemPolicy;
  customRules?: Record<string, any>;
}

export interface CreatePolicyRequest {
  name: string;
  description: string;
  type: 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE' | 'HARDWARE' | 'SYSTEM';
  rules: PolicyRules;
  targetDevices?: string[]; // device IDs
  priority?: number;
  isActive?: boolean;
}

export interface UpdatePolicyRequest {
  name?: string;
  description?: string;
  rules?: PolicyRules;
  targetDevices?: string[];
  priority?: number;
  isActive?: boolean;
}
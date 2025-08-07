// Policy type definitions for different policy categories

export interface SecurityPolicy {
  passwordRequired: boolean;
  passwordMinLength?: number;
  passwordComplexity?: 'simple' | 'complex' | 'alphanumeric';
  passwordExpiry?: number; // days
  maxFailedAttempts?: number;
  lockoutDuration?: number; // minutes
  encryptionRequired: boolean;
  screenLockTimeout?: number; // minutes
  biometricAllowed?: boolean;
  automaticLock: boolean;
}

export interface NetworkPolicy {
  wifiRestrictions: {
    allowedNetworks?: string[]; // SSIDs
    blockedNetworks?: string[]; // SSIDs
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
  appWhitelist?: string[]; // package names
  appBlacklist?: string[]; // package names
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

export interface PolicyRules {
  security?: SecurityPolicy;
  network?: NetworkPolicy;
  application?: ApplicationPolicy;
  compliance?: CompliancePolicy;
  customRules?: Record<string, any>;
}

export interface CreatePolicyRequest {
  name: string;
  description: string;
  type: 'SECURITY' | 'NETWORK' | 'APPLICATION' | 'COMPLIANCE';
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
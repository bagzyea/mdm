export interface Policy {
  id: string;
  name: string;
  description?: string;
  type: 'SECURITY' | 'COMPLIANCE' | 'CONFIGURATION' | 'APP_MANAGEMENT';
  rules: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyRule {
  id: string;
  policyId: string;
  ruleType: string;
  configuration: Record<string, unknown>;
  isEnabled: boolean;
}

export interface DevicePolicy {
  deviceId: string;
  policyId: string;
  appliedAt: Date;
  status: 'APPLIED' | 'PENDING' | 'FAILED';
}

// Authentication and authorization types

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: Date | null;
  refreshToken?: string | null;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'DEVICE';

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'password'>;
  token: string;
  expiresIn: string;
  refreshToken: string;
}

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface DeviceAuthRequest {
  deviceId: string;
  deviceSecret: string;
  fingerprint: string;
}

export interface DeviceAuthResponse {
  deviceToken: string;
  expiresIn: string;
  serverEndpoints: {
    api: string;
    websocket: string;
  };
}

// Role-based permissions
export interface Permission {
  resource: string;
  actions: string[];
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [
    { resource: '*', actions: ['*'] } // Full access to everything
  ],
  ADMIN: [
    { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'devices', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'policies', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'commands', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'analytics', actions: ['read'] },
    { resource: 'settings', actions: ['read', 'update'] }
  ],
  OPERATOR: [
    { resource: 'devices', actions: ['read', 'update'] },
    { resource: 'policies', actions: ['read', 'apply'] },
    { resource: 'commands', actions: ['create', 'read'] },
    { resource: 'analytics', actions: ['read'] }
  ],
  VIEWER: [
    { resource: 'devices', actions: ['read'] },
    { resource: 'policies', actions: ['read'] },
    { resource: 'commands', actions: ['read'] },
    { resource: 'analytics', actions: ['read'] }
  ],
  DEVICE: [
    { resource: 'device-self', actions: ['read', 'update'] },
    { resource: 'commands-self', actions: ['read', 'update'] },
    { resource: 'policies-self', actions: ['read'] }
  ]
};

// API rate limiting by role
export const RATE_LIMITS: Record<UserRole, { requests: number; window: number }> = {
  SUPER_ADMIN: { requests: 1000, window: 900 }, // 1000 requests per 15 minutes
  ADMIN: { requests: 500, window: 900 },        // 500 requests per 15 minutes
  OPERATOR: { requests: 200, window: 900 },     // 200 requests per 15 minutes
  VIEWER: { requests: 100, window: 900 },       // 100 requests per 15 minutes
  DEVICE: { requests: 50, window: 300 }         // 50 requests per 5 minutes
};
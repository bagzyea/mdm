import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { 
  User, 
  CreateUserRequest, 
  LoginRequest, 
  LoginResponse, 
  TokenPayload,
  UserRole,
  ROLE_PERMISSIONS
} from '../types/auth';
import config from '../config/env';
import { redactSensitive } from '../utils/redact';
import { definedOnly } from '../utils/prisma';
import prisma from '../db';
import * as crypto from 'crypto';
import { authenticateWithDirectory, DirectoryIdentity } from './directoryService';


export class AuthService {
  private readonly JWT_SECRET = config.jwtSecret;
  private readonly JWT_EXPIRES_IN = config.jwtExpiresIn;
  private readonly REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Generate JWT token
  generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    return jwt.sign(
      payload as object, 
      this.JWT_SECRET as string, 
      {
        expiresIn: this.JWT_EXPIRES_IN as string,
        issuer: 'mdm-system',
        audience: 'mdm-users'
      } as jwt.SignOptions
    );
  }

  // Generate refresh token
  async generateRefreshToken(userId: string): Promise<string> {
    const token = jwt.sign(
      { userId, type: 'refresh' },
      this.JWT_SECRET as string,
      { expiresIn: '7d' } as jwt.SignOptions
    );

    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_EXPIRES_IN);

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt
      }
    });

    return token;
  }

  // Verify JWT token
  verifyToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.JWT_SECRET as string, {
        issuer: 'mdm-system',
        audience: 'mdm-users'
      } as jwt.VerifyOptions) as TokenPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Hash password
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  // Verify password
  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  // Create new user
  async createUser(userData: CreateUserRequest, createdBy?: string): Promise<Omit<User, 'password'>> {
    // Validate password strength
    if (!this.isValidPassword(userData.password)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
    }

    // Check if username or email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: userData.username },
          { email: userData.email }
        ]
      }
    });

    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    const hashedPassword = await this.hashPassword(userData.password);

    const user = await prisma.user.create({
      data: {
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        ...definedOnly({ createdBy })
      }
    });

    // Log user creation
    if (createdBy) {
      await this.logUserAction(createdBy, 'CREATE_USER', 'users', user.id, {
        username: user.username,
        email: user.email,
        role: user.role
      });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // User login
  //
  // A local MDM password is tried first. If that fails and Active Directory is
  // configured, the same credentials are tried against the directory (see
  // directoryService.ts); a successful bind is matched to an MDM account by username or
  // email, which is where the role comes from. Every failure returns the same message,
  // so the response does not reveal which accounts exist.
  async login(loginData: LoginRequest, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    const identifier = loginData.username.trim();

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } }
        ]
      }
    });

    let authenticated = !!user && user.isActive &&
      (await this.verifyPassword(loginData.password, user.password));
    let method: 'local' | 'directory' = 'local';

    if (!authenticated) {
      const directory = await authenticateWithDirectory(identifier, loginData.password);
      if (directory.ok) {
        user = (await this.findUserForDirectoryIdentity(directory.identity)) ??
          (await this.provisionDirectoryUser(directory.identity));
        authenticated = !!user && user.isActive;
        method = 'directory';
      } else if (directory.reason === 'unreachable' && !user) {
        throw new Error('Invalid credentials (the directory could not be reached; try again shortly)');
      }
    }

    if (!user || !authenticated) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Generate tokens
    const tokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    const token = this.generateToken(tokenPayload);
    const refreshToken = await this.generateRefreshToken(user.id);

    // Log login
    await this.logUserAction(user.id, 'LOGIN', 'auth', null, {
      loginTime: new Date(),
      method,
      ipAddress,
      userAgent
    }, ipAddress, userAgent);

    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
      refreshToken,
      expiresIn: this.JWT_EXPIRES_IN
    };
  }

  /** The MDM account a directory identity belongs to: by username, then by email. */
  private async findUserForDirectoryIdentity(identity: DirectoryIdentity) {
    const names = [identity.sAMAccountName].filter((v): v is string => !!v);
    const emails = [identity.email, identity.userPrincipalName].filter((v): v is string => !!v);
    if (names.length === 0 && emails.length === 0) return null;
    return prisma.user.findFirst({
      where: {
        OR: [
          ...names.map((n) => ({ username: { equals: n, mode: 'insensitive' as const } })),
          ...emails.map((e) => ({ email: { equals: e, mode: 'insensitive' as const } }))
        ]
      }
    });
  }

  /**
   * Create an MDM account for a directory user with no account yet — only when
   * LDAP_AUTO_PROVISION_ROLE names a role. Off by default: a domain login alone grants
   * nothing until an administrator adds the person to MDM.
   */
  private async provisionDirectoryUser(identity: DirectoryIdentity) {
    const role = process.env.LDAP_AUTO_PROVISION_ROLE?.trim() as UserRole | undefined;
    const allowed: UserRole[] = ['VIEWER', 'OPERATOR', 'ADMIN'];
    if (!role || !allowed.includes(role) || !identity.sAMAccountName) return null;

    const email = identity.email ?? identity.userPrincipalName ?? `${identity.sAMAccountName}@directory.local`;
    return prisma.user.create({
      data: {
        username: identity.sAMAccountName,
        email,
        // Never usable as a local password: directory users sign in through AD.
        password: await this.hashPassword(crypto.randomBytes(32).toString('base64url')),
        firstName: identity.firstName ?? identity.displayName ?? identity.sAMAccountName,
        lastName: identity.lastName ?? '',
        role,
        createdBy: 'directory'
      }
    });
  }

  // Refresh token
  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    try {
      const decoded = jwt.verify(refreshToken, this.JWT_SECRET as string) as any;
      
      // Check if refresh token exists in database and is not revoked
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken }
      });

      if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
        throw new Error('Invalid refresh token');
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Revoke old refresh token
      await prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { isRevoked: true }
      });

      // Generate new tokens
      const tokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      const newToken = this.generateToken(tokenPayload);
      const newRefreshToken = await this.generateRefreshToken(user.id);

      return {
        token: newToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Logout (revoke refresh token)
  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { isRevoked: true }
    });
  }

  // Check if user has permission
  hasPermission(userRole: UserRole, resource: string, action: string): boolean {
    const rolePermissions = ROLE_PERMISSIONS[userRole];
    
    // Check for super admin or wildcard permissions
    if (rolePermissions.some(p => p.resource === '*' && p.actions.includes('*'))) {
      return true;
    }

    // Check specific resource permissions
    const resourcePermission = rolePermissions.find(p => p.resource === resource);
    if (!resourcePermission) {
      return false;
    }

    // Check if action is allowed
    return resourcePermission.actions.includes(action) || resourcePermission.actions.includes('*');
  }

  // Get user by ID
  async getUserById(userId: string): Promise<Omit<User, 'password'> | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return null;
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Update user
  async updateUser(userId: string, updates: Partial<User>, updatedBy: string): Promise<Omit<User, 'password'>> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: updates
    });

    // Log user update
    await this.logUserAction(updatedBy, 'UPDATE_USER', 'users', userId, updates);

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Delete user (deactivate)
  async deleteUser(userId: string, deletedBy: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false }
    });

    // Log user deletion
    await this.logUserAction(deletedBy, 'DELETE_USER', 'users', userId, {});
  }

  // Change password
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isValidPassword = await this.verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    if (!this.isValidPassword(newPassword)) {
      throw new Error('New password does not meet security requirements');
    }

    const hashedNewPassword = await this.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    // Revoke all refresh tokens for this user
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true }
    });

    // Log password change
    await this.logUserAction(userId, 'CHANGE_PASSWORD', 'auth', null, {});
  }

  // Validate password strength
  private isValidPassword(password: string): boolean {
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return password.length >= minLength && hasUppercase && hasLowercase && hasNumbers && hasSpecialChar;
  }

  // Log user actions for audit trail
  async logUserAction(
    userId: string,
    action: string,
    resource: string,
    resourceId?: string | null,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        ...definedOnly({ resourceId: resourceId ?? undefined, ipAddress, userAgent }),
        // Redacted at the sink rather than at each call site, so no future caller can
        // reintroduce the problem: audit rows previously stored request bodies verbatim,
        // which put account passwords and Wi-Fi pre-shared keys in the table in clear
        // text (finding F-16).
        details: redactSensitive(details) as any,
      }
    });
  }

  // Clean up expired tokens (call this periodically)
  async cleanupExpiredTokens(): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { isRevoked: true }
        ]
      }
    });
  }

  // Get user audit log
  async getUserAuditLog(userId: string, limit = 50): Promise<any[]> {
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            username: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
  }
}
import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { 
  User, 
  CreateUserRequest, 
  LoginRequest, 
  LoginResponse, 
  TokenPayload,
  UserRole,
  ROLE_PERMISSIONS
} from '../types/auth';

const prisma = new PrismaClient();

export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
  private readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
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
        createdBy
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
  async login(loginData: LoginRequest, ipAddress?: string, userAgent?: string): Promise<LoginResponse> {
    const user = await prisma.user.findUnique({
      where: { username: loginData.username }
    });

    if (!user || !user.isActive) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await this.verifyPassword(loginData.password, user.password);
    if (!isValidPassword) {
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
        resourceId,
        details: details as any,
        ipAddress,
        userAgent
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
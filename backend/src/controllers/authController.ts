import { Request, Response } from 'express';
import { AuthService } from '../services/authService';
import prisma from '../db';
import { 
  CreateUserRequest, 
  LoginRequest, 
  RefreshTokenRequest, 
  ChangePasswordRequest,
  ResetPasswordRequest 
} from '../types/auth';


const authService = new AuthService();

// Register new user (admin only)
export const register = async (req: Request, res: Response) => {
  try {
    const userData: CreateUserRequest = req.body;
    const createdBy = req.user?.userId;

    const user = await authService.createUser(userData, createdBy);
    
    res.status(201).json({
      message: 'User created successfully',
      user
    });
  } catch (error) {
    console.error('User registration error:', error);

    if (error instanceof Error) {
      // A duplicate username or email is a conflict, not a malformed request. Every
      // failure was previously reported as 400, so a client could not tell the two
      // apart — the device enrollment path already distinguishes them (P2002 -> 409).
      const isDuplicate = /already exists|duplicate|unique constraint/i.test(error.message);

      res.status(isDuplicate ? 409 : 400).json({
        error: error.message,
        code: isDuplicate ? 'USER_ALREADY_EXISTS' : 'REGISTRATION_FAILED'
      });
      return;
    }
    
    res.status(500).json({ 
      error: 'Failed to create user',
      code: 'INTERNAL_ERROR'
    });
  }
};

// User login
export const login = async (req: Request, res: Response) => {
  try {
    const loginData: LoginRequest = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get('User-Agent');

    const response = await authService.login(loginData, ipAddress, userAgent);
    
    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', response.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Login successful',
      user: response.user,
      token: response.token,
      expiresIn: response.expiresIn
    });
  } catch (error) {
    console.error('Login error:', error);
    
    if (error instanceof Error) {
      res.status(401).json({ 
        error: error.message,
        code: 'LOGIN_FAILED'
      });
      return;
    }
    
    res.status(500).json({ 
      error: 'Login failed',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Refresh access token
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken: tokenFromBody } = req.body as RefreshTokenRequest;
    const tokenFromCookie = req.cookies?.refreshToken;
    
    const refreshToken = tokenFromBody || tokenFromCookie;
    
    if (!refreshToken) {
      res.status(401).json({ 
        error: 'Refresh token required',
        code: 'NO_REFRESH_TOKEN'
      });
      return;
    }

    const tokens = await authService.refreshToken(refreshToken);
    
    // Update refresh token cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Token refreshed successfully',
      token: tokens.token,
      expiresIn: '24h'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    
    res.status(401).json({ 
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
};

// User logout
export const logout = async (req: Request, res: Response) => {
  try {
    const { refreshToken: tokenFromBody } = req.body;
    const tokenFromCookie = req.cookies?.refreshToken;
    
    const refreshToken = tokenFromBody || tokenFromCookie;
    
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    
    // Clear refresh token cookie
    res.clearCookie('refreshToken');
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      error: 'Logout failed',
      code: 'LOGOUT_FAILED'
    });
  }
};

// Get current user profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
      return;
    }

    const user = await authService.getUserById(req.user.userId);
    
    if (!user) {
      res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Failed to get profile',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Update user profile
export const updateProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
      return;
    }

    const { firstName, lastName, email } = req.body;
    
    const updatedUser = await authService.updateUser(
      req.user.userId,
      { firstName, lastName, email },
      req.user.userId
    );

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      error: 'Failed to update profile',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Change password
export const changePassword = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
      return;
    }

    const { currentPassword, newPassword } = req.body as ChangePasswordRequest;
    
    await authService.changePassword(req.user.userId, currentPassword, newPassword);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    
    if (error instanceof Error) {
      res.status(400).json({ 
        error: error.message,
        code: 'PASSWORD_CHANGE_FAILED'
      });
      return;
    }
    
    res.status(500).json({ 
      error: 'Failed to change password',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Get all users (admin only)
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, role, isActive, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Build where clause for filtering
    const whereClause: any = {};
    
    if (role && typeof role === 'string') {
      whereClause.role = role;
    }
    
    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }
    
    if (search && typeof search === 'string') {
      whereClause.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get total count
    const total = await prisma.user.count({ where: whereClause });

    // Get paginated users (exclude password field)
    const users = await prisma.user.findMany({
      where: whereClause,
      skip: offset,
      take: Number(limit),
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const pages = Math.ceil(total / Number(limit));

    res.json({
      data: users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      error: 'Failed to get users',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Get user by ID (admin only)
export const getUserById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = await authService.getUserById(id);
    
    if (!user) {
      res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to get user',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Update user (admin only)
export const updateUser = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updatedBy = req.user?.userId;

    if (!updatedBy) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
      return;
    }

    const updatedUser = await authService.updateUser(id, updates, updatedBy);

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      error: 'Failed to update user',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Delete user (admin only)
export const deleteUser = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const deletedBy = req.user?.userId;

    if (!deletedBy) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
      return;
    }

    await authService.deleteUser(id, deletedBy);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      error: 'Failed to delete user',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Get user audit log
export const getUserAuditLog = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const auditLog = await authService.getUserAuditLog(id, Number(limit));

    res.json({ auditLog });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ 
      error: 'Failed to get audit log',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Validate token (for external services)
export const validateToken = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ 
        valid: false,
        error: 'Invalid token'
      });
      return;
    }

    res.json({
      valid: true,
      user: {
        userId: req.user.userId,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role
      }
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Token validation failed'
    });
  }
};
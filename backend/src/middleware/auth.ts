import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/authService';
import { TokenPayload, UserRole, RATE_LIMITS } from '../types/auth';

const authService = new AuthService();

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// JWT Authentication middleware
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'NO_TOKEN' 
      });
    }

    const decoded = authService.verifyToken(token);
    
    // Verify user still exists and is active
    const user = await authService.getUserById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'User not found or inactive',
        code: 'INVALID_USER' 
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof Error) {
      return res.status(403).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
        message: error.message 
      });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Role-based authorization middleware
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_ROLE',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

// Permission-based authorization middleware
export const requirePermission = (resource: string, action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH' 
      });
    }

    const hasPermission = authService.hasPermission(req.user.role, resource, action);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSION',
        required: { resource, action },
        role: req.user.role
      });
    }

    next();
  };
};

// Optional authentication (for public endpoints that can benefit from user context)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = authService.verifyToken(token);
      const user = await authService.getUserById(decoded.userId);
      
      if (user && user.isActive) {
        req.user = decoded;
      }
    }
    
    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};

// Device authentication middleware (for device endpoints)
export const authenticateDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Device token required',
        code: 'NO_DEVICE_TOKEN' 
      });
    }

    const decoded = authService.verifyToken(token);
    
    // Verify this is a device token
    if (decoded.role !== 'DEVICE') {
      return res.status(403).json({ 
        error: 'Invalid device token',
        code: 'INVALID_DEVICE_TOKEN' 
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ 
      error: 'Invalid or expired device token',
      code: 'INVALID_DEVICE_TOKEN' 
    });
  }
};

// Create role-based rate limiters
export const createRoleBasedRateLimit = () => {
  const limiters: Record<UserRole, any> = {} as any;

  // Create rate limiter for each role
  Object.entries(RATE_LIMITS).forEach(([role, limits]) => {
    limiters[role as UserRole] = rateLimit({
      windowMs: limits.window * 1000, // Convert to milliseconds
      max: limits.requests,
      message: {
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        role,
        limit: limits.requests,
        windowMs: limits.window * 1000
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => {
        // Use user ID for authenticated requests, IP for unauthenticated
        return req.user ? `user:${req.user.userId}` : (req.ip || 'unknown');
      },
      skip: (req: Request) => {
        // Skip rate limiting for super admins
        return req.user?.role === 'SUPER_ADMIN';
      }
    });
  });

  // Return middleware that applies appropriate rate limiter based on user role
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role || 'VIEWER'; // Default to most restrictive
    const rateLimiter = limiters[userRole];
    
    if (rateLimiter) {
      return rateLimiter(req, res, next);
    }
    
    next();
  };
};

// Audit logging middleware
export const auditLog = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(body: any) {
      // Log the action after response is sent
      if (req.user && res.statusCode < 400) {
        authService.logUserAction(
          req.user.userId,
          action,
          resource,
          req.params.id,
          {
            method: req.method,
            url: req.originalUrl,
            body: req.method !== 'GET' ? req.body : undefined,
            statusCode: res.statusCode
          },
          req.ip || 'unknown',
          req.get('User-Agent') || 'unknown'
        ).catch(error => {
          console.error('Failed to log audit action:', error);
        });
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

// Request validation middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  // Validate request size
  const maxSize = 10 * 1024 * 1024; // 10MB
  const contentLength = parseInt(req.get('Content-Length') || '0', 10);
  
  if (contentLength > maxSize) {
    return res.status(413).json({
      error: 'Request entity too large',
      code: 'ENTITY_TOO_LARGE',
      maxSize
    });
  }
  
  next();
};

// IP whitelist middleware (for admin operations)
export const requireWhitelistedIP = (allowedIPs: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || 'unknown';
    
    // Skip in development
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      return res.status(403).json({
        error: 'IP address not allowed',
        code: 'IP_NOT_ALLOWED',
        ip: clientIP
      });
    }
    
    next();
  };
};
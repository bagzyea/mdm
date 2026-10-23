import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import crypto from 'crypto';
import { AuthService } from '../services/authService';
import { TokenPayload, UserRole, RATE_LIMITS } from '../types/auth';

const authService = new AuthService();

// Extend Express Request type to include user
// Request type is declared in types/express.d.ts

// JWT Authentication middleware
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ 
        error: 'Access token required',
        code: 'NO_TOKEN' 
      });
      return;
    }

    const decoded = authService.verifyToken(token);
    
    // Verify user still exists and is active
    const user = await authService.getUserById(decoded.userId);
    if (!user || !user.isActive) {
      res.status(401).json({ 
        error: 'User not found or inactive',
        code: 'INVALID_USER' 
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof Error) {
      res.status(403).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
        message: error.message 
      });
      return;
    }
    res.status(500).json({ error: 'Authentication error' });
    return;
  }
};

// Role-based authorization middleware
export const requireRole = (...allowedRoles: UserRole[]) => {
  // Named (not anonymous) so src/__tests__/routeAuthorization.test.ts can detect this
  // guard when walking the Express layer stack.
  return function requireRoleMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH' 
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_ROLE',
        required: allowedRoles,
        current: req.user.role
      });
      return;
    }

    next();
  };
};

// Permission-based authorization middleware
export const requirePermission = (resource: string, action: string) => {
  // Named (not anonymous) so src/__tests__/routeAuthorization.test.ts can detect this
  // guard when walking the Express layer stack.
  return function requirePermissionMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_AUTH' 
      });
      return;
    }

    const hasPermission = authService.hasPermission(req.user.role as UserRole, resource, action);
    if (!hasPermission) {
      res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSION',
        required: { resource, action },
        role: req.user.role
      });
      return;
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
      res.status(401).json({ 
        error: 'Device token required',
        code: 'NO_DEVICE_TOKEN' 
      });
      return;
    }

    const decoded = authService.verifyToken(token);
    
    // Verify this is a device token
    if (decoded.role !== 'DEVICE') {
      res.status(403).json({ 
        error: 'Invalid device token',
        code: 'INVALID_DEVICE_TOKEN' 
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ 
      error: 'Invalid or expired device token',
      code: 'INVALID_DEVICE_TOKEN' 
    });
    return;
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
        // Use user ID for authenticated requests, IP for unauthenticated (with IPv6 support)
        if (req.user) {
          return `user:${req.user.userId}`;
        }
        return ipKeyGenerator(req.ip || 'unknown');
      },
      skip: (req: Request) => {
        // Skip rate limiting for super admins
        return req.user?.role === 'SUPER_ADMIN';
      }
    });
  });

  // Return middleware that applies appropriate rate limiter based on user role
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req.user?.role as UserRole) || 'VIEWER'; // Default to most restrictive
    const rateLimiter = limiters[userRole as UserRole];
    
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
          // Express types a wildcard param as string | string[]; the audit column takes
          // a single id, so only a plain string is recorded.
          typeof req.params.id === 'string' ? req.params.id : null,
          {
            method: req.method,
            url: req.originalUrl,
            // Redacted by authService.logUserAction before it reaches the database.
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

// The APK upload route enforces its own, larger limit (multer, 500 MB). Applying the
// global cap to it as well meant no app over 10 MB could ever be added to the App Vault.
const OWN_SIZE_LIMIT_ROUTES = new Set(['/api/apk-registry/upload']);

// Request validation middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && OWN_SIZE_LIMIT_ROUTES.has(req.path)) {
    next();
    return;
  }

  // Validate request size
  const maxSize = 10 * 1024 * 1024; // 10MB
  const contentLength = parseInt(req.get('Content-Length') || '0', 10);
  
  if (contentLength > maxSize) {
    res.status(413).json({
      error: 'Request entity too large',
      code: 'ENTITY_TOO_LARGE',
      maxSize
    });
    return;
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
      res.status(403).json({
        error: 'IP address not allowed',
        code: 'IP_NOT_ALLOWED',
        ip: clientIP
      });
      return;
    }
    
    next();
  };
};
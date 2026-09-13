import { authenticateToken } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { Request, Response, NextFunction } from 'express';

jest.mock('../services/authService');

describe('Authentication Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock<NextFunction>;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    // middleware/auth.ts holds a module-private `new AuthService()`, so a mock object
    // built here is never consulted. jest.mock() above automocks the class, and its
    // prototype methods are shared by every instance — including the middleware's — so
    // the prototype is the handle to configure. (The previous jest.doMock() ran after
    // the module under test had already been imported, and did nothing at all.)
    mockAuthService = AuthService.prototype as jest.Mocked<AuthService>;
    mockAuthService.verifyToken.mockReset();
    mockAuthService.getUserById.mockReset();
  });

  describe('authenticateToken', () => {
    it('should reject requests without authorization header', async () => {
      mockReq.headers = {};

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject requests with malformed authorization header', async () => {
      mockReq.headers = { authorization: 'InvalidFormat' };

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject requests with invalid token', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };

      mockAuthService.verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        })
      );
    });

    it('should reject requests with expired token', async () => {
      mockReq.headers = { authorization: 'Bearer expired-token' };

      mockAuthService.verifyToken.mockImplementation(() => {
        throw new Error('Token expired');
      });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN'
        })
      );
    });

    it('should reject if user is not found', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };

      mockAuthService.verifyToken.mockReturnValue({
        userId: 'user-123',
        username: 'testuser',
        role: 'ADMIN',
        email: 'test@example.com'
      } as any);

      mockAuthService.getUserById.mockResolvedValue(null);

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not found or inactive',
        code: 'INVALID_USER'
      });
    });

    it('should reject if user is inactive', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };

      mockAuthService.verifyToken.mockReturnValue({
        userId: 'user-123',
        username: 'testuser',
        role: 'ADMIN',
        email: 'test@example.com'
      } as any);

      mockAuthService.getUserById.mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
        isActive: false
      } as any);

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not found or inactive',
        code: 'INVALID_USER'
      });
    });

    it('should allow valid tokens and active users', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };

      const decodedToken = {
        userId: 'user-123',
        username: 'testuser',
        role: 'ADMIN',
        email: 'test@example.com'
      };

      mockAuthService.verifyToken.mockReturnValue(decodedToken as any);

      mockAuthService.getUserById.mockResolvedValue({
        id: 'user-123',
        username: 'testuser',
        isActive: true
      } as any);

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).user).toEqual(decodedToken);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});

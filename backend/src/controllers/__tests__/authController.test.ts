import request from 'supertest';
import express from 'express';
import { AuthService } from '../../services/authService';
import { login, register } from '../authController';

// Mock AuthService
jest.mock('../../services/authService');

describe('AuthController', () => {
  let app: express.Application;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Create a mock instance of AuthService
    mockAuthService = new AuthService() as jest.Mocked<AuthService>;
    
    // Setup routes for testing
    app.post('/login', login);
    app.post('/register', register);
  });

  describe('POST /login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'USER' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTokens = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900
      };

      // Mock the login method to return successful authentication
      mockAuthService.login = jest.fn().mockResolvedValue({
        user: mockUser,
        tokens: mockTokens
      });

      const response = await request(app)
        .post('/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
    });

    it('should return 400 for missing credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({
          username: 'testuser'
          // Missing password
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 401 for invalid credentials', async () => {
      mockAuthService.login = jest.fn().mockRejectedValue(
        new Error('Invalid credentials')
      );

      const response = await request(app)
        .post('/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'user-456',
        username: 'newuser',
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
        role: 'USER' as const,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthService.createUser = jest.fn().mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/register')
        .send({
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'Password123!',
          firstName: 'New',
          lastName: 'User'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User created successfully');
      expect(response.body).toHaveProperty('user');
    });

    it('should return 400 for invalid user data', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          username: 'nu', // Too short
          email: 'invalid-email',
          password: '123', // Too weak
          firstName: '',
          lastName: ''
        });

      expect(response.status).toBe(400);
    });

    it('should return 409 for duplicate username', async () => {
      mockAuthService.createUser = jest.fn().mockRejectedValue(
        new Error('User already exists')
      );

      const response = await request(app)
        .post('/register')
        .send({
          username: 'existinguser',
          email: 'existing@example.com',
          password: 'Password123!',
          firstName: 'Existing',
          lastName: 'User'
        });

      expect(response.status).toBe(409);
    });
  });
});
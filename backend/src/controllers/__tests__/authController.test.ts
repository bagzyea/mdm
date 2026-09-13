/**
 * Auth controller behaviour.
 *
 * This suite previously built its mock with `new AuthService()` and then assigned
 * methods onto that instance. The controller holds its own module-private
 * `new AuthService()`, so the assignments were never seen: every call fell through to
 * the automock, returned undefined, and the controller reported 401. `jest.mock()`
 * automocks the class, and its prototype methods are shared by every instance, so the
 * prototype is what has to be configured.
 *
 * It also asserted a `{ user, tokens }` response the controller has never returned —
 * it returns `{ message, user, token, expiresIn }` — and mounted the routes without the
 * validation middleware the real router applies, so the "missing credentials" cases
 * could not behave as they do in production.
 */

import request from 'supertest';
import express from 'express';

import { AuthService } from '../../services/authService';
import { login, register } from '../authController';
import { validate } from '../../middleware/validation';
import { loginSchema, registerSchema } from '../../schemas/authSchemas';

jest.mock('../../services/authService');

const mockAuthService = AuthService.prototype as jest.Mocked<AuthService>;

const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'ADMIN' as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthController', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());

    // Mirrors authRoutes: validation runs before the controller, so a malformed body is
    // rejected at the edge rather than reaching the service.
    app.post('/login', validate(loginSchema), login);
    app.post('/register', validate(registerSchema), register);
  });

  describe('POST /login', () => {
    it('returns the user and an access token on success', async () => {
      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        token: 'mock-access-token',
        expiresIn: '15m',
        refreshToken: 'mock-refresh-token',
      } as any);

      const response = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Login successful',
        token: 'mock-access-token',
        expiresIn: '15m',
      });
      expect(response.body.user).toMatchObject({ username: 'testuser' });
    });

    it('sets the refresh token as an httpOnly cookie rather than returning it', async () => {
      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        token: 'mock-access-token',
        expiresIn: '15m',
        refreshToken: 'mock-refresh-token',
      } as any);

      const response = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'password123' });

      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain('refreshToken=');
      expect(cookies.join(';')).toContain('HttpOnly');

      // The refresh token must not also be in the body, where script could read it.
      expect(response.body.refreshToken).toBeUndefined();
    });

    it('rejects a request with no password before reaching the service', async () => {
      const response = await request(app).post('/login').send({ username: 'testuser' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ success: false, message: 'Validation failed' });
      expect(mockAuthService.login).not.toHaveBeenCalled();
    });

    it('answers invalid credentials with 401', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      const response = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'LOGIN_FAILED' });
    });

    it('does not echo the submitted password in any error response', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      const response = await request(app)
        .post('/login')
        .send({ username: 'testuser', password: 'sup3r-s3cret-value' });

      expect(JSON.stringify(response.body)).not.toContain('sup3r-s3cret-value');
    });
  });

  describe('POST /register', () => {
    const validRegistration = {
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      role: 'OPERATOR',
    };

    it('creates a user and returns it', async () => {
      mockAuthService.createUser.mockResolvedValue({ ...mockUser, username: 'newuser' } as any);

      const response = await request(app).post('/register').send(validRegistration);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ message: 'User created successfully' });
      expect(response.body.user).toMatchObject({ username: 'newuser' });
    });

    it('rejects invalid registration data before reaching the service', async () => {
      const response = await request(app).post('/register').send({
        username: 'nu',
        email: 'invalid-email',
        password: '123',
        firstName: '',
        lastName: '',
      });

      expect(response.status).toBe(400);
      expect(mockAuthService.createUser).not.toHaveBeenCalled();
    });

    it('answers a duplicate username with 409, not 400', async () => {
      // Every failure used to be reported as 400, so a client could not distinguish a
      // malformed request from a username that was already taken.
      mockAuthService.createUser.mockRejectedValue(new Error('User already exists'));

      const response = await request(app).post('/register').send(validRegistration);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'USER_ALREADY_EXISTS' });
    });

    it('still answers an unexpected failure with 400', async () => {
      mockAuthService.createUser.mockRejectedValue(new Error('database unavailable'));

      const response = await request(app).post('/register').send(validRegistration);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'REGISTRATION_FAILED' });
    });

    it('never returns a password hash to the caller', async () => {
      mockAuthService.createUser.mockResolvedValue({
        ...mockUser,
        username: 'newuser',
      } as any);

      const response = await request(app).post('/register').send(validRegistration);

      expect(JSON.stringify(response.body)).not.toContain('password');
    });
  });
});

import { loginSchema, registerSchema, refreshTokenSchema, userIdSchema } from '../authSchemas';

describe('Auth Schemas', () => {
  describe('loginSchema', () => {
    it('should validate valid login data', () => {
      const validData = {
        username: 'testuser',
        password: 'password123'
      };

      const { error, value } = loginSchema.validate(validData);
      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it('should reject short username', () => {
      const invalidData = {
        username: 'ab',
        password: 'password123'
      };

      const { error } = loginSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.message).toContain('at least 3 characters');
    });

    it('should reject short password', () => {
      const invalidData = {
        username: 'testuser',
        password: '123'
      };

      const { error } = loginSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.message).toContain('at least 6 characters');
    });

    it('should reject non-alphanumeric username', () => {
      const invalidData = {
        username: 'test@user',
        password: 'password123'
      };

      const { error } = loginSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('alphanumeric characters');
    });
  });

  describe('registerSchema', () => {
    it('should validate valid registration data', () => {
      const validData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const { error, value } = registerSchema.validate(validData);
      expect(error).toBeUndefined();
      expect(value).toMatchObject(validData);
      // Least privilege. 'USER' was the old default and is not a role the system
      // defines — ROLE_PERMISSIONS has no entry for it.
      expect(value.role).toBe('VIEWER');
    });

    it('should validate with custom role', () => {
      const validData = {
        username: 'adminuser',
        email: 'admin@example.com',
        password: 'AdminPassword123!',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN'
      };

      const { error, value } = registerSchema.validate(validData);
      expect(error).toBeUndefined();
      expect(value.role).toBe('ADMIN');
    });

    it('should reject weak password', () => {
      const invalidData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password', // Missing uppercase, number, special char
        firstName: 'Test',
        lastName: 'User'
      };

      const { error } = registerSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('lowercase letter, one uppercase letter');
    });

    it('should reject invalid email', () => {
      const invalidData = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User'
      };

      const { error } = registerSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('valid email');
    });

    it('should reject invalid role', () => {
      const invalidData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'INVALID_ROLE'
      };

      const { error } = registerSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('ADMIN');
    });
  });

  describe('refreshTokenSchema', () => {
    it('should validate valid refresh token', () => {
      const validData = {
        refreshToken: 'valid-refresh-token-string'
      };

      const { error, value } = refreshTokenSchema.validate(validData);
      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it('should reject missing refresh token', () => {
      const invalidData = {};

      const { error } = refreshTokenSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('required');
    });
  });

  describe('userIdSchema', () => {
    it('should validate valid UUID', () => {
      const validData = {
        id: '123e4567-e89b-12d3-a456-426614174000'
      };

      const { error, value } = userIdSchema.validate(validData);
      expect(error).toBeUndefined();
      expect(value).toEqual(validData);
    });

    it('should reject invalid UUID', () => {
      const invalidData = {
        id: 'not-a-uuid'
      };

      const { error } = userIdSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('valid UUID');
    });

    it('should reject missing ID', () => {
      const invalidData = {};

      const { error } = userIdSchema.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details[0].message).toContain('required');
    });
  });
});
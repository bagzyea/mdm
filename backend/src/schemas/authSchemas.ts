const Joi = require('joi');

// Login validation schema
export const loginSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.alphanum': 'Username must contain only alphanumeric characters',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must not exceed 50 characters',
      'any.required': 'Username is required'
    }),
  
  password: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      'string.min': 'Password must be at least 6 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'any.required': 'Password is required'
    })
});

export const registerSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(50)
    .required(),
  
  email: Joi.string()
    .email()
    .max(100)
    .required(),
  
  password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    }),
  
  firstName: Joi.string()
    .min(1)
    .max(50)
    .required(),
  
  lastName: Joi.string()
    .min(1)
    .max(50)
    .required(),
  
  role: Joi.string()
    // Must match the UserRole union and ROLE_PERMISSIONS in src/types/auth.ts.
    // This previously allowed 'MANAGER' and 'USER', which the system does not define —
    // so a user could be created with a role holding no permissions at all — while
    // rejecting OPERATOR and VIEWER, which meant they could not be registered via the
    // API. DEVICE is deliberately excluded: device identities come from enrollment.
    .valid('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER')
    // Least privilege by default. The previous default was 'USER', a role the system
    // does not define, so an omitted role produced an account ROLE_PERMISSIONS has no
    // entry for.
    .default('VIEWER')
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required'
    })
});

export const userIdSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'User ID must be a valid UUID',
      'any.required': 'User ID is required'
    })
});
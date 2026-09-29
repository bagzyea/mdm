const Joi = require('joi');

// Login validation schema
// Sign-in accepts an MDM username, an email address, or a directory login
// (name, name@domain or DOMAIN\\name). This was alphanumeric-only, which refused every
// email address — including the admin account's own — before the password was checked.
export const loginSchema = Joi.object({
  username: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9._@\\-]+$/)
    .min(3)
    .max(254)
    .required()
    .messages({
      'string.pattern.base': 'Enter a username, email address or domain login',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must not exceed 254 characters',
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
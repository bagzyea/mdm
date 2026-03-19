import Joi from 'joi';

export const deviceIdSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Device ID must be a valid UUID',
      'any.required': 'Device ID is required'
    })
});

export const registerDeviceSchema = Joi.object({
  deviceId: Joi.string()
    .min(10)
    .max(100)
    .required(),
  
  deviceType: Joi.string()
    .valid('ANDROID', 'IOS', 'WINDOWS', 'MACOS', 'LINUX')
    .required(),
  
  osVersion: Joi.string()
    .max(50)
    .required(),
  
  model: Joi.string()
    .max(100)
    .required(),
  
  manufacturer: Joi.string()
    .max(100)
    .required(),
  
  serialNumber: Joi.string()
    .max(100),
  
  imei: Joi.string()
    .pattern(/^[0-9]{15}$/)
    .messages({
      'string.pattern.base': 'IMEI must be 15 digits'
    }),
  
  macAddress: Joi.string()
    .pattern(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
    .messages({
      'string.pattern.base': 'MAC address must be in valid format (XX:XX:XX:XX:XX:XX)'
    }),
  
  enrollmentToken: Joi.string()
    .required()
});

export const updateDeviceSchema = Joi.object({
  name: Joi.string()
    .max(100),
  
  location: Joi.object({
    latitude: Joi.number()
      .min(-90)
      .max(90),
    longitude: Joi.number()
      .min(-180)
      .max(180),
    address: Joi.string()
      .max(200)
  }),
  
  status: Joi.string()
    .valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOST', 'RETIRED'),
  
  assignedUserId: Joi.string()
    .uuid()
    .allow(null)
}).min(1);

export const deviceQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  
  status: Joi.string()
    .valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOST', 'RETIRED'),
  
  deviceType: Joi.string()
    .valid('ANDROID', 'IOS', 'WINDOWS', 'MACOS', 'LINUX'),
  
  search: Joi.string()
    .max(100)
    .allow(''),
  
  sortBy: Joi.string()
    .valid('name', 'lastSeen', 'createdAt', 'status')
    .default('lastSeen'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
});
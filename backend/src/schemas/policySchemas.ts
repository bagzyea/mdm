import Joi from 'joi';

export const createPolicySchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Policy name is required',
      'string.max': 'Policy name must not exceed 100 characters'
    }),
  
  description: Joi.string()
    .max(500)
    .allow(''),
  
  type: Joi.string()
    .valid('SECURITY', 'NETWORK', 'APPLICATION', 'COMPLIANCE', 'HARDWARE', 'SYSTEM')
    .required(),
  
  settings: Joi.object({
    // Security settings
    passwordRequired: Joi.boolean(),
    passwordMinLength: Joi.number()
      .integer()
      .min(4)
      .max(20),
    passwordComplexity: Joi.string()
      .valid('LOW', 'MEDIUM', 'HIGH'),
    biometricsRequired: Joi.boolean(),
    screenLockTimeout: Joi.number()
      .integer()
      .min(0)
      .max(3600), // Max 1 hour
    
    // Device settings
    cameraDisabled: Joi.boolean(),
    bluetoothDisabled: Joi.boolean(),
    wifiDisabled: Joi.boolean(),
    usbDebuggingDisabled: Joi.boolean(),
    installUnknownApps: Joi.boolean(),
    
    // Network settings
    allowedWifiNetworks: Joi.array()
      .items(Joi.string().max(100)),
    blockedWifiNetworks: Joi.array()
      .items(Joi.string().max(100)),
    vpnRequired: Joi.boolean(),
    
    // Application settings
    allowedApps: Joi.array()
      .items(Joi.string().max(100)),
    blockedApps: Joi.array()
      .items(Joi.string().max(100)),
    appInstallationBlocked: Joi.boolean()
  }),
  
  targetDeviceTypes: Joi.array()
    .items(Joi.string().valid('ANDROID', 'IOS', 'WINDOWS', 'MACOS', 'LINUX'))
    .min(1)
    .required(),
  
  priority: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(5),
  
  isActive: Joi.boolean()
    .default(true)
});

export const updatePolicySchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100),
  
  description: Joi.string()
    .max(500)
    .allow(''),
  
  settings: Joi.object().unknown(true), // Allow any settings structure for updates
  
  priority: Joi.number()
    .integer()
    .min(1)
    .max(10),
  
  isActive: Joi.boolean()
}).min(1);

export const policyQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  
  type: Joi.string()
    .valid('SECURITY', 'NETWORK', 'APPLICATION', 'COMPLIANCE', 'HARDWARE', 'SYSTEM'),
  
  isActive: Joi.boolean(),
  
  search: Joi.string()
    .max(100)
    .allow(''),
  
  sortBy: Joi.string()
    .valid('name', 'createdAt', 'priority', 'type')
    .default('createdAt'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
});
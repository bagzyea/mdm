import Joi from 'joi';

/**
 * Request validation for the device API (finding F-05).
 *
 * These schemas previously had no importers, and could not have been wired up as they
 * stood: `deviceIdSchema` required a UUID while device identifiers are Prisma cuids and
 * agent-supplied strings, `registerDeviceSchema` expected a flat body with a required
 * `enrollmentToken` while enrollment actually accepts `{ deviceInfo, enrollmentCode,
 * organizationId }`, and `updateDeviceSchema` described fields (`name`,
 * `assignedUserId`) that the controller does not read. They are rewritten here against
 * the contract the code actually implements.
 */

/** Matches the DeviceStatus enum in prisma/schema.prisma. */
export const DEVICE_STATUSES = [
  'ENROLLED',
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'WIPED',
] as const;

/**
 * Device identifiers are agent-generated strings, not UUIDs. Constrained to characters
 * that are safe in a path segment and in a Socket.IO room name.
 */
const deviceIdentifier = Joi.string()
  .min(1)
  .max(100)
  .pattern(/^[A-Za-z0-9._:-]+$/)
  .messages({
    'string.pattern.base':
      'deviceId may contain only letters, digits, dot, underscore, colon and hyphen',
  });

export const deviceIdParamSchema = Joi.object({
  deviceId: deviceIdentifier.required(),
});

const locationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracy: Joi.number().min(0),
  altitude: Joi.number(),
  provider: Joi.string().max(50),
  timestamp: Joi.alternatives().try(Joi.date().iso(), Joi.number()),
  address: Joi.string().max(200),
}).unknown(true);

const networkInfoSchema = Joi.object({
  connectionType: Joi.string().max(50),
  ssid: Joi.string().max(32),
  carrier: Joi.string().max(100),
  signalStrength: Joi.number(),
  ipAddress: Joi.string().max(64),
}).unknown(true);

export const updateDeviceStatusSchema = Joi.object({
  status: Joi.string().valid(...DEVICE_STATUSES),
  location: locationSchema,
  batteryLevel: Joi.number().integer().min(0).max(100),
  isCharging: Joi.boolean(),
  networkInfo: networkInfoSchema,
})
  .min(1)
  .messages({ 'object.min': 'At least one field must be provided' });

export const deviceHeartbeatSchema = Joi.object({
  batteryLevel: Joi.number().integer().min(0).max(100),
  isCharging: Joi.boolean(),
  location: locationSchema,
  networkInfo: networkInfoSchema,
  systemHealth: Joi.object().unknown(true),
  storageInfo: Joi.object({
    total: Joi.number().min(0),
    available: Joi.number().min(0),
  }).unknown(true),
  memoryInfo: Joi.object({
    total: Joi.number().min(0),
    available: Joi.number().min(0),
  }).unknown(true),
  appUsage: Joi.any(),
}).unknown(true);

/**
 * Body of POST /api/devices/:deviceId/command — a single command for one device, as
 * distinct from the fleet-wide POST /api/commands.
 */
export const sendDeviceCommandSchema = Joi.object({
  command: Joi.string().min(1).max(64).required(),
  parameters: Joi.object().unknown(true),
});

export const deviceAnalyticsSchema = Joi.object({
  batteryLevel: Joi.number().integer().min(0).max(100),
  isCharging: Joi.boolean(),
  systemHealth: Joi.object().unknown(true),
  appUsageStats: Joi.any(),
  networkInfo: networkInfoSchema,
}).unknown(true);

/**
 * Query parameters for GET /api/devices. Defaults match the controller's own, so
 * wiring this changes no behaviour for existing callers — it only bounds `limit`,
 * which was previously unbounded and could be used to request the entire fleet.
 */
export const deviceQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(10),
  status: Joi.string().valid(...DEVICE_STATUSES),
  manufacturer: Joi.string().max(100),
  search: Joi.string().max(100).allow(''),
}).unknown(true);

import Joi from 'joi';

/**
 * Request validation for the command API (finding F-05).
 *
 * `validate()` and the Joi schemas existed but were wired to `authRoutes` only —
 * `deviceSchemas.ts` and `policySchemas.ts` had no importers at all. Everywhere else
 * `req.body` went straight into Prisma, and command `parameters` are shipped to tablets
 * and executed there, so a malformed or hostile payload reached devices unchecked.
 */

/**
 * Every command the agent understands, from src/types/commands.ts. Listing them
 * explicitly means an unrecognised command is rejected at the edge rather than being
 * written to the queue and failing on the device.
 */
export const COMMAND_TYPES = [
  'LOCK_DEVICE',
  'UNLOCK_DEVICE',
  'WIPE_DEVICE',
  'REBOOT_DEVICE',
  'LOCATE_DEVICE',
  'RING_DEVICE',
  'INSTALL_APP',
  'UNINSTALL_APP',
  'APPLY_POLICY',
  'REMOVE_POLICY',
  'UPDATE_POLICY',
  'GET_DEVICE_INFO',
  'SET_KIOSK_MODE',
  'EXIT_KIOSK_MODE',
  'SET_WIFI_CONFIG',
  'CLEAR_PASSCODE',
  'ENABLE_LOST_MODE',
  'DISABLE_LOST_MODE',
  'TAKE_SCREENSHOT',
  'GET_APP_LIST',
  'SYNC_SETTINGS',
  'PROVISION_DEVICE',
] as const;

/**
 * Command parameters. Known fields are typed; the object still permits additional keys
 * because several commands carry provisioning payloads whose shape lives in the
 * provisioning profile rather than here. The point of this schema is to constrain the
 * fields the device actually acts on, and to bound the payload.
 */
const commandParametersSchema = Joi.object({
  // Lock / lost mode
  lockMessage: Joi.string().max(500),
  lockPhoneNumber: Joi.string().max(50),

  // App management
  packageName: Joi.string()
    .max(255)
    .pattern(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/)
    .messages({
      'string.pattern.base': 'packageName must be a valid Android package name',
    }),
  appUrl: Joi.string().uri({ scheme: ['http', 'https'] }).max(2048),
  appName: Joi.string().max(255),

  // Policy management
  policyId: Joi.string().max(100),

  // Wi-Fi configuration
  ssid: Joi.string().max(32),
  password: Joi.string().max(63),
  security: Joi.string().valid('WPA', 'WPA2', 'WPA3', 'OPEN'),

  // Kiosk mode
  kioskPackages: Joi.array().items(Joi.string().max(255)).max(50),

  // Location
  enableHighAccuracy: Joi.boolean(),
}).unknown(true);

export const createCommandSchema = Joi.object({
  deviceIds: Joi.array()
    .items(Joi.string().min(1).max(100))
    .min(1)
    .max(5000)
    .required()
    .messages({
      'array.min': 'At least one device must be targeted',
      'any.required': 'deviceIds is required',
    }),

  command: Joi.string()
    .valid(...COMMAND_TYPES)
    .required(),

  parameters: commandParametersSchema,

  priority: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'URGENT'),

  // Accepted by the API but currently discarded — there are no database columns behind
  // them and a scheduled command fires immediately (finding F-20). Validated here so
  // that when the columns land, the wire format does not have to change.
  executeAt: Joi.date().iso(),
  expiresAt: Joi.date().iso().greater(Joi.ref('executeAt')),
});

export const updateCommandResultSchema = Joi.object({
  result: Joi.object({
    success: Joi.boolean(),
    data: Joi.any(),
    error: Joi.string().max(2000),
    timestamp: Joi.date().iso(),
  })
    .unknown(true)
    .required(),

  status: Joi.string().valid('PENDING', 'SENT', 'EXECUTED', 'FAILED', 'CANCELLED'),
});

export const bulkCommandSchema = Joi.object({
  operation: Joi.string().valid('cancel', 'retry').required(),

  commandIds: Joi.array()
    .items(Joi.string().min(1).max(100))
    .min(1)
    .max(1000)
    .required(),
});

export const commandIdParamSchema = Joi.object({
  id: Joi.string().min(1).max(100).required(),
});

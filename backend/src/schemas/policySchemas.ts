import Joi from 'joi';

/**
 * Request validation for the policy API (finding F-05).
 *
 * These schemas previously had no importers, and could not have been wired up as they
 * stood: they validated a `settings` object, while both the controller and the Prisma
 * model use `rules`. Every valid policy would have been rejected. They are rewritten
 * here against the contract the code actually implements.
 */

export const POLICY_TYPES = [
  'SECURITY',
  'NETWORK',
  'APPLICATION',
  'COMPLIANCE',
  'HARDWARE',
  'SYSTEM',
] as const;

/**
 * `rules` is a free-form JSON column that is shipped to devices and executed by the
 * agent's PolicyEngine, so its keys cannot be enumerated here without breaking existing
 * policies. What this does enforce is that it is a non-empty object rather than a
 * string, array or null, and that it is bounded — the type-specific checks in
 * `validatePolicyRules()` run after this.
 */
const policyRulesSchema = Joi.object()
  .min(1)
  .max(200)
  .unknown(true)
  .required()
  .messages({
    'object.base': 'rules must be an object',
    'object.min': 'rules must contain at least one setting',
    'object.max': 'rules contains too many settings',
    'any.required': 'rules is required',
  });

export const createPolicySchema = Joi.object({
  name: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'Policy name is required',
    'string.max': 'Policy name must not exceed 100 characters',
  }),

  // Required and non-nullable in the Prisma model.
  description: Joi.string().max(500).allow('').required(),

  type: Joi.string()
    .valid(...POLICY_TYPES)
    .required(),

  rules: policyRulesSchema,

  targetDevices: Joi.array().items(Joi.string().min(1).max(100)).max(5000).default([]),

  priority: Joi.number().integer().min(0).max(1000).default(0),

  isActive: Joi.boolean().default(true),
});

export const updatePolicySchema = Joi.object({
  name: Joi.string().min(1).max(100),
  description: Joi.string().max(500).allow(''),
  type: Joi.string().valid(...POLICY_TYPES),
  rules: policyRulesSchema.optional(),
  targetDevices: Joi.array().items(Joi.string().min(1).max(100)).max(5000),
  priority: Joi.number().integer().min(0).max(1000),
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ 'object.min': 'At least one field must be provided' });

export const applyPolicySchema = Joi.object({
  deviceIds: Joi.array()
    .items(Joi.string().min(1).max(100))
    .min(1)
    .max(5000)
    .required(),
});

/**
 * Policy IDs are Prisma cuids, not UUIDs. The previous schema required
 * `Joi.string().uuid()`, which would have rejected every real identifier.
 */
export const policyIdParamSchema = Joi.object({
  id: Joi.string().min(1).max(100).required(),
});

import * as crypto from 'crypto';

/**
 * Centralised, fail-fast configuration.
 *
 * Every secret the system signs or encrypts with is resolved here exactly once,
 * and the process refuses to start if any of them is missing or weak. Previously
 * three modules each read `process.env.JWT_SECRET` independently and each fell
 * back to the literal `'fallback-secret-key'`, so a missing env var silently
 * downgraded the system to a secret published in the repository — and a partial
 * config could split the trust domain between admin tokens and device tokens.
 */

/** Minimum acceptable length, in bytes, for any signing or encryption secret. */
const MIN_SECRET_BYTES = 32;

/**
 * Secrets that have appeared in this repository, its docs or its examples.
 * Rejected outright regardless of length.
 */
const BANNED_SECRETS = new Set([
  'fallback-secret-key',
  'your-super-secret-jwt-key-change-this-in-production',
  'changeme',
  'change-me',
  'secret',
  'password',
]);

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(
      'Invalid configuration — refusing to start:\n' +
        problems.map((p) => `  • ${p}`).join('\n') +
        '\n\nGenerate a strong secret with:  openssl rand -base64 48\n'
    );
    this.name = 'ConfigError';
  }
}

const problems: string[] = [];

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

/**
 * Read a secret from the environment, recording a problem rather than throwing,
 * so that a misconfigured deployment reports every fault at once instead of
 * one per restart.
 */
function readSecret(name: string, { required }: { required: boolean }): string | undefined {
  const raw = process.env[name];

  if (!raw || raw.trim() === '') {
    if (required) {
      problems.push(`${name} is not set`);
    }
    return undefined;
  }

  const value = raw.trim();

  if (BANNED_SECRETS.has(value.toLowerCase())) {
    problems.push(`${name} is set to a well-known placeholder value and must be replaced`);
    return undefined;
  }

  if (Buffer.byteLength(value, 'utf8') < MIN_SECRET_BYTES) {
    problems.push(
      `${name} must be at least ${MIN_SECRET_BYTES} bytes (got ${Buffer.byteLength(value, 'utf8')})`
    );
    return undefined;
  }

  return value;
}

const jwtSecret = readSecret('JWT_SECRET', { required: true });

/**
 * Key used to encrypt sensitive data at rest — certificate private keys, most
 * importantly. Required in production. Outside production it is derived from
 * JWT_SECRET so local development works without a second secret, but the
 * derivation is domain-separated so the encryption key is never equal to the
 * signing secret.
 */
const encryptionKeyRaw = readSecret('ENCRYPTION_KEY', { required: isProduction });

function resolveEncryptionKey(): Buffer {
  if (encryptionKeyRaw) {
    // A 64-char hex string is treated as a raw 32-byte key; anything else is hashed to 32 bytes.
    return /^[0-9a-fA-F]{64}$/.test(encryptionKeyRaw)
      ? Buffer.from(encryptionKeyRaw, 'hex')
      : crypto.createHash('sha256').update(encryptionKeyRaw).digest();
  }

  if (isProduction || !jwtSecret) {
    // Unreachable once `problems` is non-empty — validate() throws first.
    return Buffer.alloc(32);
  }

  if (!isTest) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] ENCRYPTION_KEY is not set; deriving a development key from JWT_SECRET. ' +
        'Data encrypted now will be unreadable once ENCRYPTION_KEY is set. Never do this in production.'
    );
  }

  return crypto.createHash('sha256').update(`mdm:encryption-key:v1:${jwtSecret}`).digest();
}

/**
 * Throws if the environment is not fit to run against. Call once at boot,
 * before the HTTP server starts listening.
 */
export function validateConfig(): void {
  if (problems.length > 0) {
    throw new ConfigError(problems);
  }
}

validateConfig();

export const config = {
  nodeEnv,
  isProduction,
  isTest,

  /** HS256 signing secret for every JWT the system issues — admin and device alike. */
  jwtSecret: jwtSecret as string,
  jwtIssuer: 'mdm-system',
  jwtAudience: 'mdm-users',

  /** Admin session token lifetime. */
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',

  /**
   * Device access token lifetime, now configurable rather than hardcoded.
   *
   * The default remains 365d to match current device behaviour — shortening it
   * without a refresh-token flow would strand the fleet the moment tokens
   * expired. Once enrollment issues a refresh token that is re-checked against
   * device status (findings F-02 / F-13), this default should drop to '24h'.
   * Operators who can re-enroll can shorten it today via DEVICE_TOKEN_EXPIRES_IN.
   */
  deviceTokenExpiresIn: process.env.DEVICE_TOKEN_EXPIRES_IN ?? '365d',

  /** 32-byte AES-256-GCM key for data at rest. */
  encryptionKey: resolveEncryptionKey(),
} as const;

export default config;

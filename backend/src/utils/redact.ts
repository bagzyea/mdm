/**
 * Redaction of sensitive values before they are persisted or logged (finding F-16).
 *
 * `auditLog()` wrote `req.body` into `AuditLog.details` for every non-GET request, and
 * it is applied to `/change-password` — so account passwords were stored in the audit
 * table in clear text, alongside Wi-Fi pre-shared keys from policy and command payloads
 * and bearer tokens from refresh calls.
 *
 * An audit table is exactly the wrong place for credentials: it is long-lived by design,
 * widely readable for compliance purposes, and will be exported to a SIEM.
 */

/** Placeholder written in place of a redacted value. */
export const REDACTED = '[REDACTED]';

/**
 * Substrings that mark a key as sensitive, matched case-insensitively against the key
 * with separators removed — so `wifi_password`, `wifiPassword` and `WIFI-PASSWORD` all
 * match `password`.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'apikey',
  'privatekey',
  'credential',
  'authorization',
  'psk',
  'presharedkey',
  'otp',
  'mfacode',
  'securityanswer',
  // An enrollment code authorises a device to join the fleet — a credential, and
  // single-use only once redeemed, so it must not persist in logs or event rows.
  'enrollmentcode',
];

/**
 * Keys that contain a sensitive substring but are not themselves secret, and are useful
 * to keep in an audit record.
 */
const ALLOWED_KEYS = new Set([
  'tokenexpiry',
  'tokenexpiresat',
  'tokentype',
  'passwordchangedat',
  'passwordexpiresat',
  'requirespasswordchange',
  'hastoken',
]);

/** Depth cap, so a cyclic or pathological structure cannot hang the request. */
const MAX_DEPTH = 8;

/** Cap on array elements retained, to keep audit rows bounded. */
const MAX_ARRAY_LENGTH = 100;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  const normalised = normaliseKey(key);
  if (ALLOWED_KEYS.has(normalised)) return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalised.includes(pattern));
}

/**
 * Deep-copy a value with every sensitive field replaced by a placeholder.
 *
 * Redaction is driven by key name rather than by value inspection: a value-based
 * heuristic cannot reliably tell a password from any other short string, whereas the
 * key is the thing the caller controls and names.
 */
export function redactSensitive<T = unknown>(value: T, depth = 0): T {
  if (value === null || value === undefined) return value;

  if (depth >= MAX_DEPTH) {
    return '[TRUNCATED]' as unknown as T;
  }

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_LENGTH);
    const redacted = limited.map((entry) => redactSensitive(entry, depth + 1));

    if (value.length > MAX_ARRAY_LENGTH) {
      redacted.push(`[${value.length - MAX_ARRAY_LENGTH} more items truncated]`);
    }
    return redacted as unknown as T;
  }

  // Dates, Buffers and other non-plain objects are passed through rather than walked.
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return REDACTED as unknown as T;

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(source)) {
      result[key] = isSensitiveKey(key)
        ? REDACTED
        : redactSensitive(source[key], depth + 1);
    }

    return result as unknown as T;
  }

  return value;
}

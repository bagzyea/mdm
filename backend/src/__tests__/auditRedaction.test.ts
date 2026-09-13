/**
 * Audit-log redaction (finding F-16).
 *
 * `auditLog()` wrote req.body into AuditLog.details for every non-GET request and is
 * applied to /change-password, so account passwords were stored in the audit table in
 * clear text — along with Wi-Fi pre-shared keys carried in policy and command payloads.
 */

import { redactSensitive, isSensitiveKey, REDACTED } from '../utils/redact';

describe('isSensitiveKey', () => {
  it('recognises the field names that actually reach the audit table', () => {
    const sensitive = [
      'password',
      'currentPassword',
      'newPassword',
      'confirmPassword',
      'wifiPassword',
      'wifi_password',
      'WIFI-PASSWORD',
      'passphrase',
      'psk',
      'preSharedKey',
      'token',
      'refreshToken',
      'deviceToken',
      'apiKey',
      'privateKey',
      'clientSecret',
      'authorization',
      'otp',
      'mfaCode',
    ];

    for (const key of sensitive) {
      expect({ key, sensitive: isSensitiveKey(key) }).toEqual({ key, sensitive: true });
    }
  });

  it('keeps metadata that merely mentions a credential', () => {
    // These are useful in an audit record and disclose nothing.
    for (const key of ['tokenExpiry', 'tokenType', 'passwordChangedAt', 'hasToken']) {
      expect({ key, sensitive: isSensitiveKey(key) }).toEqual({ key, sensitive: false });
    }
  });

  it('does not over-match ordinary fields', () => {
    for (const key of ['username', 'email', 'deviceId', 'status', 'ipAddress', 'action']) {
      expect({ key, sensitive: isSensitiveKey(key) }).toEqual({ key, sensitive: false });
    }
  });
});

describe('redactSensitive', () => {
  it('redacts a change-password body — the case that was actually being stored', () => {
    const body = { currentPassword: 'hunter2', newPassword: 'correct horse battery' };

    expect(redactSensitive(body)).toEqual({
      currentPassword: REDACTED,
      newPassword: REDACTED,
    });
  });

  it('redacts a Wi-Fi payload while keeping the operationally useful fields', () => {
    const command = {
      command: 'CONFIGURE_WIFI',
      parameters: { ssid: 'UBOS-Field', psk: 's3cret-psk', security: 'WPA2' },
    };

    expect(redactSensitive(command)).toEqual({
      command: 'CONFIGURE_WIFI',
      parameters: { ssid: 'UBOS-Field', psk: REDACTED, security: 'WPA2' },
    });
  });

  it('redacts nested and array-held secrets', () => {
    const input = {
      user: { name: 'agaba', credentials: { password: 'p', apiKey: 'k' } },
      devices: [{ deviceId: 'd1', deviceToken: 't1' }, { deviceId: 'd2', deviceToken: 't2' }],
    };

    expect(redactSensitive(input)).toEqual({
      user: { name: 'agaba', credentials: REDACTED },
      devices: [
        { deviceId: 'd1', deviceToken: REDACTED },
        { deviceId: 'd2', deviceToken: REDACTED },
      ],
    });
  });

  it('leaves a clean payload untouched', () => {
    const input = { method: 'PUT', url: '/api/devices/d1/status', statusCode: 200 };
    expect(redactSensitive(input)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = { password: 'hunter2', keep: 1 };
    const copy = { ...input };

    redactSensitive(input);
    expect(input).toEqual(copy);
  });

  it('passes through null and undefined', () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  it('preserves Date values rather than walking them', () => {
    const now = new Date();
    expect(redactSensitive({ at: now })).toEqual({ at: now });
  });

  it('redacts Buffers wholesale', () => {
    expect(redactSensitive({ blob: Buffer.from('secret') })).toEqual({ blob: REDACTED });
  });

  it('bounds a deeply nested structure instead of recursing without limit', () => {
    let deep: any = { value: 'bottom' };
    for (let i = 0; i < 30; i++) deep = { nested: deep };

    // Must terminate and produce something serialisable.
    expect(() => JSON.stringify(redactSensitive(deep))).not.toThrow();
    expect(JSON.stringify(redactSensitive(deep))).toContain('[TRUNCATED]');
  });

  it('bounds a very large array so audit rows stay a sane size', () => {
    const input = { items: Array.from({ length: 250 }, (_, i) => ({ id: i })) };
    const result = redactSensitive(input) as { items: unknown[] };

    expect(result.items.length).toBe(101);
    expect(result.items[100]).toBe('[150 more items truncated]');
  });
});

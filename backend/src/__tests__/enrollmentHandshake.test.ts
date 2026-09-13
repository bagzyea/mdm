/**
 * Enrollment handshake and device credential lifecycle (findings F-02, F-13).
 *
 * POST /api/devices/enroll accepted any deviceId the caller invented and returned a
 * 365-day JWT with role DEVICE. The enrollment code was optional and validated only for
 * length >= 4, and generated codes were never persisted, so they could not be validated,
 * expired or revoked. Posting an existing deviceId took the update branch and minted a
 * fresh credential for that device. Device tokens were never checked against device
 * state, so a retired or wiped tablet kept a valid credential for a year.
 *
 * Prisma is mocked so these run without a database. The store below behaves like the
 * real tables for the operations under test, including the conditional updateMany that
 * makes single-use codes safe against concurrent redemption.
 */

interface TokenRow {
  id: string;
  tokenHash: string;
  createdBy: string;
  boundSerial: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy?: string | null;
  lastUsedBy?: string | null;
  lastUsedAt?: Date | null;
  notes?: string | null;
}

interface RefreshRow {
  id: string;
  tokenHash: string;
  deviceId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy?: string | null;
  lastUsedAt?: Date | null;
}

const store = {
  enrollmentTokens: [] as TokenRow[],
  refreshTokens: [] as RefreshRow[],
  devices: [] as { deviceId: string; status: string; isRetired: boolean }[],
};

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

/** Minimal evaluation of the Prisma `where` shapes this service actually uses. */
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, condition]) => {
    const value = row[key];

    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const c = condition as any;
      if ('lt' in c) return value < c.lt;
      if ('gt' in c) return value > c.gt;
      if ('equals' in c) return value === c.equals;
      return false;
    }
    return value === condition;
  });
}

function applyData(row: any, data: any): void {
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value && typeof value === 'object' && 'increment' in (value as any)) {
      row[key] = (row[key] ?? 0) + (value as any).increment;
    } else {
      row[key] = value;
    }
  }
}

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    enrollmentToken: {
      create: jest.fn(async ({ data }: any) => {
        const row: TokenRow = {
          id: nextId(),
          useCount: 0,
          revokedAt: null,
          boundSerial: null,
          maxUses: 1,
          ...data,
        };
        store.enrollmentTokens.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        store.enrollmentTokens.find((t) => t.tokenHash === where.tokenHash) ?? null
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = store.enrollmentTokens.filter((t) => matches(t, where));
        rows.forEach((r) => applyData(r, data));
        return { count: rows.length };
      }),
    },
    deviceRefreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const row: RefreshRow = { id: nextId(), revokedAt: null, ...data };
        store.refreshTokens.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        store.refreshTokens.find((t) => t.tokenHash === where.tokenHash) ?? null
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = store.refreshTokens.find((t) => t.id === where.id);
        if (row) applyData(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = store.refreshTokens.filter((t) => matches(t, where));
        rows.forEach((r) => applyData(r, data));
        return { count: rows.length };
      }),
    },
    device: {
      findUnique: jest.fn(async ({ where }: any) =>
        store.devices.find((d) => d.deviceId === where.deviceId) ?? null
      ),
    },
  })),
}));

import * as jwt from 'jsonwebtoken';
import config from '../config/env';
import {
  createEnrollmentToken,
  consumeEnrollmentToken,
  revokeEnrollmentToken,
  issueDeviceCredentials,
  refreshDeviceCredentials,
  revokeDeviceTokens,
  EnrollmentError,
} from '../services/enrollmentService';

beforeEach(() => {
  store.enrollmentTokens.length = 0;
  store.refreshTokens.length = 0;
  store.devices.length = 0;
});

function enrolDevice(deviceId: string, status = 'ACTIVE', isRetired = false) {
  store.devices.push({ deviceId, status, isRetired });
}

describe('enrollment codes', () => {
  it('returns a readable code and stores only its hash', async () => {
    const token = await createEnrollmentToken({ createdBy: 'admin-1' });

    expect(token.code).toMatch(/^[2-9BCDFGHJKLMNPQRSTVWXYZ]{4}(-[2-9BCDFGHJKLMNPQRSTVWXYZ]{4}){2}$/);

    // A database disclosure must not yield usable codes.
    const stored = store.enrollmentTokens[0]!;
    expect(stored.tokenHash).not.toContain(token.code);
    expect(JSON.stringify(stored)).not.toContain(token.code);
  });

  it('issues a distinct code each time', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      codes.add((await createEnrollmentToken({ createdBy: 'admin-1' })).code);
    }
    expect(codes.size).toBe(25);
  });

  it('accepts a valid code once and refuses the second use', async () => {
    const { code } = await createEnrollmentToken({ createdBy: 'admin-1' });

    await expect(consumeEnrollmentToken(code, 'tablet-1')).resolves.toBeUndefined();
    await expect(consumeEnrollmentToken(code, 'tablet-2')).rejects.toThrow(
      /already been used/
    );
  });

  it('is case-insensitive and tolerates surrounding whitespace', async () => {
    const { code } = await createEnrollmentToken({ createdBy: 'admin-1' });
    await expect(consumeEnrollmentToken(`  ${code.toLowerCase()}  `, 'tablet-1')).resolves
      .toBeUndefined();
  });

  it('rejects a missing code — enrollment is no longer possible without one', async () => {
    // Previously the code was optional entirely.
    for (const bad of ['', '   ', undefined as any, null as any]) {
      await expect(consumeEnrollmentToken(bad, 'tablet-1')).rejects.toBeInstanceOf(
        EnrollmentError
      );
    }
  });

  it('rejects a code that was never issued', async () => {
    // The old check was `enrollmentCode.length < 4`, so 'XXXX' was accepted.
    await expect(consumeEnrollmentToken('XXXX', 'tablet-1')).rejects.toThrow(
      /Invalid enrollment code/
    );
  });

  it('rejects an expired code', async () => {
    const { code } = await createEnrollmentToken({ createdBy: 'admin-1', ttlMinutes: 1 });
    store.enrollmentTokens[0]!.expiresAt = new Date(Date.now() - 1000);

    await expect(consumeEnrollmentToken(code, 'tablet-1')).rejects.toThrow(/expired/);
  });

  it('rejects a revoked code', async () => {
    const { id, code } = await createEnrollmentToken({ createdBy: 'admin-1' });
    await revokeEnrollmentToken(id, 'admin-1');

    await expect(consumeEnrollmentToken(code, 'tablet-1')).rejects.toThrow(
      /Invalid enrollment code/
    );
  });

  it('honours a binding to a pre-registered serial', async () => {
    const { code } = await createEnrollmentToken({
      createdBy: 'admin-1',
      boundSerial: 'tablet-eastern-042',
    });

    await expect(consumeEnrollmentToken(code, 'some-other-tablet')).rejects.toThrow(
      /registered to a different device/
    );
    await expect(consumeEnrollmentToken(code, 'tablet-eastern-042')).resolves.toBeUndefined();
  });

  it('supports a batch code with a bounded number of uses', async () => {
    const { code } = await createEnrollmentToken({ createdBy: 'admin-1', maxUses: 3 });

    await consumeEnrollmentToken(code, 'tablet-1');
    await consumeEnrollmentToken(code, 'tablet-2');
    await consumeEnrollmentToken(code, 'tablet-3');

    await expect(consumeEnrollmentToken(code, 'tablet-4')).rejects.toThrow(/already been used/);
  });

  it('does not distinguish an unknown code from a revoked one', async () => {
    // Otherwise the endpoint becomes an oracle for which codes exist.
    const { id, code } = await createEnrollmentToken({ createdBy: 'admin-1' });
    await revokeEnrollmentToken(id, 'admin-1');

    const revoked = await consumeEnrollmentToken(code, 'd').catch((e) => e.message);
    const unknown = await consumeEnrollmentToken('AAAA-BBBB-CCCC', 'd').catch((e) => e.message);

    expect(revoked).toBe(unknown);
  });

  it('rejects nonsensical issuance parameters', async () => {
    await expect(createEnrollmentToken({ createdBy: 'a', ttlMinutes: 0 })).rejects.toThrow();
    await expect(createEnrollmentToken({ createdBy: 'a', maxUses: 0 })).rejects.toThrow();
  });
});

describe('device credentials', () => {
  it('issues a short-lived access token, not a 365-day one', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');

    const decoded = jwt.verify(creds.accessToken, config.jwtSecret, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }) as any;

    expect(decoded.role).toBe('DEVICE');
    expect(decoded.userId).toBe('tablet-1');

    const lifetimeSeconds = decoded.exp - decoded.iat;
    expect(lifetimeSeconds).toBe(config.deviceAccessTokenTtlSeconds);
    // The old credential lasted a year.
    expect(lifetimeSeconds).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it('stores only the hash of the refresh token', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');

    expect(store.refreshTokens[0]!.tokenHash).not.toBe(creds.refreshToken);
    expect(JSON.stringify(store.refreshTokens)).not.toContain(creds.refreshToken);
  });

  it('revokes previously issued refresh tokens when re-issuing', async () => {
    enrolDevice('tablet-1');
    const first = await issueDeviceCredentials('tablet-1');
    await issueDeviceCredentials('tablet-1');

    // A credential stolen before a legitimate re-enrollment stops working.
    await expect(refreshDeviceCredentials(first.refreshToken)).rejects.toThrow(
      /Invalid refresh token/
    );
  });

  it('exchanges a valid refresh token for a new access token', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');

    const refreshed = await refreshDeviceCredentials(creds.refreshToken);
    const decoded = jwt.verify(refreshed.accessToken, config.jwtSecret, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }) as any;

    expect(decoded.userId).toBe('tablet-1');
  });

  it('refuses to refresh for a WIPED device — the F-13 revocation path', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');

    store.devices[0]!.status = 'WIPED';

    await expect(refreshDeviceCredentials(creds.refreshToken)).rejects.toThrow(
      /no longer permitted/
    );
  });

  it('refuses to refresh for a SUSPENDED device', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');

    store.devices[0]!.status = 'SUSPENDED';
    await expect(refreshDeviceCredentials(creds.refreshToken)).rejects.toThrow(
      /no longer permitted/
    );
  });

  it('refuses to refresh for a retired device', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');

    store.devices[0]!.isRetired = true;
    await expect(refreshDeviceCredentials(creds.refreshToken)).rejects.toThrow(
      /no longer permitted/
    );
  });

  it('refuses to refresh for a deleted device and burns the token', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');

    store.devices.length = 0;

    await expect(refreshDeviceCredentials(creds.refreshToken)).rejects.toThrow(
      /no longer enrolled/
    );
    expect(store.refreshTokens[0]!.revokedAt).not.toBeNull();
  });

  it('rejects an expired refresh token', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');
    store.refreshTokens[0]!.expiresAt = new Date(Date.now() - 1000);

    await expect(refreshDeviceCredentials(creds.refreshToken)).rejects.toThrow(/expired/);
  });

  it('rejects a forged or absent refresh token', async () => {
    for (const bad of ['', '   ', 'not-a-real-token', undefined as any]) {
      await expect(refreshDeviceCredentials(bad)).rejects.toBeInstanceOf(EnrollmentError);
    }
  });

  it('revokeDeviceTokens stops all further refreshes for that device', async () => {
    enrolDevice('tablet-1');
    const creds = await issueDeviceCredentials('tablet-1');

    const revoked = await revokeDeviceTokens('tablet-1', 'admin-1');
    expect(revoked).toBe(1);

    await expect(refreshDeviceCredentials(creds.refreshToken)).rejects.toThrow(
      /Invalid refresh token/
    );
  });

  it('does not revoke another device\'s tokens', async () => {
    enrolDevice('tablet-1');
    enrolDevice('tablet-2');
    const one = await issueDeviceCredentials('tablet-1');
    const two = await issueDeviceCredentials('tablet-2');

    await revokeDeviceTokens('tablet-1', 'admin-1');

    await expect(refreshDeviceCredentials(one.refreshToken)).rejects.toThrow();
    await expect(refreshDeviceCredentials(two.refreshToken)).resolves.toBeDefined();
  });
});

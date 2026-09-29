import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import config from '../config/env';
import prisma from '../db';
import type { Prisma, PrismaClient } from '@prisma/client';

/** The shared client, or a transaction client when called inside $transaction. */
type Db = PrismaClient | Prisma.TransactionClient;
import { isRevoked } from './devicePresence';

/**
 * Device enrollment and credential lifecycle (findings F-02, F-13).
 *
 * `POST /api/devices/enroll` accepted any `deviceId` the caller invented and returned a
 * 365-day JWT with `role: DEVICE`. The enrollment code was optional and checked only for
 * `length >= 4` — the TODO for validating it against the database was still in the code
 * — and `generateEnrollmentCode()` returned a random hex string that was never persisted,
 * so codes could not be validated, expired or revoked. Posting an *existing* `deviceId`
 * took the update branch and issued a fresh token for that device, so any device identity
 * could be claimed or stolen by anyone who could reach the server.
 *
 * Device tokens were also only signature-checked, never compared against device state
 * (F-13), so a retired, wiped or stolen tablet held a valid credential for a year and
 * there was no revocation path at all.
 *
 * This module replaces both: enrollment requires a single-use, expiring, admin-issued
 * token, and a device receives a short-lived access token plus a refresh token that is
 * re-checked against device status on every use.
 */



export class EnrollmentError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400
  ) {
    super(message);
    this.name = 'EnrollmentError';
  }
}

/**
 * Hash a secret for storage. Enrollment codes and refresh tokens are high-entropy
 * values, so a single SHA-256 is appropriate — unlike a user password, there is no
 * guessable keyspace to slow down, and lookup must stay a single indexed query.
 */
function hashSecret(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

/** Human-transcribable code: no vowels (no accidental words), no 0/O/1/I ambiguity. */
function generateReadableCode(groups = 3, groupLength = 4): string {
  const alphabet = '23456789BCDFGHJKLMNPQRSTVWXYZ';
  const bytes = crypto.randomBytes(groups * groupLength);

  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  const out: string[] = [];

  for (let i = 0; i < groups; i++) {
    out.push(chars.slice(i * groupLength, (i + 1) * groupLength).join(''));
  }
  return out.join('-');
}

export interface CreatedEnrollmentToken {
  id: string;
  /** Shown once, at creation. Never retrievable afterwards. */
  code: string;
  expiresAt: Date;
  boundSerial: string | null;
  maxUses: number;
}

/**
 * Issue an enrollment code. The plaintext is returned once and only its hash is stored,
 * so a database disclosure yields no usable codes.
 */
export async function createEnrollmentToken(options: {
  createdBy: string;
  boundSerial?: string | undefined;
  ttlMinutes?: number;
  maxUses?: number;
  notes?: string | undefined;
}): Promise<CreatedEnrollmentToken> {
  const ttlMinutes = options.ttlMinutes ?? 60;
  const maxUses = options.maxUses ?? 1;

  if (ttlMinutes < 1 || ttlMinutes > 60 * 24 * 30) {
    throw new EnrollmentError('ttlMinutes must be between 1 and 43200', 'INVALID_TTL');
  }
  if (maxUses < 1 || maxUses > 1000) {
    throw new EnrollmentError('maxUses must be between 1 and 1000', 'INVALID_MAX_USES');
  }

  const code = generateReadableCode();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const record = await prisma.enrollmentToken.create({
    data: {
      tokenHash: hashSecret(code),
      createdBy: options.createdBy,
      boundSerial: options.boundSerial ?? null,
      maxUses,
      expiresAt,
      notes: options.notes ?? null,
    },
  });

  return {
    id: record.id,
    code,
    expiresAt: record.expiresAt,
    boundSerial: record.boundSerial,
    maxUses: record.maxUses,
  };
}

/**
 * Validate and consume an enrollment code for a specific device.
 *
 * The use count is incremented with a conditional update so that two devices redeeming
 * the last use of a code concurrently cannot both succeed.
 *
 * @throws EnrollmentError when the code is unknown, expired, revoked, exhausted, or
 *         bound to a different device.
 */
export async function consumeEnrollmentToken(
  code: string,
  deviceId: string,
  db: Db = prisma
): Promise<void> {
  if (typeof code !== 'string' || code.trim() === '') {
    throw new EnrollmentError('An enrollment code is required', 'ENROLLMENT_CODE_REQUIRED', 401);
  }

  const normalised = code.trim().toUpperCase();
  const token = await db.enrollmentToken.findUnique({
    where: { tokenHash: hashSecret(normalised) },
  });

  // Same error for unknown and invalid, so the endpoint cannot be used to probe which
  // codes exist.
  if (!token) {
    throw new EnrollmentError('Invalid enrollment code', 'ENROLLMENT_CODE_INVALID', 401);
  }
  if (token.revokedAt) {
    throw new EnrollmentError('Invalid enrollment code', 'ENROLLMENT_CODE_INVALID', 401);
  }
  if (token.expiresAt.getTime() <= Date.now()) {
    throw new EnrollmentError('This enrollment code has expired', 'ENROLLMENT_CODE_EXPIRED', 401);
  }
  if (token.useCount >= token.maxUses) {
    throw new EnrollmentError(
      'This enrollment code has already been used',
      'ENROLLMENT_CODE_EXHAUSTED',
      401
    );
  }
  if (token.boundSerial && token.boundSerial !== deviceId) {
    throw new EnrollmentError(
      'This enrollment code is registered to a different device',
      'ENROLLMENT_CODE_WRONG_DEVICE',
      403
    );
  }

  // Conditional increment: only succeeds while the code still has a use left.
  const claimed = await db.enrollmentToken.updateMany({
    where: {
      id: token.id,
      revokedAt: null,
      useCount: { lt: token.maxUses },
      expiresAt: { gt: new Date() },
    },
    data: {
      useCount: { increment: 1 },
      lastUsedBy: deviceId,
      lastUsedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    throw new EnrollmentError(
      'This enrollment code has already been used',
      'ENROLLMENT_CODE_EXHAUSTED',
      401
    );
  }
}

/** Revoke an unused code so it can never be redeemed. */
export async function revokeEnrollmentToken(id: string, revokedBy: string): Promise<void> {
  await prisma.enrollmentToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy },
  });
}

export interface DeviceCredentials {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

function signAccessToken(deviceId: string): { token: string; expiresIn: number } {
  const expiresIn = config.deviceAccessTokenTtlSeconds;

  const token = jwt.sign(
    {
      userId: deviceId,
      username: deviceId,
      email: `${deviceId}@device.mdm`,
      role: 'DEVICE',
    },
    config.jwtSecret,
    {
      expiresIn,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    } as jwt.SignOptions
  );

  return { token, expiresIn };
}

/**
 * Issue a fresh credential pair for a device, revoking any refresh tokens it already
 * holds — so re-enrolling a device invalidates a stolen credential rather than letting
 * both live side by side.
 */
export async function issueDeviceCredentials(
  deviceId: string,
  db: Db = prisma
): Promise<DeviceCredentials> {
  await db.deviceRefreshToken.updateMany({
    where: { deviceId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy: 'reissue' },
  });

  const refreshToken = crypto.randomBytes(32).toString('base64url');
  const refreshTokenExpiresAt = new Date(
    Date.now() + config.deviceRefreshTokenTtlDays * 24 * 60 * 60 * 1000
  );

  await db.deviceRefreshToken.create({
    data: {
      tokenHash: hashSecret(refreshToken),
      deviceId,
      expiresAt: refreshTokenExpiresAt,
    },
  });

  const { token, expiresIn } = signAccessToken(deviceId);

  return { accessToken: token, expiresIn, refreshToken, refreshTokenExpiresAt };
}

/**
 * Exchange a refresh token for a new access token.
 *
 * This is the revocation path device tokens previously lacked: the device's current
 * status is checked on every refresh, so a wiped, suspended or deleted device stops
 * being able to obtain a credential within one access-token lifetime.
 */
export async function refreshDeviceCredentials(
  refreshToken: string
): Promise<DeviceCredentials> {
  if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    throw new EnrollmentError('A refresh token is required', 'REFRESH_TOKEN_REQUIRED', 401);
  }

  const record = await prisma.deviceRefreshToken.findUnique({
    where: { tokenHash: hashSecret(refreshToken.trim()) },
  });

  if (!record || record.revokedAt) {
    throw new EnrollmentError('Invalid refresh token', 'REFRESH_TOKEN_INVALID', 401);
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new EnrollmentError('Refresh token has expired', 'REFRESH_TOKEN_EXPIRED', 401);
  }

  const device = await prisma.device.findUnique({
    where: { deviceId: record.deviceId },
    select: { status: true, isRetired: true },
  });

  if (!device) {
    await revokeDeviceTokens(record.deviceId, 'device-deleted');
    throw new EnrollmentError('Device is no longer enrolled', 'DEVICE_NOT_ENROLLED', 401);
  }

  if (isRevoked(device)) {
    await revokeDeviceTokens(record.deviceId, `device-${device.status.toLowerCase()}`);
    throw new EnrollmentError(
      'This device is no longer permitted to connect',
      'DEVICE_REVOKED',
      403
    );
  }

  await prisma.deviceRefreshToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  const { token, expiresIn } = signAccessToken(record.deviceId);

  return {
    accessToken: token,
    expiresIn,
    refreshToken,
    refreshTokenExpiresAt: record.expiresAt,
  };
}

/** Revoke every refresh token a device holds — used on retirement, wipe or deletion. */
export async function revokeDeviceTokens(deviceId: string, revokedBy: string): Promise<number> {
  const result = await prisma.deviceRefreshToken.updateMany({
    where: { deviceId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy },
  });
  return result.count;
}

/** Exposed for tests and for administrative tooling. */
export const __internals = { hashSecret, generateReadableCode };

/**
 * Device enrollment endpoint behaviour.
 *
 * This suite previously set `(global as any).prisma = mockPrisma`, which never reached
 * the controller's own `new PrismaClient()`, so the auto-mock returned undefined from
 * every query and most of these tests failed regardless of the code under test. It is
 * rewritten here around a mock that the controller actually uses.
 *
 * It also now asserts the enrollment handshake from findings F-02 and F-13 rather than
 * the previous behaviour, where the enrollment code was optional, checked only for
 * `length >= 4`, and re-posting an existing deviceId minted a fresh credential for it.
 */

interface DeviceRow {
  id: string;
  deviceId: string;
  status: string;
  isRetired: boolean;
  [key: string]: unknown;
}

const store = {
  devices: [] as DeviceRow[],
  enrollmentTokens: [] as any[],
  refreshTokens: [] as any[],
  events: [] as any[],
  failDeviceCreateWith: null as Error | null,
};

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, condition]) => {
    const value = row[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const c = condition as any;
      if ('lt' in c) return value < c.lt;
      if ('gt' in c) return value > c.gt;
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

/**
 * Run `fn` against `client`, restoring the in-memory store if it throws — enough of
 * Postgres transaction semantics to show that a failed enrollment rolls back.
 */
function withTransactions(client: any): any {
  client.$transaction = async (fn: (tx: any) => Promise<unknown>) => {
    const snapshot = structuredClone({
      devices: store.devices,
      enrollmentTokens: store.enrollmentTokens,
      refreshTokens: store.refreshTokens,
      events: store.events,
    });
    try {
      return await fn(client);
    } catch (error) {
      for (const key of Object.keys(snapshot) as (keyof typeof snapshot)[]) {
        (store[key] as any[]).length = 0;
        (store[key] as any[]).push(...snapshot[key]);
      }
      throw error;
    }
  };
  return client;
}

jest.mock('@prisma/client', () => ({
  // Keep the real Prisma namespace: Prisma.DbNull and friends are sentinel values the
  // code compares against, so faking them would change behaviour rather than isolate it.
  ...jest.requireActual('@prisma/client'),
  PrismaClient: jest.fn().mockImplementation(() => withTransactions({
    device: {
      findUnique: jest.fn(async ({ where }: any) =>
        store.devices.find((d) => d.deviceId === where.deviceId) ?? null
      ),
      create: jest.fn(async ({ data }: any) => {
        if (store.failDeviceCreateWith) throw store.failDeviceCreateWith;
        const row: DeviceRow = { id: nextId(), status: 'ENROLLED', isRetired: false, ...data };
        store.devices.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = store.devices.find((d) => d.deviceId === where.deviceId);
        if (!row) throw new Error('Device not found');
        applyData(row, data);
        return row;
      }),
    },
    deviceEvent: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId(), ...data };
        store.events.push(row);
        return row;
      }),
    },
    enrollmentToken: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId(), useCount: 0, revokedAt: null, boundSerial: null, maxUses: 1, ...data };
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
        const row = { id: nextId(), revokedAt: null, ...data };
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
  })),
}));

import { Request, Response } from 'express';
import { enrollDevice } from '../controllers/deviceController';
import { createEnrollmentToken } from '../services/enrollmentService';

function mockResponse() {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

const deviceInfo = {
  deviceId: 'device-123',
  manufacturer: 'Samsung',
  model: 'Galaxy Tab A8',
  osVersion: '12.0',
  apiLevel: 31,
  batteryLevel: 85,
  buildNumber: 'ABC123',
};

async function issueCode(boundSerial?: string): Promise<string> {
  const token = await createEnrollmentToken({
    createdBy: 'admin-1',
    ...(boundSerial ? { boundSerial } : {}),
  });
  return token.code;
}

beforeEach(() => {
  store.devices.length = 0;
  store.enrollmentTokens.length = 0;
  store.refreshTokens.length = 0;
  store.events.length = 0;
  store.failDeviceCreateWith = null;
});

describe('enrollDevice', () => {
  it('rejects enrollment without a deviceId', async () => {
    const res = mockResponse();
    await enrollDevice({ body: { deviceInfo: {} } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('deviceId') })
    );
  });

  it('rejects enrollment with no enrollment code at all', async () => {
    // Previously the code was optional, so this enrolled successfully.
    const res = mockResponse();
    await enrollDevice({ body: { deviceInfo } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'ENROLLMENT_CODE_REQUIRED' })
    );
    expect(store.devices).toHaveLength(0);
  });

  it('rejects a code that was never issued', async () => {
    // The old check was `enrollmentCode.length < 4`, so any 4+ character string passed.
    const res = mockResponse();
    await enrollDevice(
      { body: { deviceInfo, enrollmentCode: 'XXXX-YYYY-ZZZZ' } } as Request,
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ENROLLMENT_CODE_INVALID' })
    );
    expect(store.devices).toHaveLength(0);
  });

  it('enrolls a new device with a valid code and returns a credential pair', async () => {
    const enrollmentCode = await issueCode();
    const res = mockResponse();

    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Device enrolled successfully',
        deviceId: 'device-123',
        deviceToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
      })
    );
    expect(store.devices).toHaveLength(1);
  });

  it('refuses to reuse an enrollment code for a second device', async () => {
    const enrollmentCode = await issueCode();

    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, mockResponse());

    const res = mockResponse();
    await enrollDevice(
      { body: { deviceInfo: { ...deviceInfo, deviceId: 'device-999' }, enrollmentCode } } as Request,
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ENROLLMENT_CODE_EXHAUSTED' })
    );
  });

  it('refuses to re-enroll an existing device without a valid code', async () => {
    // This is the core of F-02: posting an existing deviceId took the update branch and
    // issued a fresh credential for that device, so any identity could be stolen.
    store.devices.push({ id: 'db-1', deviceId: 'device-123', status: 'ACTIVE', isRetired: false });

    const res = mockResponse();
    await enrollDevice({ body: { deviceInfo } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(store.refreshTokens).toHaveLength(0);
  });

  it('does not burn the code when creating the device fails', async () => {
    // The code used to be spent before the device row was written, so a failure there
    // left the operator with a used code and no enrolled tablet.
    const enrollmentCode = await issueCode();
    store.failDeviceCreateWith = new Error('Database connection lost');

    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, mockResponse());

    expect(store.enrollmentTokens[0].useCount).toBe(0);
    expect(store.refreshTokens).toHaveLength(0);

    store.failDeviceCreateWith = null;
    const retry = mockResponse();
    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, retry);
    expect(retry.status).toHaveBeenCalledWith(201);
  });

  it.each(['SUSPENDED', 'WIPED'])('refuses to let a %s device re-enroll itself', async (status) => {
    // Re-enrollment used to reset any device to ENROLLED, undoing the suspension.
    store.devices.push({ id: 'db-1', deviceId: 'device-123', status, isRetired: false });
    const enrollmentCode = await issueCode();

    const res = mockResponse();
    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(store.devices[0]!.status).toBe(status);
    expect(store.enrollmentTokens[0].useCount).toBe(0);
  });

  it('re-enrolls an existing device when a valid code is presented', async () => {
    store.devices.push({ id: 'db-1', deviceId: 'device-123', status: 'ACTIVE', isRetired: false });
    const enrollmentCode = await issueCode();

    const res = mockResponse();
    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Device re-enrolled successfully',
        deviceToken: expect.any(String),
        refreshToken: expect.any(String),
      })
    );
  });

  it('honours a code bound to a specific serial', async () => {
    const enrollmentCode = await issueCode('device-123');

    const wrong = mockResponse();
    await enrollDevice(
      { body: { deviceInfo: { ...deviceInfo, deviceId: 'device-456' }, enrollmentCode } } as Request,
      wrong
    );
    expect(wrong.status).toHaveBeenCalledWith(403);

    const right = mockResponse();
    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, right);
    expect(right.status).toHaveBeenCalledWith(201);
  });

  it('translates a unique-constraint violation into 409', async () => {
    const enrollmentCode = await issueCode();
    const constraintError = new Error('Unique constraint failed');
    (constraintError as any).code = 'P2002';
    store.failDeviceCreateWith = constraintError;

    const res = mockResponse();
    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('already exists') })
    );
  });

  it('translates an unexpected failure into 500', async () => {
    const enrollmentCode = await issueCode();
    store.failDeviceCreateWith = new Error('Database connection lost');

    const res = mockResponse();
    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Failed to enroll') })
    );
  });

  it('does not leak the enrollment code into the logged event', async () => {
    const enrollmentCode = await issueCode();
    await enrollDevice({ body: { deviceInfo, enrollmentCode } } as Request, mockResponse());

    expect(JSON.stringify(store.events)).not.toContain(enrollmentCode);
  });
});

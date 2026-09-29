/**
 * The agent's offline HTTP path.
 *
 * Every endpoint the agent calls when it has no socket — pending commands, policies,
 * heartbeat, command result — either did not exist or sat behind the operator's
 * `authenticateToken`, which rejects device tokens. A tablet out of coverage for days
 * therefore never received a command queued while it was away. These tests drive the
 * real routers over HTTP.
 */

import express from 'express';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';

const mockPrisma = {
  device: { findUnique: jest.fn(), updateMany: jest.fn() },
  deviceEvent: { create: jest.fn() },
  remoteCommand: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  policy: { findMany: jest.fn() },
};

jest.mock('../db', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
  closeDatabase: jest.fn(),
}));

import config from '../config/env';
import { deviceAgentRoutes, deviceCommandResultRoutes } from '../routes/deviceAgentRoutes';
import { initializeCommandService } from '../services/commandServiceInstance';
import { resetHeartbeatSampling } from '../services/telemetryService';

const sign = (payload: Record<string, unknown>) =>
  jwt.sign(payload, config.jwtSecret, {
    expiresIn: '5m',
    issuer: 'mdm-system',
    audience: 'mdm-users',
  } as jwt.SignOptions);

const deviceToken = (deviceId: string) => `Bearer ${sign({ userId: deviceId, role: 'DEVICE' })}`;
const adminToken = () => `Bearer ${sign({ userId: 'admin-1', role: 'ADMIN' })}`;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/devices', deviceAgentRoutes);
  app.use('/api/commands', deviceCommandResultRoutes);
  // Stand-in for the operator routers mounted behind the device routers.
  app.use((req, res) => res.status(418).json({ reachedOperatorRouter: true }));
  return app;
}

describe('device agent HTTP API', () => {
  const app = buildApp();

  beforeAll(() => {
    initializeCommandService({ to: () => ({ emit: jest.fn() }) } as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetHeartbeatSampling();
    mockPrisma.device.findUnique.mockResolvedValue({ status: 'ACTIVE', isRetired: false });
  });

  it('passes operator tokens through to the operator router', async () => {
    const res = await request(app)
      .post('/api/devices/tab-1/heartbeat')
      .set('Authorization', adminToken())
      .send({ batteryLevel: 50 });

    expect(res.status).toBe(418);
    expect(mockPrisma.device.updateMany).not.toHaveBeenCalled();
  });

  it('passes requests with no token through, so the operator router refuses them', async () => {
    const res = await request(app).get('/api/devices/tab-1/commands/pending');
    expect(res.status).toBe(418);
  });

  it('answers an expired device token with 401 so the agent refreshes and retries', async () => {
    const expired = jwt.sign({ userId: 'tab-1', role: 'DEVICE' }, config.jwtSecret, {
      expiresIn: '-1s',
      issuer: 'mdm-system',
      audience: 'mdm-users',
    } as jwt.SignOptions);

    const res = await request(app)
      .get('/api/devices/tab-1/commands/pending')
      .set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('DEVICE_TOKEN_INVALID');
  });

  it('refuses a device acting as a different device', async () => {
    const res = await request(app)
      .get('/api/devices/tab-victim/commands/pending')
      .set('Authorization', deviceToken('tab-1'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEVICE_MISMATCH');
    expect(mockPrisma.remoteCommand.findMany).not.toHaveBeenCalled();
  });

  it('refuses a suspended device even with a valid token', async () => {
    mockPrisma.device.findUnique.mockResolvedValue({ status: 'SUSPENDED', isRetired: false });

    const res = await request(app)
      .get('/api/devices/tab-1/commands/pending')
      .set('Authorization', deviceToken('tab-1'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DEVICE_REVOKED');
  });

  it('hands a polling device its queued commands in the agent RemoteCommand shape', async () => {
    const createdAt = new Date('2026-09-01T08:00:00Z');
    mockPrisma.remoteCommand.findMany.mockResolvedValue([
      { id: 'cmd-1', command: 'LOCK_DEVICE', parameters: null, createdAt, updatedAt: createdAt },
    ]);
    mockPrisma.remoteCommand.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .get('/api/devices/tab-1/commands/pending')
      .set('Authorization', deviceToken('tab-1'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 'cmd-1',
        command: 'LOCK_DEVICE',
        parameters: {},
        deviceId: 'tab-1',
        priority: 'NORMAL',
        timeout: 30000,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      },
    ]);
    // Only this device's PENDING commands, then marked SENT.
    expect(mockPrisma.remoteCommand.findMany.mock.calls[0][0].where).toEqual({
      device: { deviceId: 'tab-1' },
      status: 'PENDING',
    });
    expect(mockPrisma.remoteCommand.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['cmd-1'] }, status: 'PENDING' },
      data: { status: 'SENT' },
    });
  });

  it('records an HTTP heartbeat and reports pending commands', async () => {
    mockPrisma.device.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.remoteCommand.count.mockResolvedValue(3);

    const res = await request(app)
      .post('/api/devices/tab-1/heartbeat')
      .set('Authorization', deviceToken('tab-1'))
      .send({ status: 'ACTIVE', batteryLevel: 64, isCharging: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, pendingCommands: 3 });
    expect(typeof res.body.nextHeartbeat).toBe('string');
  });

  it("serves only the device's own active policies", async () => {
    mockPrisma.policy.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/devices/tab-1/policies')
      .set('Authorization', deviceToken('tab-1'));

    expect(res.status).toBe(200);
    expect(mockPrisma.policy.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      devices: { some: { deviceId: 'tab-1' } },
    });
  });

  it.each(['post', 'put'] as const)('accepts a command result by %s in the Retrofit shape', async (method) => {
    mockPrisma.remoteCommand.findUnique.mockResolvedValue({
      id: 'cmd-1',
      deviceId: 'db-1',
      command: 'LOCK_DEVICE',
      device: { deviceId: 'tab-1' },
    });

    const res = await request(app)
      [method]('/api/commands/cmd-1/result')
      .set('Authorization', deviceToken('tab-1'))
      .send({ commandId: 'cmd-1', status: 'SUCCESS', result: { locked: true } });

    expect(res.status).toBe(200);
    expect(mockPrisma.remoteCommand.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cmd-1' }, data: expect.objectContaining({ status: 'EXECUTED' }) })
    );
  });

  it("refuses a result for another device's command", async () => {
    mockPrisma.remoteCommand.findUnique.mockResolvedValue({
      id: 'cmd-9',
      deviceId: 'db-9',
      command: 'WIPE_DEVICE',
      device: { deviceId: 'tab-other' },
    });

    const res = await request(app)
      .post('/api/commands/cmd-9/result')
      .set('Authorization', deviceToken('tab-1'))
      .send({ success: true });

    expect(res.status).toBe(404);
    expect(mockPrisma.remoteCommand.update).not.toHaveBeenCalled();
  });
});

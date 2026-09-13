/**
 * Request validation wiring (finding F-05).
 *
 * `validate()`, `validateParams()` and Joi schemas for devices and policies were all
 * written, but `deviceSchemas.ts` and `policySchemas.ts` were imported by nothing and
 * only `authRoutes` used the middleware. Everywhere else `req.body` went straight into
 * Prisma — and policy `rules` and command `parameters` are shipped to tablets and
 * executed there.
 *
 * Two things are tested here: that the middleware behaves correctly on Express 5 (which
 * changed how `req.params` and `req.query` are exposed), and that the rewritten schemas
 * accept the payloads the system really sends while rejecting hostile ones.
 */

import express from 'express';
import request from 'supertest';

import { validate, validateParams } from '../middleware/validation';
import {
  createCommandSchema,
  bulkCommandSchema,
  commandIdParamSchema,
} from '../schemas/commandSchemas';
import { createPolicySchema, updatePolicySchema } from '../schemas/policySchemas';
import {
  deviceIdParamSchema,
  updateDeviceStatusSchema,
  deviceHeartbeatSchema,
} from '../schemas/deviceSchemas';

/** Mini app exposing one validated route, so the middleware runs for real. */
function appWithBody(schema: any) {
  const app = express();
  app.use(express.json());
  app.post('/t', validate(schema), (req, res) => res.status(200).json({ body: req.body }));
  return app;
}

function appWithParams(schema: any) {
  const app = express();
  app.get('/t/:deviceId', validateParams(schema), (req, res) =>
    res.status(200).json({ params: req.params })
  );
  return app;
}

describe('validation middleware on Express 5', () => {
  it('passes a valid body through and exposes the sanitised value', async () => {
    const res = await request(appWithBody(bulkCommandSchema))
      .post('/t')
      .send({ operation: 'cancel', commandIds: ['c1', 'c2'] });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ operation: 'cancel', commandIds: ['c1', 'c2'] });
  });

  it('rejects an invalid body with 400 and names the field', async () => {
    const res = await request(appWithBody(bulkCommandSchema))
      .post('/t')
      .send({ operation: 'destroy', commandIds: [] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.map((e: any) => e.field).sort()).toEqual([
      'commandIds',
      'operation',
    ]);
  });

  it('validates route params without throwing on Express 5', async () => {
    // Express 5 changed req.params/req.query handling; validateParams assigns to
    // req.params, so this confirms the assignment is still legal.
    const res = await request(appWithParams(deviceIdParamSchema)).get('/t/tablet-001');

    expect(res.status).toBe(200);
    expect(res.body.params).toEqual({ deviceId: 'tablet-001' });
  });

  it('rejects a param that could escape a path or a socket room name', async () => {
    const res = await request(appWithParams(deviceIdParamSchema)).get('/t/tablet%20001!');
    expect(res.status).toBe(400);
  });
});

describe('command schemas', () => {
  const valid = {
    deviceIds: ['tablet-001', 'tablet-002'],
    command: 'LOCK_DEVICE',
    parameters: { lockMessage: 'Return to district office' },
  };

  it('accepts a realistic lock command', async () => {
    const res = await request(appWithBody(createCommandSchema)).post('/t').send(valid);
    expect(res.status).toBe(200);
  });

  it('accepts a wipe targeting many devices', async () => {
    const res = await request(appWithBody(createCommandSchema))
      .post('/t')
      .send({ deviceIds: Array.from({ length: 500 }, (_, i) => `t-${i}`), command: 'WIPE_DEVICE' });

    expect(res.status).toBe(200);
  });

  it('rejects an unrecognised command rather than queueing it', async () => {
    const res = await request(appWithBody(createCommandSchema))
      .post('/t')
      .send({ ...valid, command: 'RUN_SHELL' });

    expect(res.status).toBe(400);
  });

  it('rejects an empty device list', async () => {
    const res = await request(appWithBody(createCommandSchema))
      .post('/t')
      .send({ ...valid, deviceIds: [] });

    expect(res.status).toBe(400);
  });

  it('rejects a malformed package name for an install', async () => {
    const res = await request(appWithBody(createCommandSchema))
      .post('/t')
      .send({
        deviceIds: ['t1'],
        command: 'INSTALL_APP',
        parameters: { packageName: '../../etc/passwd' },
      });

    expect(res.status).toBe(400);
  });

  it('rejects a non-http app URL', async () => {
    const res = await request(appWithBody(createCommandSchema))
      .post('/t')
      .send({
        deviceIds: ['t1'],
        command: 'INSTALL_APP',
        parameters: { packageName: 'ug.go.ubos.census', appUrl: 'file:///etc/shadow' },
      });

    expect(res.status).toBe(400);
  });

  it('rejects an expiry that precedes the scheduled time', async () => {
    const res = await request(appWithBody(createCommandSchema))
      .post('/t')
      .send({
        ...valid,
        executeAt: '2026-10-01T09:00:00.000Z',
        expiresAt: '2026-09-01T09:00:00.000Z',
      });

    expect(res.status).toBe(400);
  });

  it('still carries provisioning parameters it does not enumerate', async () => {
    // PROVISION_DEVICE payloads are shaped by the provisioning profile, so unknown
    // parameter keys must survive validation rather than being stripped.
    const res = await request(appWithBody(createCommandSchema))
      .post('/t')
      .send({
        deviceIds: ['t1'],
        command: 'PROVISION_DEVICE',
        parameters: { sessionId: 's1', apps: [{ packageName: 'a.b.c' }] },
      });

    expect(res.status).toBe(200);
    expect(res.body.body.parameters.sessionId).toBe('s1');
    expect(res.body.body.parameters.apps).toEqual([{ packageName: 'a.b.c' }]);
  });

  it('accepts a cuid command id, which the old UUID rule would have rejected', () => {
    // Identifiers are Prisma cuids. The previous deviceIdSchema required a UUID, which
    // would have rejected every real id in the system.
    expect(commandIdParamSchema.validate({ id: 'clx3k2j9a0000abcd1234efgh' }).error).toBeUndefined();
    expect(commandIdParamSchema.validate({ id: '' }).error).toBeDefined();
    expect(commandIdParamSchema.validate({}).error).toBeDefined();
  });
});

describe('policy schemas', () => {
  const valid = {
    name: 'Census kiosk lockdown',
    description: 'Eastern region, wave 2',
    type: 'SECURITY',
    rules: { cameraDisabled: true, passwordMinLength: 6 },
  };

  it('accepts a realistic policy using the rules field', async () => {
    // The previous schema validated a `settings` field that neither the controller nor
    // Prisma uses, so every valid policy would have been rejected.
    const res = await request(appWithBody(createPolicySchema)).post('/t').send(valid);

    expect(res.status).toBe(200);
    expect(res.body.body.rules).toEqual({ cameraDisabled: true, passwordMinLength: 6 });
  });

  it('applies documented defaults', async () => {
    const res = await request(appWithBody(createPolicySchema)).post('/t').send(valid);

    expect(res.body.body.targetDevices).toEqual([]);
    expect(res.body.body.priority).toBe(0);
    expect(res.body.body.isActive).toBe(true);
  });

  it('rejects an unknown policy type', async () => {
    const res = await request(appWithBody(createPolicySchema))
      .post('/t')
      .send({ ...valid, type: 'ARBITRARY' });

    expect(res.status).toBe(400);
  });

  it('rejects rules that are not an object', async () => {
    for (const rules of ['everything-off', 42, []]) {
      const res = await request(appWithBody(createPolicySchema))
        .post('/t')
        .send({ ...valid, rules });

      expect({ rules, status: res.status }).toEqual({ rules, status: 400 });
    }
  });

  it('rejects an empty update', async () => {
    const res = await request(appWithBody(updatePolicySchema)).post('/t').send({});
    expect(res.status).toBe(400);
  });

  it('accepts a partial update', async () => {
    const res = await request(appWithBody(updatePolicySchema))
      .post('/t')
      .send({ isActive: false });

    expect(res.status).toBe(200);
  });
});

describe('device schemas', () => {
  it('accepts a realistic status update', async () => {
    const res = await request(appWithBody(updateDeviceStatusSchema))
      .post('/t')
      .send({
        status: 'ACTIVE',
        batteryLevel: 73,
        isCharging: false,
        location: { latitude: 0.3476, longitude: 32.5825, accuracy: 12.5 },
      });

    expect(res.status).toBe(200);
  });

  it('rejects a status outside the Prisma enum', async () => {
    // The old schema allowed LOST and RETIRED, which DeviceStatus does not define.
    for (const status of ['LOST', 'RETIRED', 'DESTROYED']) {
      const res = await request(appWithBody(updateDeviceStatusSchema))
        .post('/t')
        .send({ status });

      expect({ status, code: res.status }).toEqual({ status, code: 400 });
    }
  });

  it('accepts every status the Prisma enum does define', async () => {
    for (const status of ['ENROLLED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'WIPED']) {
      const res = await request(appWithBody(updateDeviceStatusSchema))
        .post('/t')
        .send({ status });

      expect({ status, code: res.status }).toEqual({ status, code: 200 });
    }
  });

  it('rejects impossible telemetry', async () => {
    const bad = [
      { batteryLevel: 150 },
      { batteryLevel: -1 },
      { location: { latitude: 99, longitude: 0 } },
      { location: { latitude: 0, longitude: 200 } },
    ];

    for (const body of bad) {
      const res = await request(appWithBody(updateDeviceStatusSchema)).post('/t').send(body);
      expect({ body, code: res.status }).toEqual({ body, code: 400 });
    }
  });

  it('lets a heartbeat carry agent fields the server does not enumerate', async () => {
    const res = await request(appWithBody(deviceHeartbeatSchema))
      .post('/t')
      .send({
        batteryLevel: 50,
        storageInfo: { total: 64000000000, available: 32000000000 },
        futureAgentField: { anything: true },
      });

    expect(res.status).toBe(200);
    expect(res.body.body.futureAgentField).toEqual({ anything: true });
  });
});

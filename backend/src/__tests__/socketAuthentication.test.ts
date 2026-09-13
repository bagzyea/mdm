/**
 * Socket.IO authentication (finding F-03).
 *
 * The device channel previously had no enforced authentication: no io.use()
 * middleware existed, the Android client's handshake token was never read, and every
 * device event trusted the deviceId in its own payload. An unauthenticated socket
 * could join any device's room and receive its queued commands, forge heartbeats and
 * locations, and report false command results — and a legitimate token from one
 * tablet could impersonate every other tablet.
 *
 * These tests drive a real Socket.IO server over a real client connection, because
 * the defect lived in the handshake and the event plumbing rather than in any single
 * function.
 */

import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import * as jwt from 'jsonwebtoken';

import config from '../config/env';
import { installSocketAuth, resolveDeviceId, joinIdentityRooms } from '../socket/auth';

const ISSUER = 'mdm-system';
const AUDIENCE = 'mdm-users';

function signToken(payload: Record<string, unknown>, expiresIn = '5m'): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn,
    issuer: ISSUER,
    audience: AUDIENCE,
  } as jwt.SignOptions);
}

const deviceToken = (deviceId: string) =>
  signToken({
    userId: deviceId,
    username: deviceId,
    email: `${deviceId}@device.mdm`,
    role: 'DEVICE',
  });

const adminToken = () =>
  signToken({
    userId: 'admin-1',
    username: 'admin',
    email: 'admin@example.com',
    role: 'ADMIN',
  });

/**
 * A bare Socket.IO server wired with the *production* handshake middleware and
 * identity helpers from src/socket/auth.ts. Importing src/server.ts itself would pull
 * in Prisma, the notification service and the command queue; importing the auth module
 * directly keeps this fast while still exercising the code the server actually runs,
 * so the two cannot drift apart.
 */
function buildServer(): { httpServer: HttpServer; io: SocketIOServer; received: any[] } {
  const httpServer = createServer();
  const io = new SocketIOServer(httpServer);
  const received: any[] = [];

  installSocketAuth(io);

  io.on('connection', (socket) => {
    joinIdentityRooms(socket);

    socket.on('deviceHeartbeat', (data: any) => {
      const deviceId = resolveDeviceId(socket, data?.deviceId);
      if (!deviceId) return;
      received.push({ event: 'deviceHeartbeat', deviceId });
      socket.emit('heartbeatAccepted', { deviceId });
    });

    socket.on('whichRooms', () => {
      socket.emit('rooms', [...socket.rooms].filter((r) => r !== socket.id));
    });
  });

  return { httpServer, io, received };
}

describe('Socket.IO handshake authentication (F-03 regression)', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let received: any[];
  let url: string;
  const clients: ClientSocket[] = [];

  beforeAll((done) => {
    ({ httpServer, io, received } = buildServer());
    httpServer.listen(() => {
      url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll(async () => {
    clients.forEach((c) => c.disconnect());
    await io.close();
    httpServer.close();
  });

  afterEach(() => {
    received.length = 0;
  });

  /** Connect a client and resolve on success or reject with the handshake error. */
  function connect(auth?: Record<string, unknown>): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = ioClient(url, {
        transports: ['websocket'],
        reconnection: false,
        ...(auth ? { auth } : {}),
      });
      clients.push(client);
      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  }

  it('rejects a connection with no token', async () => {
    await expect(connect()).rejects.toThrow('AUTHENTICATION_REQUIRED');
  });

  it('rejects a connection with a malformed token', async () => {
    await expect(connect({ token: 'not-a-jwt' })).rejects.toThrow('AUTHENTICATION_FAILED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ userId: 'device-1', role: 'DEVICE' }, 'some-other-secret-value-32-bytes!!', {
      expiresIn: '5m',
      issuer: ISSUER,
      audience: AUDIENCE,
    } as jwt.SignOptions);

    await expect(connect({ token: forged })).rejects.toThrow('AUTHENTICATION_FAILED');
  });

  it('rejects an expired token', async () => {
    const expired = signToken({ userId: 'device-1', role: 'DEVICE' }, '-1s');
    await expect(connect({ token: expired })).rejects.toThrow('AUTHENTICATION_FAILED');
  });

  it('accepts a valid device token and joins only that device room', async () => {
    const client = await connect({ token: deviceToken('device-alpha') });

    const rooms = await new Promise<string[]>((resolve) => {
      client.on('rooms', resolve);
      client.emit('whichRooms');
    });

    expect(rooms).toEqual(['device_device-alpha']);
  });

  it('accepts a heartbeat that matches the authenticated device', async () => {
    const client = await connect({ token: deviceToken('device-beta') });

    const accepted = await new Promise<any>((resolve) => {
      client.on('heartbeatAccepted', resolve);
      client.emit('deviceHeartbeat', { deviceId: 'device-beta', batteryLevel: 80 });
    });

    expect(accepted).toEqual({ deviceId: 'device-beta' });
    expect(received).toEqual([{ event: 'deviceHeartbeat', deviceId: 'device-beta' }]);
  });

  it('rejects a heartbeat that claims a different device', async () => {
    // The core of F-03: a valid token for one tablet impersonating another.
    const client = await connect({ token: deviceToken('device-gamma') });

    const error = await new Promise<any>((resolve) => {
      client.on('authError', resolve);
      client.emit('deviceHeartbeat', { deviceId: 'device-victim', batteryLevel: 5 });
    });

    expect(error.message).toMatch(/does not match authenticated device/);
    expect(received).toEqual([]);
  });

  it('attributes an unlabelled heartbeat to the authenticated device', async () => {
    const client = await connect({ token: deviceToken('device-delta') });

    await new Promise<any>((resolve) => {
      client.on('heartbeatAccepted', resolve);
      client.emit('deviceHeartbeat', { batteryLevel: 42 });
    });

    expect(received).toEqual([{ event: 'deviceHeartbeat', deviceId: 'device-delta' }]);
  });

  it('does not let an admin socket emit device events', async () => {
    const client = await connect({ token: adminToken() });

    const error = await new Promise<any>((resolve) => {
      client.on('authError', resolve);
      client.emit('deviceHeartbeat', { deviceId: 'device-alpha' });
    });

    expect(error.message).toMatch(/not authenticated as a device/);
    expect(received).toEqual([]);
  });

  it('puts an admin socket in the admins room and no device room', async () => {
    const client = await connect({ token: adminToken() });

    const rooms = await new Promise<string[]>((resolve) => {
      client.on('rooms', resolve);
      client.emit('whichRooms');
    });

    expect(rooms).toEqual(['admins']);
  });
});

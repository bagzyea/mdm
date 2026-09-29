import type { Server as SocketIOServer, Socket } from 'socket.io';
import { AuthService } from '../services/authService';
import { getDeviceAccess, DeviceAccess } from '../services/devicePresence';
import logger from '../logger';
import { deviceRoom } from './registry';

/**
 * Socket.IO authentication (finding F-03).
 *
 * The device channel previously had no enforced authentication. No `io.use()`
 * middleware existed: the Android client sent its token in the handshake and the
 * server never read it. Authentication was attempted only inside the `deviceIdentify`
 * event, where the token was optional, the legacy bare-string form was accepted, and
 * the token's identity was never compared to the claimed device ID. Every other device
 * event — heartbeat, message, commandResponse, deviceStatusUpdate, provisioningProgress
 * — trusted the `deviceId` in its own payload with no check at all.
 *
 * The consequence was that an unauthenticated socket could join any device's room and
 * receive that device's queued commands (including Wi-Fi credentials and lock
 * messages), mark any device ACTIVE, forge heartbeats and GPS locations, and report
 * false command results. Device tokens do carry the device ID in their `userId` claim;
 * the server simply never checked it, so a legitimate token from one tablet could
 * impersonate every other tablet.
 *
 * This module is the single implementation of both halves of the fix, imported by
 * src/server.ts and exercised directly by src/__tests__/socketAuthentication.test.ts.
 */

const authService = new AuthService();

export interface SocketAuthOptions {
  authService?: AuthService;
  /** Looks up whether a device may connect. Defaults to the database check. */
  deviceAccess?: (deviceId: string) => Promise<DeviceAccess>;
}

/**
 * Handshake middleware. Establishes the socket's identity once, from the signed token,
 * and pins it onto `socket.data` where the client cannot influence it. A connection
 * without a valid token is refused outright.
 *
 * A device token is also checked against the device's current state. A valid signature
 * is not enough: an access token outlives an administrator suspending, wiping or
 * retiring the device, and before this check such a device could keep connecting — and
 * its heartbeats marked it ACTIVE again — until the token expired.
 */
export function createSocketAuthMiddleware(options: SocketAuthOptions = {}) {
  const service = options.authService ?? authService;
  const deviceAccess = options.deviceAccess ?? getDeviceAccess;

  return async function socketAuthMiddleware(
    socket: Socket,
    next: (err?: Error) => void
  ): Promise<void> {
    const handshakeToken = socket.handshake.auth?.token;
    const headerToken = socket.handshake.headers?.authorization?.split(' ')[1];
    const token = typeof handshakeToken === 'string' ? handshakeToken : headerToken;

    if (!token) {
      logger.warn({ socketId: socket.id }, 'Socket rejected: no token in handshake');
      return next(new Error('AUTHENTICATION_REQUIRED'));
    }

    try {
      const decoded = service.verifyToken(token);

      socket.data.role = decoded.role;
      socket.data.userId = decoded.userId;

      if (decoded.role === 'DEVICE') {
        // Device tokens carry the device ID in the userId claim. This is the only
        // source of a socket's device identity from here on — never the event payload.
        socket.data.deviceId = decoded.userId;
      }
    } catch {
      logger.warn({ socketId: socket.id }, 'Socket rejected: invalid token');
      return next(new Error('AUTHENTICATION_FAILED'));
    }

    if (socket.data.deviceId) {
      try {
        const access = await deviceAccess(socket.data.deviceId);
        if (access !== 'allowed') {
          logger.warn(
            { socketId: socket.id, deviceId: socket.data.deviceId, access },
            'Socket rejected: device is not permitted to connect'
          );
          return next(new Error('DEVICE_REVOKED'));
        }
      } catch (error) {
        logger.error(error, 'Socket rejected: device access check failed');
        return next(new Error('AUTHENTICATION_FAILED'));
      }
    }

    return next();
  };
}

/**
 * Resolve the device a socket is allowed to act as.
 *
 * Returns the authenticated device ID, or `null` if the socket is not a device or the
 * payload names a different device — in which case the caller must ignore the event.
 * Passing no `claimedDeviceId` is valid and yields the authenticated identity, so
 * events need not carry a device ID at all.
 */
export function resolveDeviceId(socket: Socket, claimedDeviceId?: unknown): string | null {
  const authenticatedDeviceId = socket.data.deviceId as string | undefined;

  if (!authenticatedDeviceId) {
    socket.emit('authError', { message: 'This socket is not authenticated as a device' });
    return null;
  }

  if (typeof claimedDeviceId === 'string' && claimedDeviceId !== authenticatedDeviceId) {
    logger.warn(
      { socketId: socket.id, authenticatedDeviceId, claimedDeviceId },
      'Device impersonation attempt rejected'
    );
    socket.emit('authError', { message: 'deviceId does not match authenticated device' });
    return null;
  }

  return authenticatedDeviceId;
}

/**
 * Room membership follows from the authenticated identity rather than from a
 * client-sent event, so a socket can only ever be in its own device's room.
 */
export function joinIdentityRooms(socket: Socket): void {
  if (socket.data.role === 'DEVICE') {
    socket.join(deviceRoom(socket.data.deviceId));
  } else {
    socket.join('admins');
  }
}

/** Install handshake authentication on a Socket.IO server. */
export function installSocketAuth(io: SocketIOServer, options?: SocketAuthOptions): void {
  io.use(createSocketAuthMiddleware(options));
}

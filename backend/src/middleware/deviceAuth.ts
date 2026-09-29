import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { AuthService } from '../services/authService';
import { getDeviceAccess, DeviceAccess } from '../services/devicePresence';
import logger from '../logger';

/**
 * Authentication and authorization for the agent's own HTTP calls.
 *
 * The agent's offline path — periodic poll, FCM wake, HTTP heartbeat — previously had
 * nothing to talk to. Its endpoints either did not exist or sat behind
 * `authenticateToken`, which looks the caller up as a *user*; a device token has no user
 * row, so every call was refused with 401.
 *
 * Device routes share URL prefixes with the operator API (`/api/devices`,
 * `/api/commands`), and one path — `POST /api/devices/:deviceId/heartbeat` — exists on
 * both. So this guard claims only requests that carry a valid DEVICE token, and passes
 * everything else on to the operator router with `next('router')`.
 *
 * Once claimed, a request may act only as the device named in its token, and only while
 * that device is not suspended, wiped, retired or deleted.
 */

export interface RequireDeviceOptions {
  authService?: AuthService;
  deviceAccess?: (deviceId: string) => Promise<DeviceAccess>;
}

/** The authenticated device for this request, set by `requireDevice`. */
export function authenticatedDeviceId(res: Response): string {
  return res.locals.deviceId as string;
}

export function requireDevice(options: RequireDeviceOptions = {}) {
  const authService = options.authService ?? new AuthService();
  const deviceAccess = options.deviceAccess ?? getDeviceAccess;

  // Named so src/__tests__/routeAuthorization.test.ts recognises it as a guard.
  return async function requireDeviceMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return next('router');

    let deviceId: string;
    try {
      const decoded = authService.verifyToken(token);
      if (decoded.role !== 'DEVICE') return next('router');
      deviceId = decoded.userId;
    } catch {
      // An expired or otherwise invalid token that claims to be a device's gets a 401,
      // which the agent's HTTP client treats as "refresh and retry". The unverified
      // claim only selects the error response; it grants nothing. Anything else is left
      // for the operator router to answer.
      const unverified = jwt.decode(token);
      if (unverified && typeof unverified === 'object' && unverified.role === 'DEVICE') {
        res.status(401).json({ error: 'Device token expired or invalid', code: 'DEVICE_TOKEN_INVALID' });
        return;
      }
      return next('router');
    }

    const claimed = req.params.deviceId;
    if (typeof claimed === 'string' && claimed !== deviceId) {
      logger.warn({ deviceId, claimed, path: req.path }, 'Device attempted to act as another device');
      res.status(403).json({ error: 'deviceId does not match authenticated device', code: 'DEVICE_MISMATCH' });
      return;
    }

    try {
      const access = await deviceAccess(deviceId);
      if (access !== 'allowed') {
        res.status(403).json({
          error: 'This device is no longer permitted to connect',
          code: 'DEVICE_REVOKED'
        });
        return;
      }
    } catch (error) {
      return next(error);
    }

    res.locals.deviceId = deviceId;
    next();
  };
}

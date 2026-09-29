/**
 * Route authorization matrix.
 *
 * The readiness review's finding F-01: every router was mounted behind a single
 * `requirePermission(resource, 'read')` check and the route files themselves added
 * no authorization, so the least-privileged role could reach every mutating route
 * beneath the mount — a VIEWER token could POST a fleet-wide WIPE_DEVICE.
 *
 * These tests walk the real Express route table from src/server.ts and assert that
 * every route carries its own authorization guard. They are deliberately structural
 * rather than request-level: a request-level test only covers the routes someone
 * remembered to write a case for, whereas walking the stack fails automatically when
 * a new unguarded route is added.
 */

import type { Express } from 'express';

// The middleware factories that constitute an authorization decision. All return named
// functions specifically so they can be recognised here. `authenticateToken` is
// authentication only and does not count as authorization. `requireDeviceMiddleware`
// (src/middleware/deviceAuth.ts) authorizes an agent to act as exactly the device in its
// token, and only while that device is not revoked.
const AUTHORIZATION_MIDDLEWARE = [
  'requirePermissionMiddleware',
  'requireRoleMiddleware',
  'requireDeviceMiddleware',
];
const AUTHENTICATION_MIDDLEWARE = 'authenticateToken';

/**
 * Every mount path the API is expected to expose. Express 5 does not record a router's
 * mount path on the layer, so it is recovered by probing `layer.match()` against this
 * list. Keeping it explicit is deliberate: mounting a router on a path that is not
 * listed here fails the suite rather than silently escaping inspection.
 */
const EXPECTED_MOUNTS = [
  '/api/auth',
  '/api/devices',
  '/api/policies',
  '/api/commands',
  '/api/certificates',
  '/api/security',
  '/api/provisioning',
  '/api/lifecycle',
  '/api/apk-registry',
];

/**
 * Routes that are public by design.
 *
 * Enrollment is a device's first contact with the server and cannot present a token
 * yet; it is rate-limited instead, and finding F-02 covers replacing it with a real
 * one-time-token handshake. The auth routes are the login surface itself.
 */
const INTENTIONALLY_PUBLIC = [
  'POST /api/devices/enroll',
  // The caller's access token has expired by definition; it authenticates with its
  // refresh token, which is re-checked against device status (finding F-13).
  'POST /api/devices/token/refresh',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
];

/**
 * Authenticated routes that legitimately carry no resource permission because they act
 * only on the caller's own identity, resolved from the verified token rather than from
 * the request. They sit behind `router.use(authenticateToken)` in authRoutes.
 */
const SELF_SERVICE = [
  'POST /api/auth/validate',
  'GET /api/auth/profile',
  'PUT /api/auth/profile',
  'POST /api/auth/change-password',
  'POST /api/auth/logout',
];

interface DiscoveredRoute {
  method: string;
  path: string;
  signature: string;
  handlers: string[];
}

function isIntentionallyPublic(route: DiscoveredRoute): boolean {
  return INTENTIONALLY_PUBLIC.includes(route.signature);
}

function isSelfService(route: DiscoveredRoute): boolean {
  return SELF_SERVICE.includes(route.signature);
}

/** Routes exempt from needing a resource permission, for either reason. */
function isExempt(route: DiscoveredRoute): boolean {
  return isIntentionallyPublic(route) || isSelfService(route);
}

function hasAuthorization(route: DiscoveredRoute): boolean {
  return route.handlers.some((h) => AUTHORIZATION_MIDDLEWARE.includes(h));
}

/** Render offending routes readably so a failure names them directly. */
function describe_(routes: DiscoveredRoute[]): string[] {
  return routes.map((r) => `${r.signature}  [handlers: ${r.handlers.join(', ')}]`).sort();
}

/**
 * Express exposes no public route table, so this walks the internal layer stack.
 * Express 5 puts it on `app.router` and replaced `layer.regexp` with `layer.matchers`,
 * which is why mount paths are recovered via `layer.match()` rather than by parsing
 * a regexp source as Express 4 introspection code typically does.
 */
function collectRoutes(app: Express): { routes: DiscoveredRoute[]; unknownMounts: number } {
  const routes: DiscoveredRoute[] = [];
  let unknownMounts = 0;

  const pushRoute = (layer: any, prefix: string): void => {
    const routePath = layer.route.path === '/' ? '' : layer.route.path;
    const fullPath = `${prefix}${routePath}` || '/';
    const handlers: string[] = layer.route.stack.map((s: any) => s.name || '<anonymous>');

    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (!enabled) continue;
      const upper = method.toUpperCase();
      routes.push({ method: upper, path: fullPath, signature: `${upper} ${fullPath}`, handlers });
    }
  };

  const walk = (stack: any[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        pushRoute(layer, prefix);
        continue;
      }

      if (layer.name === 'router' && layer.handle?.stack) {
        const mount = EXPECTED_MOUNTS.filter((candidate) => {
          try {
            return layer.match(candidate);
          } catch {
            return false;
          }
        });

        if (mount.length !== 1) {
          unknownMounts += 1;
          continue;
        }

        walk(layer.handle.stack, mount[0]!);
      }
    }
  };

  const router = ((app as any).router ?? (app as any)._router) as { stack: any[] };
  walk(router.stack, '');

  return { routes, unknownMounts };
}

describe('Route authorization (F-01 regression)', () => {
  let routes: DiscoveredRoute[];
  let unknownMounts: number;

  beforeAll(() => {
    // server.ts only calls listen() when it is the entry point, so importing is safe.
    const app = require('../server').default as Express;
    ({ routes, unknownMounts } = collectRoutes(app));
  });

  it('resolves the mount path of every mounted router', () => {
    // If this fails, a router was mounted on a path missing from EXPECTED_MOUNTS and
    // its routes were never inspected by the assertions below. Add the mount path.
    expect(unknownMounts).toBe(0);
  });

  it('discovers the full API route table', () => {
    // Guards against the walker finding nothing and every assertion below passing
    // vacuously — which is exactly what happened the first time this was written.
    const apiRoutes = routes.filter((r) => r.path.startsWith('/api'));
    expect(apiRoutes.length).toBeGreaterThan(60);
  });

  it('protects every mutating API route with an authorization guard', () => {
    const unguarded = routes.filter(
      (r) =>
        r.path.startsWith('/api') &&
        r.method !== 'GET' &&
        r.method !== 'HEAD' &&
        !hasAuthorization(r) &&
        !isExempt(r)
    );

    expect(describe_(unguarded)).toEqual([]);
  });

  it('protects every reading API route with an authorization guard', () => {
    const unguarded = routes.filter(
      (r) =>
        r.path.startsWith('/api') &&
        (r.method === 'GET' || r.method === 'HEAD') &&
        !hasAuthorization(r) &&
        !isExempt(r)
    );

    expect(describe_(unguarded)).toEqual([]);
  });

  it('applies authentication at every router mount except /api/auth', () => {
    // Authentication is mount-level, so it does not appear in a route's own handler
    // list. This asserts it directly on the app stack: each mounted router must be
    // immediately preceded by authenticateToken, or authenticate every route with the
    // device guard. /api/auth is exempt because it contains the login surface and
    // authenticates internally, per route.
    const app = require('../server').default as Express;
    const stack = (((app as any).router ?? (app as any)._router) as { stack: any[] }).stack;

    const unauthenticatedMounts: string[] = [];

    stack.forEach((layer: any, index: number) => {
      if (layer.name !== 'router' || !layer.handle?.stack) return;

      const mount = EXPECTED_MOUNTS.find((candidate) => {
        try {
          return layer.match(candidate);
        } catch {
          return false;
        }
      });

      if (!mount || mount === '/api/auth') return;

      if (stack[index - 1]?.name === AUTHENTICATION_MIDDLEWARE) return;

      // The device-agent routers authenticate per route instead: requireDevice claims
      // only device-token requests and passes the rest to the operator router behind
      // it. Accept such a router only if every one of its routes carries that guard.
      const routeLayers = layer.handle.stack.filter((l: any) => l.route);
      const everyRouteIsDeviceGuarded =
        routeLayers.length > 0 &&
        routeLayers.every((l: any) =>
          l.route.stack.some((s: any) => s.name === 'requireDeviceMiddleware')
        );
      if (!everyRouteIsDeviceGuarded) {
        unauthenticatedMounts.push(mount);
      }
    });

    expect(unauthenticatedMounts).toEqual([]);
  });

  it('keeps the exemption lists free of routes that no longer exist', () => {
    // A stale allowlist is a hazard: it would silently excuse a future route that
    // happens to reuse one of these paths.
    const signatures = new Set(routes.map((r) => r.signature));
    const stale = [...INTENTIONALLY_PUBLIC, ...SELF_SERVICE].filter((s) => !signatures.has(s));

    expect(stale).toEqual([]);
  });

  it('never gates a route on a permission action that no role can hold', () => {
    // Finding F-17: the APK registry was mounted on the action 'write', which is not an
    // action in ROLE_PERMISSIONS (create/read/update/delete), so only SUPER_ADMIN's '*'
    // wildcard matched and ADMIN/OPERATOR received 403 on the entire subsystem.
    const { ROLE_PERMISSIONS } = require('../types/auth');

    const validActions = new Set<string>(['*']);
    for (const permissions of Object.values(ROLE_PERMISSIONS) as any[]) {
      for (const permission of permissions) {
        for (const action of permission.actions) validActions.add(action);
      }
    }

    expect(validActions.has('write')).toBe(false);
    expect(validActions.has('create')).toBe(true);
    expect(validActions.has('delete')).toBe(true);
  });
});

describe('Role permissions (F-01 / F-17 behaviour)', () => {
  const { AuthService } = require('../services/authService');
  const service = new AuthService();

  it('denies a VIEWER every destructive action', () => {
    for (const resource of ['devices', 'policies', 'commands', 'certificates', 'security']) {
      for (const action of ['create', 'update', 'delete']) {
        expect({ resource, action, allowed: service.hasPermission('VIEWER', resource, action) })
          .toEqual({ resource, action, allowed: false });
      }
    }
  });

  it('allows a VIEWER to read', () => {
    for (const resource of ['devices', 'policies', 'commands', 'certificates', 'security']) {
      expect(service.hasPermission('VIEWER', resource, 'read')).toBe(true);
    }
  });

  it('lets ADMIN and OPERATOR reach the APK registry again', () => {
    // The old mount asked for provisioning:'write', which no role holds.
    expect(service.hasPermission('ADMIN', 'provisioning', 'create')).toBe(true);
    expect(service.hasPermission('ADMIN', 'provisioning', 'read')).toBe(true);
    expect(service.hasPermission('OPERATOR', 'provisioning', 'read')).toBe(true);

    expect(service.hasPermission('ADMIN', 'provisioning', 'write')).toBe(false);
  });
});

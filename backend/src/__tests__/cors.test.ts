import { buildCorsPolicy, corsOriginCallback } from '../config/cors';

/**
 * The CORS allowlist decides which web origins may drive the census fleet using an
 * operator's logged-in session. The rules that matter:
 *
 *   - production never widens on its own, and refuses to start with an empty list;
 *   - development accepts private-network addresses so the dashboard works when opened
 *     from another machine on the office LAN;
 *   - "private network" means RFC1918 on the dashboard port — not "any address", and
 *     not a public address that merely looks private.
 */
describe('CORS policy', () => {
  describe('production', () => {
    const prod = (extra: NodeJS.ProcessEnv = {}) =>
      buildCorsPolicy({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://mdm.uboscare.com',
        ...extra,
      });

    it('allows a configured origin', () => {
      expect(prod().isAllowedOrigin('https://mdm.uboscare.com')).toBe(true);
    });

    it('rejects an origin that is not configured', () => {
      expect(prod().isAllowedOrigin('https://evil.example')).toBe(false);
    });

    it('does NOT allow private LAN addresses', () => {
      const policy = prod();
      expect(policy.privateLanAllowed).toBe(false);
      expect(policy.isAllowedOrigin('http://192.168.1.40:5002')).toBe(false);
      expect(policy.isAllowedOrigin('http://10.0.0.5:5002')).toBe(false);
    });

    it('does not silently add localhost', () => {
      expect(prod().isAllowedOrigin('http://localhost:5002')).toBe(false);
    });

    it('refuses to start when no allowlist is configured', () => {
      expect(() => buildCorsPolicy({ NODE_ENV: 'production' })).toThrow(
        /ALLOWED_ORIGINS must be set in production/
      );
    });

    it('accepts CORS_ORIGIN as an alias so existing deployments keep working', () => {
      const policy = buildCorsPolicy({
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://mdm.uboscare.com',
      });
      expect(policy.isAllowedOrigin('https://mdm.uboscare.com')).toBe(true);
    });
  });

  describe('development', () => {
    const dev = (extra: NodeJS.ProcessEnv = {}) =>
      buildCorsPolicy({ NODE_ENV: 'development', ...extra });

    it('allows the dashboard on loopback', () => {
      expect(dev().isAllowedOrigin('http://localhost:5002')).toBe(true);
      expect(dev().isAllowedOrigin('http://127.0.0.1:5002')).toBe(true);
    });

    it.each([
      'http://192.168.1.40:5002',
      'http://10.0.0.5:5002',
      'http://172.16.4.9:5002',
      'http://172.31.255.254:5002',
    ])('allows RFC1918 origin %s', (origin) => {
      expect(dev().isAllowedOrigin(origin)).toBe(true);
    });

    it.each([
      // 172.15 and 172.32 sit just outside the RFC1918 block — a common regex slip.
      'http://172.15.0.1:5002',
      'http://172.32.0.1:5002',
      // Public addresses must never pass, even in development.
      'http://8.8.8.8:5002',
      'http://203.0.113.7:5002',
    ])('rejects non-RFC1918 origin %s', (origin) => {
      expect(dev().isAllowedOrigin(origin)).toBe(false);
    });

    it('rejects a private address on a port that is not the dashboard port', () => {
      expect(dev().isAllowedOrigin('http://192.168.1.40:9999')).toBe(false);
    });

    it('rejects https on a private address, since the dev dashboard is http', () => {
      expect(dev().isAllowedOrigin('https://192.168.1.40:5002')).toBe(false);
    });

    it('honours DASHBOARD_PORT', () => {
      const policy = dev({ DASHBOARD_PORT: '4000' });
      expect(policy.isAllowedOrigin('http://192.168.1.40:4000')).toBe(true);
      expect(policy.isAllowedOrigin('http://192.168.1.40:5002')).toBe(false);
    });

    it('does not let a private address appear elsewhere in the origin', () => {
      expect(dev().isAllowedOrigin('http://evil.example/192.168.1.1:5002')).toBe(false);
      expect(dev().isAllowedOrigin('http://192.168.1.1:5002.evil.example')).toBe(false);
    });
  });

  describe('requests with no Origin header', () => {
    it('are permitted — they are not a CORS case', () => {
      // Device agents, curl and same-origin navigations send no Origin. Rejecting them
      // would break every tablet in the field.
      expect(buildCorsPolicy({ NODE_ENV: 'development' }).isAllowedOrigin(undefined)).toBe(true);
      expect(
        buildCorsPolicy({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.test' })
          .isAllowedOrigin(undefined)
      ).toBe(true);
    });
  });

  describe('origin callback', () => {
    it('reports disallowed origins without throwing', () => {
      const callback = corsOriginCallback(
        buildCorsPolicy({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.test' })
      );
      const seen: Array<[Error | null, boolean | undefined]> = [];
      callback('https://evil.example', (err, allow) => seen.push([err, allow]));
      // An Error here would surface as a 500 and hide the cause from the browser console.
      expect(seen).toEqual([[null, false]]);
    });

    it('reports allowed origins', () => {
      const callback = corsOriginCallback(
        buildCorsPolicy({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.test' })
      );
      const seen: Array<[Error | null, boolean | undefined]> = [];
      callback('https://a.test', (err, allow) => seen.push([err, allow]));
      expect(seen).toEqual([[null, true]]);
    });
  });
});

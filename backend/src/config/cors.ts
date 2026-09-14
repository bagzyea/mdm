/**
 * Origins permitted to call the API and open a socket.
 *
 * The original development branch was a hardcoded list of localhost ports that did not
 * include the dashboard's own port (5002) or any LAN address. Served from another
 * machine — which is how it is actually used — every API call and every socket
 * connection was blocked by the browser: the page loaded and nothing in it worked.
 *
 * A `CORS_ORIGIN` variable was already being set in the environment and read by nothing;
 * the production branch looked for `ALLOWED_ORIGINS` instead. Both names are accepted so
 * an existing deployment keeps working.
 *
 * Note that this process runs inside a container. Enumerating the host's addresses with
 * os.networkInterfaces() does not work here: it reports the Docker bridge address
 * (172.18.x.x), never the LAN address an operator actually browses to. The host address
 * cannot be discovered from in here at all, so development matches any private-network
 * address on the dashboard port rather than pinning one IP that breaks the moment DHCP
 * moves the host.
 *
 * Production gets no such latitude: the allowlist must be set explicitly or the server
 * refuses to start. A wildcard would let any site on the internet drive the census fleet
 * using an operator's logged-in session.
 */

export interface CorsPolicy {
  /** Exact origins always permitted. */
  allowedOrigins: string[];
  /** True when private-network origins on the dashboard port are also permitted. */
  privateLanAllowed: boolean;
  dashboardPort: number;
  isAllowedOrigin: (origin?: string) => boolean;
}

/** RFC1918 ranges only, and only on the given port. */
const privateLanPattern = (port: number): RegExp =>
  new RegExp(
    '^http://(?:' +
      '10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}' +
      '|192\\.168\\.\\d{1,3}\\.\\d{1,3}' +
      '|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}' +
      `):${port}$`
  );

export function buildCorsPolicy(env: NodeJS.ProcessEnv = process.env): CorsPolicy {
  const configuredOrigins = (env.ALLOWED_ORIGINS ?? env.CORS_ORIGIN ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const isProduction = env.NODE_ENV === 'production';
  const dashboardPort = Number(env.DASHBOARD_PORT ?? 5002);

  const allowedOrigins = Array.from(
    new Set(
      isProduction
        ? configuredOrigins
        : [
            ...configuredOrigins,
            `http://localhost:${dashboardPort}`,
            `http://127.0.0.1:${dashboardPort}`,
            'http://localhost:3000',
            'http://localhost:5000',
            'http://localhost:8080',
          ]
    )
  );

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error(
      'ALLOWED_ORIGINS must be set in production. Refusing to start with no CORS allowlist.'
    );
  }

  const lanPattern = privateLanPattern(dashboardPort);

  return {
    allowedOrigins,
    privateLanAllowed: !isProduction,
    dashboardPort,
    isAllowedOrigin(origin?: string): boolean {
      // No Origin header: same-origin navigation, curl, or a device agent. Not a CORS case.
      if (!origin) return true;
      if (allowedOrigins.includes(origin)) return true;
      return !isProduction && lanPattern.test(origin);
    },
  };
}

/**
 * Express/Socket.IO origin callback.
 *
 * Rejects by withholding the header rather than throwing: an exception here surfaces as a
 * 500 and hides the real cause from whoever is reading the browser console.
 */
export const corsOriginCallback = (policy: CorsPolicy) => (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => callback(null, policy.isAllowedOrigin(origin));

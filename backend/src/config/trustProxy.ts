/**
 * Which proxies may tell us a client's real address (Express `trust proxy`).
 *
 * Since 15 Oct 2026 nginx terminates TLS in front of the backend and forwards to the
 * container through Docker, so every request arrives from the Docker bridge gateway
 * (172.18.0.1 on this host). Without this setting `req.ip` was that gateway for
 * everyone: all clients shared one rate-limit allowance (5 enrolments a minute for the
 * whole fleet) and the audit log recorded the proxy, not the person.
 *
 * Only named addresses are trusted. `true` would trust any client's own
 * X-Forwarded-For header, letting a caller choose the address it is logged and
 * rate-limited under, so it is refused.
 *
 * TRUST_PROXY: unset or "false" = off; a hop count ("1"); or a comma-separated list
 * of addresses, subnets or Express names ("172.18.0.1", "loopback, uniquelocal").
 */
export function parseTrustProxy(raw: string | undefined): false | number | string[] {
  const value = (raw ?? '').trim();
  if (value === '' || value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') {
    throw new Error('TRUST_PROXY=true would trust any client-supplied address; name the proxy instead');
  }
  if (/^\d+$/.test(value)) return Number(value);
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

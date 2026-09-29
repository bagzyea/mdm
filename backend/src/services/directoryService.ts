import { Client } from 'ldapts';
import logger from '../logger';

/**
 * Sign-in against the organisation's Active Directory.
 *
 * The same directory and conventions as the Asset Management System (AMS
 * backend/src/services/ldapService.ts): bind as the person themselves — as a UPN
 * (name@domain) or as DOMAIN\username — and, on success, read their own entry with that
 * session. No service account is needed; the directory refuses anonymous binds.
 *
 * AD only establishes *who* someone is. What they may do in MDM still comes from an MDM
 * user account (see AuthService.login), so a domain login alone grants nothing unless
 * LDAP_AUTO_PROVISION_ROLE is set.
 *
 * Configuration, all optional; directory sign-in is off unless AD_SERVER is set:
 *   AD_SERVER, AD_DOMAIN (NetBIOS, e.g. UBOS0), AD_BASE_DN, AD_PORT, AD_USE_LDAPS,
 *   LDAP_AUTO_PROVISION_ROLE (e.g. VIEWER; unset means unknown AD users are refused)
 */

const INVALID_CREDENTIALS = 49;

export interface DirectoryConfig {
  server: string;
  domain: string;
  baseDn: string;
  port: number;
  useLdaps: boolean;
}

export function directoryConfig(env: NodeJS.ProcessEnv = process.env): DirectoryConfig | null {
  const server = env.AD_SERVER?.trim();
  if (!server) return null;
  const useLdaps = env.AD_USE_LDAPS === 'true';
  return {
    server,
    domain: env.AD_DOMAIN?.trim() || '',
    baseDn: env.AD_BASE_DN?.trim() || '',
    port: Number(env.AD_PORT ?? (useLdaps ? 636 : 389)),
    useLdaps
  };
}

export interface DirectoryIdentity {
  sAMAccountName?: string;
  email?: string;
  userPrincipalName?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

export type DirectoryResult =
  | { ok: true; identity: DirectoryIdentity }
  | { ok: false; reason: 'disabled' | 'invalid' | 'unreachable' };

const escapeFilter = (value: string): string =>
  value.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

const first = (value: unknown): string | undefined => {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === undefined || v === null) return undefined;
  const s = Buffer.isBuffer(v) ? v.toString('utf8') : String(v);
  return s.trim() || undefined;
};

/** The bind names to try for what the person typed, most specific first. */
export function bindCandidates(identifier: string, domain: string): string[] {
  const id = identifier.trim();
  if (id.includes('\\')) return [id]; // already DOMAIN\user
  if (id.includes('@')) {
    const local = id.split('@')[0]!;
    return domain ? [id, `${domain}\\${local}`] : [id];
  }
  return domain ? [`${domain}\\${id}`] : [id];
}

export async function authenticateWithDirectory(
  identifier: string,
  password: string,
  config: DirectoryConfig | null = directoryConfig()
): Promise<DirectoryResult> {
  if (!config) return { ok: false, reason: 'disabled' };
  // An empty password is an unauthenticated bind, which many directories accept.
  if (!identifier.trim() || !password) return { ok: false, reason: 'invalid' };

  const url = `ldap${config.useLdaps ? 's' : ''}://${config.server}:${config.port}`;
  let unreachable = false;

  for (const bindDn of bindCandidates(identifier, config.domain)) {
    const client = new Client({ url, connectTimeout: 5000, timeout: 5000, strictDN: false });
    try {
      await client.bind(bindDn, password);

      const identity: DirectoryIdentity = {};
      const account = identifier.includes('\\') ? identifier.split('\\')[1]! : identifier;
      const esc = escapeFilter(account.trim());
      if (config.baseDn) {
        try {
          const { searchEntries } = await client.search(config.baseDn, {
            scope: 'sub',
            filter: `(&(objectClass=user)(|(sAMAccountName=${esc})(userPrincipalName=${esc})(mail=${esc})))`,
            attributes: ['sAMAccountName', 'mail', 'userPrincipalName', 'givenName', 'sn', 'displayName'],
            sizeLimit: 2
          });
          const entry = searchEntries[0];
          if (entry) {
            const put = <K extends keyof DirectoryIdentity>(key: K, value: string | undefined) => {
              if (value !== undefined) identity[key] = value;
            };
            put('sAMAccountName', first(entry.sAMAccountName));
            put('email', first(entry.mail));
            put('userPrincipalName', first(entry.userPrincipalName));
            put('firstName', first(entry.givenName));
            put('lastName', first(entry.sn));
            put('displayName', first(entry.displayName));
          }
        } catch (error) {
          // The bind succeeded, so the password is right; a failed lookup only costs detail.
          logger.warn({ err: error, bindDn }, 'Directory lookup after bind failed');
        }
      }
      if (!identity.sAMAccountName && !account.includes('@')) identity.sAMAccountName = account.trim();
      if (!identity.email && account.includes('@')) identity.email = account.trim();
      return { ok: true, identity };
    } catch (error: any) {
      if (error?.code !== INVALID_CREDENTIALS) {
        unreachable = true;
        logger.error({ err: error?.message ?? String(error), url }, 'Directory unreachable during sign-in');
      }
    } finally {
      await client.unbind().catch(() => {});
    }
  }

  return { ok: false, reason: unreachable ? 'unreachable' : 'invalid' };
}

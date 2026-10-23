/**
 * The UBOS Google accounts that may unlock a tablet after a factory reset (policy rule
 * `factoryResetProtectionAccounts`, applied by the agent as Device Owner).
 *
 * Android needs each account's numeric Google account ID, not its email: an email is
 * accepted by the platform and matches nobody, which would leave a reset tablet that no
 * one can unlock. Mirrors the agent's ResetProtection.kt rules.
 */
export interface ParsedAccountIds {
  ids: string[];
  /** Entries that are not account IDs, with the reason. */
  problems: string[];
}

const ACCOUNT_ID = /^\d{5,32}$/;
export const MAX_RESET_PROTECTION_ACCOUNTS = 10;

export function parseGoogleAccountIds(text: string): ParsedAccountIds {
  const entries = [...new Set(text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean))];
  const problems: string[] = [];
  for (const entry of entries) {
    if (entry.includes('@')) problems.push(`${entry} is an email address; use the account's numeric ID`);
    else if (!ACCOUNT_ID.test(entry)) problems.push(`${entry} is not a Google account ID (5 to 32 digits)`);
  }
  if (entries.length > MAX_RESET_PROTECTION_ACCOUNTS) {
    problems.push(`at most ${MAX_RESET_PROTECTION_ACCOUNTS} accounts`);
  }
  return { ids: entries.filter((e) => ACCOUNT_ID.test(e)), problems };
}

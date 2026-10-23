/**
 * Per-account sign-in throttle.
 *
 * Sign-in accepts UBOS domain accounts, and each attempt is checked against Active
 * Directory. Nothing limited repeated wrong passwords for one account: the per-address
 * rate limit is useless against an attacker who changes address, and behind nginx it
 * saw every client as the same proxy. Guessing was therefore unlimited, and enough
 * failures could trip AD's own lockout and lock a member of staff out of every UBOS
 * system, not just MDM.
 *
 * After `maxFailures` wrong attempts for one account within `windowMs`, further
 * attempts are refused for `lockMs` **without contacting AD**. A success clears the
 * count. Variants of one account (`jdoe`, `UBOS0\jdoe`, `jdoe@ubos.local`) share a count.
 *
 * In memory: correct for the single backend instance this system runs (ARCHITECTURE.md,
 * "Single instance only"); a restart forgets the counts.
 */

export interface ThrottleOptions {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
  /** Bound on remembered accounts, so random usernames cannot grow memory without limit. */
  maxEntries: number;
}

interface Entry {
  failures: number[];
  lockedUntil: number;
}

export class LoginThrottledError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Too many failed sign-in attempts for this account. Try again later.');
    this.name = 'LoginThrottledError';
  }
}

/** One key per person, however they typed their name. */
export function accountKey(identifier: string): string {
  let key = identifier.trim().toLowerCase();
  const slash = key.lastIndexOf('\\');
  if (slash >= 0) key = key.slice(slash + 1);
  const at = key.indexOf('@');
  if (at > 0) key = key.slice(0, at);
  return key;
}

export class LoginThrottle {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly options: ThrottleOptions,
    private readonly now: () => number = Date.now
  ) {}

  /** @throws LoginThrottledError while the account is paused. */
  assertAllowed(identifier: string): void {
    const entry = this.entries.get(accountKey(identifier));
    const now = this.now();
    if (entry && entry.lockedUntil > now) {
      throw new LoginThrottledError(Math.ceil((entry.lockedUntil - now) / 1000));
    }
  }

  recordFailure(identifier: string): void {
    const key = accountKey(identifier);
    const now = this.now();
    const entry = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };

    entry.failures = entry.failures.filter((t) => now - t < this.options.windowMs);
    entry.failures.push(now);
    if (entry.failures.length >= this.options.maxFailures) {
      entry.lockedUntil = now + this.options.lockMs;
      entry.failures = [];
    }

    // Re-insert so iteration order is least recently failed first, then evict from there.
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  recordSuccess(identifier: string): void {
    this.entries.delete(accountKey(identifier));
  }
}

const minutes = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return (Number.isFinite(value) && value > 0 ? value : fallback) * 60 * 1000;
};

export const loginThrottle = new LoginThrottle({
  maxFailures: Number(process.env.LOGIN_MAX_FAILURES) || 5,
  windowMs: minutes('LOGIN_FAILURE_WINDOW_MINUTES', 15),
  lockMs: minutes('LOGIN_LOCK_MINUTES', 15),
  maxEntries: 10_000,
});

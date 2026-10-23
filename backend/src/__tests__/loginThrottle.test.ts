/**
 * Per-account sign-in throttle and proxy trust (15 Oct 2026).
 *
 * MDM became reachable through nginx. Behind the proxy every client had one address, so
 * the per-address limit protected nothing, and repeated wrong passwords for a domain
 * account went to Active Directory without limit, where they could trip AD's lockout.
 */

const mockPrisma: any = {
  user: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  refreshToken: { create: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock('../db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma, closeDatabase: jest.fn() }));

const mockDirectory = jest.fn();
jest.mock('../services/directoryService', () => ({
  ...jest.requireActual('../services/directoryService'),
  authenticateWithDirectory: (...args: unknown[]) => mockDirectory(...args),
}));

import { AuthService } from '../services/authService';
import { LoginThrottle, LoginThrottledError, accountKey } from '../services/loginThrottle';
import { parseTrustProxy } from '../config/trustProxy';

const options = { maxFailures: 3, windowMs: 60_000, lockMs: 300_000, maxEntries: 100 };

describe('LoginThrottle', () => {
  it('pauses an account after repeated failures, then lets it try again', () => {
    let now = 0;
    const throttle = new LoginThrottle(options, () => now);
    for (let i = 0; i < 3; i++) throttle.recordFailure('jdoe');

    expect(() => throttle.assertAllowed('jdoe')).toThrow(LoginThrottledError);
    now += 300_001;
    expect(() => throttle.assertAllowed('jdoe')).not.toThrow();
  });

  it('forgets failures older than the window', () => {
    let now = 0;
    const throttle = new LoginThrottle(options, () => now);
    throttle.recordFailure('jdoe');
    throttle.recordFailure('jdoe');
    now += 60_001;
    throttle.recordFailure('jdoe');
    expect(() => throttle.assertAllowed('jdoe')).not.toThrow();
  });

  it('counts every spelling of one account together', () => {
    expect(accountKey('UBOS0\\JDoe')).toBe('jdoe');
    expect(accountKey('jdoe@ubos.local')).toBe('jdoe');
    const throttle = new LoginThrottle(options, () => 0);
    throttle.recordFailure('jdoe');
    throttle.recordFailure('UBOS0\\jdoe');
    throttle.recordFailure('jdoe@ubos.org');
    expect(() => throttle.assertAllowed('JDOE')).toThrow(LoginThrottledError);
  });

  it('clears the count on success and keeps other accounts unaffected', () => {
    const throttle = new LoginThrottle(options, () => 0);
    throttle.recordFailure('jdoe');
    throttle.recordFailure('jdoe');
    throttle.recordSuccess('jdoe');
    throttle.recordFailure('jdoe');
    expect(() => throttle.assertAllowed('jdoe')).not.toThrow();
    expect(() => throttle.assertAllowed('asmith')).not.toThrow();
  });

  it('remembers a bounded number of accounts', () => {
    const throttle = new LoginThrottle({ ...options, maxFailures: 1, maxEntries: 2 }, () => 0);
    ['a', 'b', 'c'].forEach((u) => throttle.recordFailure(u));
    expect(() => throttle.assertAllowed('a')).not.toThrow(); // evicted
    expect(() => throttle.assertAllowed('c')).toThrow(LoginThrottledError);
  });
});

describe('AuthService.login with the throttle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockDirectory.mockResolvedValue({ ok: false, reason: 'invalid' });
  });

  it('stops asking Active Directory once an account is paused', async () => {
    const service = new AuthService();
    for (let i = 0; i < 5; i++) {
      await expect(service.login({ username: 'victim', password: `guess-${i}` })).rejects.toThrow('Invalid credentials');
    }
    expect(mockDirectory).toHaveBeenCalledTimes(5);

    await expect(service.login({ username: 'UBOS0\\victim', password: 'guess-6' })).rejects.toBeInstanceOf(
      LoginThrottledError
    );
    expect(mockDirectory).toHaveBeenCalledTimes(5);
  });

  it('does not count an attempt when the directory could not be reached', async () => {
    const service = new AuthService();
    mockDirectory.mockResolvedValue({ ok: false, reason: 'unreachable' });
    for (let i = 0; i < 6; i++) {
      await expect(service.login({ username: 'offline-case', password: 'pw' })).rejects.toThrow(/could not be reached/);
    }
  });
});

describe('parseTrustProxy', () => {
  it('is off unless set', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('accepts named proxies and hop counts', () => {
    expect(parseTrustProxy('172.18.0.1')).toEqual(['172.18.0.1']);
    expect(parseTrustProxy('loopback, uniquelocal')).toEqual(['loopback', 'uniquelocal']);
    expect(parseTrustProxy('1')).toBe(1);
  });

  it('refuses to trust every client-supplied address', () => {
    expect(() => parseTrustProxy('true')).toThrow(/name the proxy/);
  });
});

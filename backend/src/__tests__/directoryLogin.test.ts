/**
 * Active Directory sign-in.
 *
 * AD proves who someone is; their MDM account decides what they may do. A domain login
 * with no MDM account is refused unless auto-provisioning is explicitly configured.
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
import { bindCandidates, directoryConfig } from '../services/directoryService';

const { authenticateWithDirectory: realDirectory } = jest.requireActual('../services/directoryService');

const adUser = {
  id: 'u-1',
  username: 'jdoe',
  email: 'jdoe@ubos.org',
  password: 'hash-of-unknown-local-password',
  firstName: 'J',
  lastName: 'Doe',
  role: 'ADMIN',
  isActive: true,
};

describe('directory helpers', () => {
  it('binds a bare name as DOMAIN\\name', () => {
    expect(bindCandidates('jdoe', 'UBOS0')).toEqual(['UBOS0\\jdoe']);
  });

  it('binds an email as a UPN first, then DOMAIN\\local-part', () => {
    expect(bindCandidates('jdoe@ubos.local', 'UBOS0')).toEqual(['jdoe@ubos.local', 'UBOS0\\jdoe']);
  });

  it('is off unless AD_SERVER is set', async () => {
    expect(directoryConfig({})).toBeNull();
    await expect(realDirectory('jdoe', 'pw', null)).resolves.toEqual({ ok: false, reason: 'disabled' });
  });

  it('never attempts an empty-password bind', async () => {
    const config = directoryConfig({ AD_SERVER: 'ad.invalid', AD_DOMAIN: 'X' });
    await expect(realDirectory('jdoe', '', config)).resolves.toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('AuthService.login with a directory', () => {
  const service = new AuthService();

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LDAP_AUTO_PROVISION_ROLE;
    jest.spyOn(service, 'verifyPassword').mockResolvedValue(false);
    mockPrisma.refreshToken.create.mockResolvedValue({});
  });

  it('signs an MDM user in with their AD password, keeping their MDM role', async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(adUser);
    mockDirectory.mockResolvedValue({ ok: true, identity: { sAMAccountName: 'jdoe', email: 'jdoe@ubos.org' } });

    const result = await service.login({ username: 'UBOS0\\jdoe', password: 'domain-pw' });

    expect(result.user).toMatchObject({ username: 'jdoe', role: 'ADMIN' });
    expect(result.token).toEqual(expect.any(String));
  });

  it('refuses a valid domain login that has no MDM account', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockDirectory.mockResolvedValue({ ok: true, identity: { sAMAccountName: 'stranger' } });

    await expect(service.login({ username: 'stranger', password: 'domain-pw' })).rejects.toThrow('Invalid credentials');
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('creates a VIEWER account only when auto-provisioning is configured', async () => {
    process.env.LDAP_AUTO_PROVISION_ROLE = 'VIEWER';
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(({ data }: any) => ({ id: 'u-9', isActive: true, ...data }));
    mockDirectory.mockResolvedValue({ ok: true, identity: { sAMAccountName: 'newperson', email: 'np@ubos.org' } });

    const result = await service.login({ username: 'newperson', password: 'domain-pw' });

    expect(mockPrisma.user.create.mock.calls[0][0].data).toMatchObject({ username: 'newperson', role: 'VIEWER' });
    expect(result.user).toMatchObject({ role: 'VIEWER' });
  });

  it('refuses a deactivated MDM account even with a correct AD password', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...adUser, isActive: false });
    mockDirectory.mockResolvedValue({ ok: true, identity: { sAMAccountName: 'jdoe' } });

    await expect(service.login({ username: 'jdoe', password: 'domain-pw' })).rejects.toThrow('Invalid credentials');
  });

  it('rejects wrong credentials everywhere with the same message', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(adUser);
    mockDirectory.mockResolvedValue({ ok: false, reason: 'invalid' });

    await expect(service.login({ username: 'jdoe', password: 'nope' })).rejects.toThrow(/^Invalid credentials$/);
  });
});

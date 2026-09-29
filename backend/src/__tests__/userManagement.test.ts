/**
 * Who may change whom.
 *
 * updateUser wrote the request body straight to the database, so an ADMIN could make
 * themselves (or anyone) SUPER_ADMIN, or write an unhashed password; registration let
 * an ADMIN create a SUPER_ADMIN outright.
 */

const mockPrisma: any = {
  user: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock('../db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma, closeDatabase: jest.fn() }));

import { AuthService, UserManagementError } from '../services/authService';
import { updateUserSchema } from '../schemas/authSchemas';

const admin = { userId: 'u-admin', role: 'ADMIN' };
const superAdmin = { userId: 'u-super', role: 'SUPER_ADMIN' };
const user = (over: Record<string, unknown> = {}) => ({
  id: 'u-target', role: 'VIEWER', isActive: true, password: 'hash', email: 't@x', ...over,
});

describe('user management rules', () => {
  const service = new AuthService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockImplementation(({ data }: any) => ({ ...user(), ...data }));
  });

  it('refuses an ADMIN granting SUPER_ADMIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user());
    await expect(service.updateUser('u-target', { role: 'SUPER_ADMIN' }, admin)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses an ADMIN promoting themselves', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user({ id: 'u-admin', role: 'ADMIN' }));
    await expect(service.updateUser('u-admin', { role: 'SUPER_ADMIN' }, admin)).rejects.toBeInstanceOf(UserManagementError);
  });

  it('refuses an ADMIN editing a SUPER_ADMIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user({ role: 'SUPER_ADMIN' }));
    await expect(service.updateUser('u-target', { isActive: false }, admin)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses deactivating or demoting yourself', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user({ id: 'u-super', role: 'SUPER_ADMIN' }));
    await expect(service.updateUser('u-super', { isActive: false }, superAdmin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses removing the last active SUPER_ADMIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user({ role: 'SUPER_ADMIN' }));
    mockPrisma.user.count.mockResolvedValue(0);
    await expect(service.deleteUser('u-target', superAdmin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('lets a SUPER_ADMIN demote another when one remains, and signs a deactivated user out', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user({ role: 'SUPER_ADMIN' }));
    mockPrisma.user.count.mockResolvedValue(1);

    await service.updateUser('u-target', { role: 'ADMIN', isActive: false }, superAdmin);

    expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual({ role: 'ADMIN', isActive: false });
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('writes only the editable fields, never a password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(user());
    await service.updateUser('u-target', { firstName: 'N', password: 'plain' } as any, admin);
    expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual({ firstName: 'N' });
  });

  it('refuses an ADMIN creating a SUPER_ADMIN', async () => {
    await expect(service.assertCanManage(admin, null, { role: 'SUPER_ADMIN' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.assertCanManage(admin, null, { role: 'OPERATOR' })).resolves.toBeUndefined();
  });

  it('refuses non-editable fields at the API edge', () => {
    // Same options as middleware/validation.ts.
    const opts = { abortEarly: false, stripUnknown: true, allowUnknown: false };
    expect(updateUserSchema.validate({ firstName: 'N', password: 'x' }, opts).error).toBeDefined();
    expect(updateUserSchema.validate({ firstName: 'N' }, opts).error).toBeUndefined();
  });
});

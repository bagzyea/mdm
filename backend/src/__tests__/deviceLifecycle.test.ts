/**
 * Transfers and retirement are multi-step writes.
 *
 * Transfer approval read the status, wrote it, then reassigned the device in three
 * more statements — two concurrent approvals both passed the check, and a failure
 * part-way left a transfer stuck IN_PROGRESS. Retirement did the same, and never cut
 * off the retired tablet's credentials or socket.
 */

import { Request, Response } from 'express';

const mockPrisma: any = {
  deviceTransfer: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  device: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  deviceRetirement: { create: jest.fn() },
  deviceEvent: { create: jest.fn() },
};
mockPrisma.$transaction = jest.fn((fn: (tx: any) => Promise<unknown>) => fn(mockPrisma));

jest.mock('../db', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
  closeDatabase: jest.fn(),
}));

const mockRevoke = jest.fn();
jest.mock('../services/enrollmentService', () => ({
  revokeDeviceTokens: (...args: unknown[]) => mockRevoke(...args),
}));

const mockDisconnect = jest.fn();
jest.mock('../socket/registry', () => ({
  disconnectDevice: (...args: unknown[]) => mockDisconnect(...args),
}));

import { approveDeviceTransfer, initiateDeviceRetirement } from '../controllers/deviceLifecycleController';

function mockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { status: jest.Mock; json: jest.Mock };
}

const pendingTransfer = {
  id: 't-1',
  deviceId: 'db-1',
  status: 'PENDING',
  transferNotes: null,
  toUserId: 'u-2',
  toUserEmail: 'b@example.com',
  toUserName: 'B',
  toDepartmentId: 'dep-2',
  toDepartmentName: 'District 2',
  fromUserEmail: 'a@example.com',
  device: { id: 'db-1' },
};

describe('transfer approval', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses the second of two concurrent approvals', async () => {
    mockPrisma.deviceTransfer.findUnique.mockResolvedValue(pendingTransfer);
    // The other approver's write landed first.
    mockPrisma.deviceTransfer.updateMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await approveDeviceTransfer(
      { params: { transferId: 't-1' }, body: { approved: true }, user: { userId: 'admin' } } as any,
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.device.update).not.toHaveBeenCalled();
  });

  it('claims, reassigns and completes in one transaction', async () => {
    mockPrisma.deviceTransfer.findUnique.mockResolvedValue(pendingTransfer);
    mockPrisma.deviceTransfer.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.deviceTransfer.update.mockResolvedValue({ ...pendingTransfer, status: 'COMPLETED' });

    const res = mockResponse();
    await approveDeviceTransfer(
      { params: { transferId: 't-1' }, body: { approved: true }, user: { userId: 'admin' } } as any,
      res
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.deviceTransfer.updateMany.mock.calls[0][0].where).toEqual({ id: 't-1', status: 'PENDING' });
    expect(mockPrisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'db-1' }, data: expect.objectContaining({ departmentId: 'dep-2' }) })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED' }));
  });
});

describe('retirement', () => {
  beforeEach(() => jest.clearAllMocks());

  const request = (body: Record<string, unknown>) =>
    ({ body, user: { userId: 'admin' } } as unknown as Request);

  it('revokes credentials and disconnects the retired tablet', async () => {
    mockPrisma.device.findUnique.mockResolvedValue({ id: 'db-1', deviceId: 'tab-1', isRetired: false, retirement: null });
    mockPrisma.device.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.deviceRetirement.create.mockResolvedValue({ id: 'r-1' });

    const res = mockResponse();
    await initiateDeviceRetirement(request({ deviceId: 'tab-1', retirementReason: 'Damaged' }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockRevoke).toHaveBeenCalledWith('tab-1', expect.any(String));
    expect(mockDisconnect).toHaveBeenCalledWith('tab-1', expect.any(String));
  });

  it('refuses a device retired concurrently, and revokes nothing twice', async () => {
    mockPrisma.device.findUnique.mockResolvedValue({ id: 'db-1', deviceId: 'tab-1', isRetired: false, retirement: null });
    mockPrisma.device.updateMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await initiateDeviceRetirement(request({ deviceId: 'tab-1', retirementReason: 'Damaged' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.deviceRetirement.create).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

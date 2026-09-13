import { Request, Response } from 'express';
import prisma from '../db';


// Device Lifecycle Management Controller

/**
 * Device Transfer/Migration Controller
 */

// Get all device transfers
export const getDeviceTransfers = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, status, deviceId } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (status) where.status = status;
    if (deviceId) where.deviceId = deviceId;

    const [transfers, total] = await Promise.all([
      prisma.deviceTransfer.findMany({
        where,
        include: {
          device: {
            select: {
              deviceId: true,
              model: true,
              manufacturer: true
            }
          }
        },
        orderBy: { requestedAt: 'desc' },
        skip: offset,
        take: Number(limit)
      }),
      prisma.deviceTransfer.count({ where })
    ]);

    res.json({
      data: transfers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching device transfers:', error);
    res.status(500).json({ error: 'Failed to fetch device transfers' });
  }
};

// Request device transfer
export const requestDeviceTransfer = async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      fromUserId,
      fromUserEmail,
      fromUserName,
      fromDepartmentId,
      fromDepartmentName,
      toUserId,
      toUserEmail,
      toUserName,
      toDepartmentId,
      toDepartmentName,
      transferReason,
      transferNotes
    } = req.body;

    // Validate device exists and is not retired
    const device = await prisma.device.findUnique({
      where: { deviceId },
      include: { retirement: true }
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    if (device.isRetired || device.retirement) {
      res.status(400).json({ error: 'Cannot transfer retired device' });
      return;
    }

    // Check for pending transfers
    const pendingTransfer = await prisma.deviceTransfer.findFirst({
      where: {
        deviceId: device.id,
        status: { in: ['PENDING', 'APPROVED', 'IN_PROGRESS'] }
      }
    });

    if (pendingTransfer) {
      res.status(409).json({ 
        error: 'Device has pending transfer request',
        transferId: pendingTransfer.id 
      });
      return;
    }

    // Create transfer request
    const transfer = await prisma.deviceTransfer.create({
      data: {
        deviceId: device.id,
        fromUserId,
        fromUserEmail,
        fromUserName,
        fromDepartmentId,
        fromDepartmentName,
        toUserId,
        toUserEmail,
        toUserName,
        toDepartmentId,
        toDepartmentName,
        transferReason,
        transferNotes,
        requestedBy: req.user?.userId || 'system'
      },
      include: {
        device: {
          select: {
            deviceId: true,
            model: true
          }
        }
      }
    });

    // Log transfer request event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'TRANSFER_REQUESTED',
        eventData: {
          transferId: transfer.id,
          fromUser: fromUserEmail,
          toUser: toUserEmail,
          fromDepartment: fromDepartmentName,
          toDepartment: toDepartmentName,
          reason: transferReason,
          requestedBy: req.user?.userId || 'system'
        }
      }
    });

    // TODO: Notify via WebSocket when available

    res.status(201).json(transfer);
    return;
  } catch (error) {
    console.error('Error requesting device transfer:', error);
    res.status(500).json({ error: 'Failed to request device transfer' });
    return;
  }
};

// Approve device transfer
export const approveDeviceTransfer = async (req: Request<{ transferId: string }>, res: Response) => {
  try {
    const { transferId } = req.params;

    if (!transferId) {
      res.status(400).json({ error: 'Transfer ID is required' });
      return;
    }

    const { approved, approvalNotes } = req.body;

    const transfer = await prisma.deviceTransfer.findUnique({
      where: { id: transferId },
      include: { device: true }
    });

    if (!transfer) {
      res.status(404).json({ error: 'Transfer request not found' });
      return;
    }

    if (transfer.status !== 'PENDING') {
      res.status(400).json({ error: 'Transfer request already processed' });
      return;
    }

    const newStatus = approved ? 'APPROVED' : 'REJECTED';
    const updatedTransfer = await prisma.deviceTransfer.update({
      where: { id: transferId },
      data: {
        status: newStatus,
        approvedBy: req.user?.userId || 'system',
        approvedAt: new Date(),
        transferNotes: approvalNotes ? 
          `${transfer.transferNotes || ''}\n\nApproval Notes: ${approvalNotes}`.trim() : 
          transfer.transferNotes
      }
    });

    // If approved, start transfer process
    if (approved) {
      await executeDeviceTransfer(transferId);
    }

    // Log approval event
    await prisma.deviceEvent.create({
      data: {
        deviceId: transfer.deviceId,
        eventType: approved ? 'TRANSFER_APPROVED' : 'TRANSFER_REJECTED',
        eventData: {
          transferId,
          approvedBy: req.user?.userId || 'system',
          approvalNotes
        }
      }
    });

    // TODO: Notify via WebSocket when available

    res.json(updatedTransfer);
    return;
  } catch (error) {
    console.error('Error processing transfer approval:', error);
    res.status(500).json({ error: 'Failed to process transfer approval' });
    return;
  }
};

// Execute device transfer (internal)
const executeDeviceTransfer = async (transferId: string) => {
  try {
    const transfer = await prisma.deviceTransfer.findUnique({
      where: { id: transferId },
      include: { device: true }
    });

    if (!transfer || transfer.status !== 'APPROVED') {
      throw new Error('Transfer not in approved status');
    }

    // Update transfer status to IN_PROGRESS
    await prisma.deviceTransfer.update({
      where: { id: transferId },
      data: { status: 'IN_PROGRESS' }
    });

    // Update device assignment
    await prisma.device.update({
      where: { id: transfer.device.id },
      data: {
        assignedUserId: transfer.toUserId,
        assignedUserEmail: transfer.toUserEmail,
        assignedUserName: transfer.toUserName,
        departmentId: transfer.toDepartmentId,
        departmentName: transfer.toDepartmentName
      }
    });

    // Complete transfer
    await prisma.deviceTransfer.update({
      where: { id: transferId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    // Log completion event
    await prisma.deviceEvent.create({
      data: {
        deviceId: transfer.device.id,
        eventType: 'TRANSFER_COMPLETED',
        eventData: {
          transferId,
          fromUser: transfer.fromUserEmail,
          toUser: transfer.toUserEmail,
          completedAt: new Date()
        }
      }
    });

    // TODO: Notify via WebSocket when available

    console.log(`Device transfer completed: ${transferId}`);
  } catch (error) {
    console.error('Error executing device transfer:', error);
    
    // Mark transfer as failed
    await prisma.deviceTransfer.update({
      where: { id: transferId },
      data: { status: 'CANCELLED' }
    }).catch(console.error);
  }
};

/**
 * Device Retirement Controller
 */

// Get device retirements
export const getDeviceRetirements = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, status, retirementType } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (status) where.status = status;
    if (retirementType) where.retirementType = retirementType;

    const [retirements, total] = await Promise.all([
      prisma.deviceRetirement.findMany({
        where,
        include: {
          device: {
            select: {
              deviceId: true,
              model: true,
              manufacturer: true,
              assignedUserEmail: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: Number(limit)
      }),
      prisma.deviceRetirement.count({ where })
    ]);

    res.json({
      data: retirements,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching device retirements:', error);
    res.status(500).json({ error: 'Failed to fetch device retirements' });
  }
};

// Initiate device retirement
export const initiateDeviceRetirement = async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      retirementReason,
      retirementType = 'STANDARD',
      dataWipeRequired = true,
      physicalReturn = false,
      notes
    } = req.body;

    // Validate device exists
    const device = await prisma.device.findUnique({
      where: { deviceId },
      include: { retirement: true }
    });

    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    if (device.isRetired || device.retirement) {
      res.status(400).json({ error: 'Device already retired' });
      return;
    }

    // Create retirement record
    const retirement = await prisma.deviceRetirement.create({
      data: {
        deviceId: device.id,
        retirementReason,
        retirementType,
        dataWipeRequired,
        physicalReturn,
        notes,
        retiredBy: req.user?.userId || 'system'
      },
      include: {
        device: {
          select: {
            deviceId: true,
            model: true
          }
        }
      }
    });

    // Mark device as retired
    await prisma.device.update({
      where: { id: device.id },
      data: {
        isRetired: true,
        retiredAt: new Date(),
        retiredBy: req.user?.userId || 'system',
        retiredReason: retirementReason
      }
    });

    // Log retirement event
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'RETIREMENT_INITIATED',
        eventData: {
          retirementId: retirement.id,
          retirementReason,
          retirementType,
          retiredBy: req.user?.userId || 'system'
        }
      }
    });

    // TODO: Notify via WebSocket when available

    res.status(201).json(retirement);
    return;
  } catch (error) {
    console.error('Error initiating device retirement:', error);
    res.status(500).json({ error: 'Failed to initiate device retirement' });
    return;
  }
};

// Update retirement status
export const updateRetirementStatus = async (req: Request<{ retirementId: string }>, res: Response) => {
  try {
    const { retirementId } = req.params;

    if (!retirementId) {
      res.status(400).json({ error: 'Retirement ID is required' });
      return;
    }

    const { status, notes, dataWipeCompleted, physicalReturnCompleted } = req.body;

    const retirement = await prisma.deviceRetirement.findUnique({
      where: { id: retirementId },
      include: { device: true }
    });

    if (!retirement) {
      res.status(404).json({ error: 'Retirement record not found' });
      return;
    }

    const updateData: any = { status };
    if (notes) updateData.notes = notes;
    if (dataWipeCompleted !== undefined) {
      updateData.dataWipeCompleted = dataWipeCompleted;
      if (dataWipeCompleted) updateData.dataWipeCompletedAt = new Date();
    }
    if (physicalReturnCompleted !== undefined) {
      updateData.physicalReturnCompleted = physicalReturnCompleted;
      if (physicalReturnCompleted) updateData.physicalReturnDate = new Date();
    }

    const updatedRetirement = await prisma.deviceRetirement.update({
      where: { id: retirementId },
      data: updateData
    });

    // Log status update event
    await prisma.deviceEvent.create({
      data: {
        deviceId: retirement.deviceId,
        eventType: 'RETIREMENT_STATUS_UPDATED',
        eventData: {
          retirementId,
          oldStatus: retirement.status,
          newStatus: status,
          updatedBy: req.user?.userId || 'system'
        }
      }
    });

    // TODO: Notify via WebSocket when available

    res.json(updatedRetirement);
    return;
  } catch (error) {
    console.error('Error updating retirement status:', error);
    res.status(500).json({ error: 'Failed to update retirement status' });
    return;
  }
};


/**
 * Department Management Controller
 */

// Get departments
export const getDepartments = async (req: Request, res: Response) => {
  try {
    const { includeInactive = false } = req.query;
    
    const where: any = {};
    if (includeInactive !== 'true') {
      where.isActive = true;
    }

    const departments = await prisma.department.findMany({
      where,
      include: {
        parent: {
          select: { id: true, name: true }
        },
        children: {
          select: { id: true, name: true, isActive: true }
        },
        _count: {
          select: { devices: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
};

// Create department
export const createDepartment = async (req: Request, res: Response) => {
  try {
    const departmentData = req.body;

    const department = await prisma.department.create({
      data: departmentData,
      include: {
        parent: {
          select: { id: true, name: true }
        }
      }
    });

    res.status(201).json(department);
  } catch (error) {
    console.error('Error creating department:', error);
    res.status(500).json({ error: 'Failed to create department' });
  }
};
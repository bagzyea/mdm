import { Request, Response } from 'express';
import { CreatePolicyRequest, UpdatePolicyRequest, PolicyRules } from '../types/policy';
import prisma from '../db';


// Get all policies with pagination and filtering
export const getAllPolicies = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, type, isActive } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [policies, total] = await Promise.all([
      prisma.policy.findMany({
        where,
        skip: offset,
        take: Number(limit),
        include: {
          devices: {
            select: {
              id: true,
              deviceId: true,
              manufacturer: true,
              model: true,
              status: true
            }
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ]
      }),
      prisma.policy.count({ where })
    ]);

    res.json({
      data: policies,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({ error: 'Failed to fetch policies' });
  }
};

// Get specific policy by ID
export const getPolicyById = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    
    const policy = await prisma.policy.findUnique({
      where: { id },
      include: {
        devices: {
          include: {
            commands: {
              where: {
                command: 'APPLY_POLICY'
              },
              take: 5,
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    if (!policy) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }

    res.json(policy);
  } catch (error) {
    console.error('Error fetching policy:', error);
    res.status(500).json({ error: 'Failed to fetch policy' });
  }
};

// Create new policy
export const createPolicy = async (req: Request, res: Response) => {
  try {
    const policyData: CreatePolicyRequest = req.body;
    
    // Validate policy rules based on type
    const validationError = validatePolicyRules(policyData.type, policyData.rules);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    // Create policy
    const policy = await prisma.policy.create({
      data: {
        name: policyData.name,
        description: policyData.description,
        type: policyData.type,
        rules: policyData.rules as any,
        targetDevices: policyData.targetDevices || [],
        priority: policyData.priority || 0,
        isActive: policyData.isActive ?? true
      }
    });

    // If target devices specified, apply policy to them
    if (policyData.targetDevices && policyData.targetDevices.length > 0) {
      await applyPolicyToDevices(policy.id, policyData.targetDevices);
    }

    // TODO: Add system-level audit logging for policy creation
    // Note: Removed DeviceEvent logging as it requires a valid deviceId

    res.status(201).json(policy);
  } catch (error) {
    console.error('Error creating policy:', error);
    res.status(500).json({ error: 'Failed to create policy' });
  }
};

// Update existing policy
export const updatePolicy = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const updates: UpdatePolicyRequest = req.body;

    // Check if policy exists
    const existingPolicy = await prisma.policy.findUnique({ where: { id } });
    if (!existingPolicy) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }

    // Validate rules if provided
    if (updates.rules) {
      const validationError = validatePolicyRules(existingPolicy.type, updates.rules);
      if (validationError) {
        res.status(400).json({ error: validationError });
        return;
      }
    }

    // Update policy
    const updatedPolicy = await prisma.policy.update({
      where: { id },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.description && { description: updates.description }),
        ...(updates.rules && { rules: updates.rules as any }),
        ...(updates.targetDevices && { targetDevices: updates.targetDevices }),
        ...(updates.priority !== undefined && { priority: updates.priority }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive })
      },
      include: {
        devices: true
      }
    });

    // If policy is active and has target devices, push updates
    if (updatedPolicy.isActive && updatedPolicy.devices.length > 0) {
      await pushPolicyUpdates(updatedPolicy.id, updatedPolicy.devices.map(d => d.id));
    }

    // TODO: Add system-level audit logging for policy updates
    // Note: Removed DeviceEvent logging as it requires a valid deviceId

    res.json(updatedPolicy);
  } catch (error) {
    console.error('Error updating policy:', error);
    res.status(500).json({ error: 'Failed to update policy' });
  }
};

// Delete policy
export const deletePolicy = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { force = false } = req.query;

    // Check if policy exists
    const policy = await prisma.policy.findUnique({
      where: { id },
      include: { devices: true }
    });

    if (!policy) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }

    // Check if policy is assigned to devices
    if (policy.devices.length > 0 && !force) {
      res.status(409).json({
        error: 'Policy is assigned to devices',
        message: 'Remove policy from all devices first or use force=true',
        assignedDevices: policy.devices.length
      });
      return;
    }

    // Remove policy from devices if force delete
    if (force && policy.devices.length > 0) {
      await removePolicyFromDevices(id, policy.devices.map(d => d.id));
    }

    // Delete policy
    await prisma.policy.delete({ where: { id } });

    // TODO: Add system-level audit logging for policy deletion
    // Note: Removed DeviceEvent logging as it requires a valid deviceId

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting policy:', error);
    res.status(500).json({ error: 'Failed to delete policy' });
  }
};

// Apply policy to specific devices
export const applyPolicyToDevice = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params; // policy ID
    const { deviceIds } = req.body;

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      res.status(400).json({ error: 'Device IDs must be a non-empty array' });
      return;
    }

    const policy = await prisma.policy.findUnique({ where: { id } });
    if (!policy) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }

    const devices = await prisma.device.findMany({
      where: { id: { in: deviceIds } }
    });

    if (devices.length !== deviceIds.length) {
      res.status(400).json({ error: 'Some device IDs are invalid' });
      return;
    }

    // Connect policy to devices
    await prisma.policy.update({
      where: { id },
      data: {
        devices: {
          connect: deviceIds.map(deviceId => ({ id: deviceId }))
        }
      }
    });

    // Send apply policy commands to devices
    await applyPolicyToDevices(id, deviceIds);

    res.json({
      message: `Policy applied to ${devices.length} devices`,
      appliedDevices: devices.map(d => ({
        id: d.id,
        deviceId: d.deviceId,
        manufacturer: d.manufacturer,
        model: d.model
      }))
    });
  } catch (error) {
    console.error('Error applying policy to devices:', error);
    res.status(500).json({ error: 'Failed to apply policy to devices' });
  }
};

// Helper function to validate policy rules
function validatePolicyRules(type: string, rules: PolicyRules): string | null {
  switch (type) {
    case 'SECURITY':
      if (rules.security) {
        if (rules.security.passwordMinLength && rules.security.passwordMinLength < 4) {
          return 'Password minimum length must be at least 4 characters';
        }
        if (rules.security.maxFailedAttempts && rules.security.maxFailedAttempts < 1) {
          return 'Max failed attempts must be at least 1';
        }
      }
      break;
    case 'NETWORK':
      if (rules.network?.vpnConfiguration) {
        if (!rules.network.vpnConfiguration.serverAddress) {
          return 'VPN server address is required when VPN is configured';
        }
      }
      break;
    case 'APPLICATION':
      if (rules.application?.kioskMode?.enabled) {
        if (!rules.application.kioskMode.allowedApps?.length) {
          return 'At least one app must be allowed in kiosk mode';
        }
      }
      break;
  }
  return null;
}

// Helper function to apply policy to devices
async function applyPolicyToDevices(policyId: string, deviceIds: string[]) {
  const commands = deviceIds.map(deviceId => ({
    deviceId,
    command: 'APPLY_POLICY',
    parameters: { policyId },
    status: 'PENDING' as const
  }));

  await prisma.remoteCommand.createMany({
    data: commands
  });

  // Log policy application events
  const events = deviceIds.map(deviceId => ({
    deviceId,
    eventType: 'POLICY_APPLIED',
    eventData: { policyId } as any
  }));

  await prisma.deviceEvent.createMany({
    data: events
  });
}

// Helper function to remove policy from devices
async function removePolicyFromDevices(policyId: string, deviceIds: string[]) {
  const commands = deviceIds.map(deviceId => ({
    deviceId,
    command: 'REMOVE_POLICY',
    parameters: { policyId },
    status: 'PENDING' as const
  }));

  await prisma.remoteCommand.createMany({
    data: commands
  });
}

// Helper function to push policy updates to devices
async function pushPolicyUpdates(policyId: string, deviceIds: string[]) {
  const commands = deviceIds.map(deviceId => ({
    deviceId,
    command: 'UPDATE_POLICY',
    parameters: { policyId },
    status: 'PENDING' as const
  }));

  await prisma.remoteCommand.createMany({
    data: commands
  });
}
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { SecurityStatus, ComplianceReport, ComplianceCheck, EncryptionPolicy } from '../types';
import { notificationService } from '../services/notificationService';
import logger from '../logger';

const prisma = new PrismaClient();

export const getSecurityStatus = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    let securityStatus = await prisma.securityStatus.findUnique({
      where: { deviceId: device.id }
    });
    
    if (!securityStatus) {
      // Create default security status
      securityStatus = await prisma.securityStatus.create({
        data: {
          deviceId: device.id,
          encryptionStatus: 'UNKNOWN',
          rootStatus: false,
          jailbreakDetected: false,
          complianceStatus: 'UNKNOWN'
        }
      });
    }
    
    res.json(securityStatus);
  } catch (error) {
    logger.error(error, 'Error fetching security status');
    res.status(500).json({ error: 'Failed to fetch security status' });
  }
};

export const updateSecurityStatus = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const securityData: Partial<SecurityStatus> = req.body;
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    let securityStatus = await prisma.securityStatus.findUnique({
      where: { deviceId: device.id }
    });
    
    if (securityStatus) {
      // Update existing security status
      securityStatus = await prisma.securityStatus.update({
        where: { deviceId: device.id },
        data: {
          ...securityData,
          lastSecurityScan: new Date()
        }
      });
    } else {
      // Create new security status
      securityStatus = await prisma.securityStatus.create({
        data: {
          deviceId: device.id,
          ...securityData,
          lastSecurityScan: new Date()
        }
      });
    }
    
    // Log security status update
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'SECURITY_STATUS_UPDATE',
        eventData: securityData as any
      }
    });

    // Send email alert for security violations (2.6)
    if (securityData.rootStatus) {
      notificationService.sendSecurityViolationAlert(deviceId!, 'Root access detected on device');
    }
    if (securityData.jailbreakDetected) {
      notificationService.sendSecurityViolationAlert(deviceId!, 'Jailbreak detected on device');
    }

    res.json(securityStatus);
  } catch (error) {
    logger.error(error, 'Error updating security status');
    res.status(500).json({ error: 'Failed to update security status' });
  }
};

export const runComplianceCheck = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const complianceCheck: ComplianceCheck = req.body;
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    // Run compliance checks based on requested types
    const complianceResults = await performComplianceChecks(device.id, complianceCheck.checkTypes);
    
    // Calculate overall compliance score
    const overallScore = calculateComplianceScore(complianceResults);
    const overallStatus = getComplianceStatus(overallScore);
    
    // Create compliance report
    const complianceReport = await prisma.complianceReport.create({
      data: {
        deviceId: device.id,
        reportType: 'OVERALL',
        status: overallStatus,
        score: overallScore,
        details: complianceResults,
        violations: complianceResults.violations || [],
        recommendations: complianceResults.recommendations || [],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expires in 24 hours
      }
    });
    
    // Update device security status
    await prisma.securityStatus.upsert({
      where: { deviceId: device.id },
      update: {
        complianceStatus: overallStatus,
        complianceScore: overallScore,
        lastComplianceCheck: new Date()
      },
      create: {
        deviceId: device.id,
        complianceStatus: overallStatus,
        complianceScore: overallScore,
        lastComplianceCheck: new Date()
      }
    });
    
    res.json(complianceReport);
  } catch (error) {
    logger.error(error, 'Error running compliance check');
    res.status(500).json({ error: 'Failed to run compliance check' });
  }
};

export const getComplianceReports = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { limit = 10, type } = req.query;
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    const whereClause: any = { deviceId: device.id };
    if (type) {
      whereClause.reportType = type;
    }
    
    const reports = await prisma.complianceReport.findMany({
      where: whereClause,
      orderBy: { generatedAt: 'desc' },
      take: parseInt(limit as string)
    });
    
    res.json(reports);
  } catch (error) {
    logger.error(error, 'Error fetching compliance reports');
    res.status(500).json({ error: 'Failed to fetch compliance reports' });
  }
};

export const enforceEncryptionPolicy = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    const encryptionPolicy: EncryptionPolicy = req.body;
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    // Update security status with encryption policy
    const securityStatus = await prisma.securityStatus.upsert({
      where: { deviceId: device.id },
      update: {
        encryptionStatus: encryptionPolicy.enabled ? 'FULLY_ENCRYPTED' : 'NOT_ENCRYPTED',
        encryptionType: encryptionPolicy.encryptionType,
        encryptionStrength: encryptionPolicy.encryptionStrength
      },
      create: {
        deviceId: device.id,
        encryptionStatus: encryptionPolicy.enabled ? 'FULLY_ENCRYPTED' : 'NOT_ENCRYPTED',
        encryptionType: encryptionPolicy.encryptionType,
        encryptionStrength: encryptionPolicy.encryptionStrength
      }
    });
    
    // Send encryption command to device
    const command = await prisma.remoteCommand.create({
      data: {
        deviceId: device.id,
        command: 'ENFORCE_ENCRYPTION',
        parameters: JSON.parse(JSON.stringify(encryptionPolicy)),
        status: 'PENDING'
      }
    });
    
    // Log encryption policy enforcement
    await prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'ENCRYPTION_POLICY_ENFORCED',
        eventData: JSON.parse(JSON.stringify(encryptionPolicy))
      }
    });
    
    res.json({
      message: 'Encryption policy enforced',
      securityStatus,
      command
    });
  } catch (error) {
    logger.error(error, 'Error enforcing encryption policy');
    res.status(500).json({ error: 'Failed to enforce encryption policy' });
  }
};

export const detectRootStatus = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    // Send root detection command to device
    const command = await prisma.remoteCommand.create({
      data: {
        deviceId: device.id,
        command: 'DETECT_ROOT_STATUS',
        parameters: {},
        status: 'PENDING'
      }
    });
    
    res.json({
      message: 'Root detection command sent',
      command
    });
  } catch (error) {
    logger.error(error, 'Error detecting root status');
    res.status(500).json({ error: 'Failed to detect root status' });
  }
};

// Helper functions
async function performComplianceChecks(deviceId: string, checkTypes: string[]) {
  const results: any = {
    checks: {},
    violations: [],
    recommendations: []
  };
  
  for (const checkType of checkTypes) {
    switch (checkType) {
      case 'SECURITY':
        results.checks.security = await performSecurityCheck(deviceId);
        break;
      case 'ENCRYPTION':
        results.checks.encryption = await performEncryptionCheck(deviceId);
        break;
      case 'CERTIFICATE':
        results.checks.certificate = await performCertificateCheck(deviceId);
        break;
      case 'ROOT_DETECTION':
        results.checks.rootDetection = await performRootDetectionCheck(deviceId);
        break;
      case 'PATCH_LEVEL':
        results.checks.patchLevel = await performPatchLevelCheck(deviceId);
        break;
    }
  }
  
  return results;
}

async function performSecurityCheck(deviceId: string) {
  const securityStatus = await prisma.securityStatus.findUnique({
    where: { deviceId }
  });
  
  const violations = [];
  const recommendations = [];
  
  if (securityStatus?.rootStatus) {
    violations.push('Device is rooted');
    recommendations.push('Remove root access and restore device to factory settings');
  }
  
  if (securityStatus?.jailbreakDetected) {
    violations.push('Jailbreak detected');
    recommendations.push('Remove jailbreak and restore device to factory settings');
  }
  
  return {
    status: violations.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
    violations,
    recommendations
  };
}

async function performEncryptionCheck(deviceId: string) {
  const securityStatus = await prisma.securityStatus.findUnique({
    where: { deviceId }
  });
  
  const violations = [];
  const recommendations = [];
  
  if (securityStatus?.encryptionStatus === 'NOT_ENCRYPTED') {
    violations.push('Device encryption not enabled');
    recommendations.push('Enable device encryption');
  } else if (securityStatus?.encryptionStatus === 'PARTIALLY_ENCRYPTED') {
    violations.push('Device partially encrypted');
    recommendations.push('Enable full device encryption');
  }
  
  return {
    status: violations.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
    violations,
    recommendations
  };
}

async function performCertificateCheck(deviceId: string) {
  const deviceCertificates = await prisma.deviceCertificate.findMany({
    where: { deviceId },
    include: { certificate: true }
  });
  
  const violations = [];
  const recommendations = [];
  
  for (const deviceCert of deviceCertificates) {
    if (deviceCert.status === 'EXPIRED') {
      violations.push(`Certificate ${deviceCert.certificate.name} is expired`);
      recommendations.push(`Renew certificate ${deviceCert.certificate.name}`);
    } else if (deviceCert.status === 'REVOKED') {
      violations.push(`Certificate ${deviceCert.certificate.name} is revoked`);
      recommendations.push(`Replace revoked certificate ${deviceCert.certificate.name}`);
    }
  }
  
  return {
    status: violations.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
    violations,
    recommendations
  };
}

async function performRootDetectionCheck(deviceId: string) {
  const securityStatus = await prisma.securityStatus.findUnique({
    where: { deviceId }
  });
  
  const violations = [];
  const recommendations = [];
  
  if (securityStatus?.rootStatus) {
    violations.push('Root access detected');
    recommendations.push('Remove root access and restore device security');
  }
  
  return {
    status: violations.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
    violations,
    recommendations
  };
}

async function performPatchLevelCheck(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId }
  });
  
  const violations = [];
  const recommendations = [];
  
  if (device?.androidVersion) {
    const version = parseInt(device.androidVersion.split('.')[0] ?? '0', 10);
    if (version < 11) {
      violations.push('Android version below minimum requirement (11)');
      recommendations.push('Update Android to version 11 or higher');
    }
  }
  
  return {
    status: violations.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
    violations,
    recommendations
  };
}

function calculateComplianceScore(results: any): number {
  const checks = Object.values(results.checks || {});
  if (checks.length === 0) return 0;
  
  const compliantChecks = checks.filter((check: any) => check.status === 'COMPLIANT').length;
  return Math.round((compliantChecks / checks.length) * 100);
}

function getComplianceStatus(score: number): 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIALLY_COMPLIANT' {
  if (score >= 90) return 'COMPLIANT';
  if (score >= 50) return 'PARTIALLY_COMPLIANT';
  return 'NON_COMPLIANT';
}

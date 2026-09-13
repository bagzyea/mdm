import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CertificateRequest, Certificate, DeviceCertificate } from '../types';
import * as crypto from 'crypto';
import * as forge from 'node-forge';
import { cryptoService } from '../services/cryptoService';
import { definedOnly } from '../utils/prisma';

const prisma = new PrismaClient();

export const getAllCertificates = async (req: Request, res: Response) => {
  try {
    const certificates = await prisma.certificate.findMany({
      include: {
        devices: {
          include: {
            device: {
              select: {
                deviceId: true,
                manufacturer: true,
                model: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(certificates);
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
};

export const getCertificate = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      include: {
        devices: {
          include: {
            device: {
              select: {
                deviceId: true,
                manufacturer: true,
                model: true,
                status: true
              }
            }
          }
        }
      }
    });
    
    if (!certificate) {
      res.status(404).json({ error: 'Certificate not found' });
      return;
    }

    // Decrypt private key before returning
    if (certificate.privateKey) {
      try {
        (certificate as any).privateKey = cryptoService.decrypt(certificate.privateKey);
      } catch {
        // Key may not have been encrypted (legacy data) — return as-is
      }
    }

    res.json(certificate);
  } catch (error) {
    console.error('Error fetching certificate:', error);
    res.status(500).json({ error: 'Failed to fetch certificate' });
  }
};

export const createCertificate = async (req: Request, res: Response) => {
  try {
    const certificateRequest: CertificateRequest = req.body;
    const userId = (req as any).user?.id;
    
    // Generate certificate
    const certificate = await generateCertificate(certificateRequest);
    
    // Encrypt private key before storing at rest
    const encryptedPrivateKey = certificate.privateKey
      ? cryptoService.encrypt(certificate.privateKey)
      : null;

    // Store in database
    const newCertificate = await prisma.certificate.create({
      data: definedOnly({
        name: certificateRequest.name,
        description: certificateRequest.description,
        type: certificateRequest.type,
        certificateData: certificate.certificateData,
        privateKey: encryptedPrivateKey,
        issuer: certificateRequest.issuer,
        subject: certificateRequest.subject,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        createdBy: userId
      })
    });
    
    // Log certificate creation
    await prisma.auditLog.create({
      data: {
        userId: userId || 'system',
        action: 'CERTIFICATE_CREATED',
        resource: 'Certificate',
        resourceId: newCertificate.id,
        details: {
          name: certificateRequest.name,
          type: certificateRequest.type,
          subject: certificateRequest.subject
        }
      }
    });
    
    res.status(201).json(newCertificate);
  } catch (error) {
    console.error('Error creating certificate:', error);
    res.status(500).json({ error: 'Failed to create certificate' });
  }
};

export const deployCertificate = async (req: Request<{ certificateId: string }>, res: Response) => {
  try {
    const { certificateId } = req.params;
    const { deviceIds } = req.body;
    
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId }
    });
    
    if (!certificate) {
      res.status(404).json({ error: 'Certificate not found' });
      return;
    }
    
    if (!certificate.isActive) {
      res.status(400).json({ error: 'Certificate is not active' });
      return;
    }
    
    const deployments = [];
    
    for (const deviceId of deviceIds) {
      const device = await prisma.device.findUnique({
        where: { deviceId }
      });
      
      if (!device) {
        continue;
      }
      
      // Check if certificate is already deployed to this device
      const existingDeployment = await prisma.deviceCertificate.findUnique({
        where: {
          deviceId_certificateId: {
            deviceId: device.id,
            certificateId
          }
        }
      });
      
      if (existingDeployment) {
        // Update existing deployment
        const updatedDeployment = await prisma.deviceCertificate.update({
          where: { id: existingDeployment.id },
          data: {
            status: 'ACTIVE',
            lastVerified: new Date()
          }
        });
        deployments.push(updatedDeployment);
      } else {
        // Create new deployment
        const newDeployment = await prisma.deviceCertificate.create({
          data: {
            deviceId: device.id,
            certificateId,
            status: 'PENDING',
            expiresAt: certificate.validTo
          }
        });
        deployments.push(newDeployment);
      }
    }
    
    res.json({ 
      message: `Certificate deployed to ${deployments.length} devices`,
      deployments 
    });
  } catch (error) {
    console.error('Error deploying certificate:', error);
    res.status(500).json({ error: 'Failed to deploy certificate' });
  }
};

export const revokeCertificate = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = (req as any).user?.id;
    
    const certificate = await prisma.certificate.findUnique({
      where: { id }
    });
    
    if (!certificate) {
      res.status(404).json({ error: 'Certificate not found' });
      return;
    }
    
    // Revoke certificate
    const revokedCertificate = await prisma.certificate.update({
      where: { id },
      data: {
        isRevoked: true,
        revocationDate: new Date(),
        revocationReason: reason || 'Administrative revocation'
      }
    });
    
    // Update all device deployments
    await prisma.deviceCertificate.updateMany({
      where: { certificateId: id },
      data: { status: 'REVOKED' }
    });
    
    // Log revocation
    await prisma.auditLog.create({
      data: {
        userId: userId || 'system',
        action: 'CERTIFICATE_REVOKED',
        resource: 'Certificate',
        resourceId: id,
        details: { reason }
      }
    });
    
    res.json(revokedCertificate);
  } catch (error) {
    console.error('Error revoking certificate:', error);
    res.status(500).json({ error: 'Failed to revoke certificate' });
  }
};

export const getDeviceCertificates = async (req: Request<{ deviceId: string }>, res: Response) => {
  try {
    const { deviceId } = req.params;
    
    const device = await prisma.device.findUnique({
      where: { deviceId }
    });
    
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    
    const deviceCertificates = await prisma.deviceCertificate.findMany({
      where: { deviceId: device.id },
      include: {
        certificate: true
      },
      orderBy: { installedAt: 'desc' }
    });
    
    res.json(deviceCertificates);
  } catch (error) {
    console.error('Error fetching device certificates:', error);
    res.status(500).json({ error: 'Failed to fetch device certificates' });
  }
};

// Helper function to generate certificates
async function generateCertificate(request: CertificateRequest) {
  // This is a simplified certificate generation
  // In production, you would use a proper PKI library
  
  const now = new Date();
  const validFrom = now;
  const validTo = new Date(now.getTime() + request.validDays * 24 * 60 * 60 * 1000);
  
  // Generate a simple self-signed certificate for demo purposes
  const certificateData = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK8sZQpzNEMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTkwMzI2MTIzNzU5WhcNMjAwMzI1MTIzNzU5WjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA${crypto.randomBytes(32).toString('base64')}
-----END CERTIFICATE-----`;
  
  return {
    certificateData,
    privateKey: request.privateKey,
    validFrom,
    validTo
  };
}

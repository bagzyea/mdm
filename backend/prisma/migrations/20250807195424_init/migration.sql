-- CreateEnum
CREATE TYPE "public"."DeviceStatus" AS ENUM ('ENROLLED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'WIPED');

-- CreateEnum
CREATE TYPE "public"."PolicyType" AS ENUM ('SECURITY', 'NETWORK', 'APPLICATION', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "public"."CommandStatus" AS ENUM ('PENDING', 'SENT', 'EXECUTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER', 'DEVICE');

-- CreateEnum
CREATE TYPE "public"."CertificateType" AS ENUM ('SSL_TLS', 'CLIENT_AUTH', 'CODE_SIGNING', 'ROOT_CA', 'INTERMEDIATE_CA', 'DEVICE_CA');

-- CreateEnum
CREATE TYPE "public"."CertificateStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."EncryptionStatus" AS ENUM ('UNKNOWN', 'NOT_ENCRYPTED', 'PARTIALLY_ENCRYPTED', 'FULLY_ENCRYPTED', 'ENCRYPTION_FAILED');

-- CreateEnum
CREATE TYPE "public"."ComplianceStatus" AS ENUM ('UNKNOWN', 'COMPLIANT', 'NON_COMPLIANT', 'PARTIALLY_COMPLIANT', 'PENDING');

-- CreateEnum
CREATE TYPE "public"."ComplianceReportType" AS ENUM ('SECURITY', 'ENCRYPTION', 'CERTIFICATE', 'ROOT_DETECTION', 'PATCH_LEVEL', 'OVERALL');

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "androidVersion" TEXT NOT NULL,
    "sdkVersion" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "public"."DeviceStatus" NOT NULL DEFAULT 'ENROLLED',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" JSONB,
    "assignedTo" TEXT,
    "batteryLevel" INTEGER,
    "isCharging" BOOLEAN NOT NULL DEFAULT false,
    "totalStorage" BIGINT,
    "availableStorage" BIGINT,
    "totalRAM" BIGINT,
    "availableRAM" BIGINT,
    "networkInfo" JSONB,
    "appUsageStats" JSONB,
    "systemHealth" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Policy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "public"."PolicyType" NOT NULL,
    "rules" JSONB NOT NULL,
    "targetDevices" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RemoteCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "parameters" JSONB,
    "status" "public"."CommandStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemoteCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Certificate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "public"."CertificateType" NOT NULL,
    "certificateData" TEXT NOT NULL,
    "privateKey" TEXT,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revocationDate" TIMESTAMP(3),
    "revocationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceCertificate" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "status" "public"."CertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastVerified" TIMESTAMP(3),

    CONSTRAINT "DeviceCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SecurityStatus" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "encryptionStatus" "public"."EncryptionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "encryptionType" TEXT,
    "encryptionStrength" INTEGER,
    "rootStatus" BOOLEAN NOT NULL DEFAULT false,
    "jailbreakDetected" BOOLEAN NOT NULL DEFAULT false,
    "securityPatchLevel" TEXT,
    "lastSecurityScan" TIMESTAMP(3),
    "complianceStatus" "public"."ComplianceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "complianceScore" INTEGER,
    "lastComplianceCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ComplianceReport" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "reportType" "public"."ComplianceReportType" NOT NULL,
    "status" "public"."ComplianceStatus" NOT NULL,
    "score" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "violations" JSONB,
    "recommendations" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ComplianceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "refreshToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_DeviceToPolicy" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DeviceToPolicy_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceId_key" ON "public"."Device"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_fingerprint_key" ON "public"."Device"("fingerprint");

-- CreateIndex
CREATE INDEX "Certificate_isActive_idx" ON "public"."Certificate"("isActive");

-- CreateIndex
CREATE INDEX "Certificate_validTo_idx" ON "public"."Certificate"("validTo");

-- CreateIndex
CREATE INDEX "DeviceCertificate_expiresAt_idx" ON "public"."DeviceCertificate"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCertificate_deviceId_certificateId_key" ON "public"."DeviceCertificate"("deviceId", "certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityStatus_deviceId_key" ON "public"."SecurityStatus"("deviceId");

-- CreateIndex
CREATE INDEX "ComplianceReport_deviceId_idx" ON "public"."ComplianceReport"("deviceId");

-- CreateIndex
CREATE INDEX "ComplianceReport_generatedAt_idx" ON "public"."ComplianceReport"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_resource_idx" ON "public"."AuditLog"("resource");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "public"."RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "public"."RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "public"."RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "public"."RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "_DeviceToPolicy_B_index" ON "public"."_DeviceToPolicy"("B");

-- AddForeignKey
ALTER TABLE "public"."RemoteCommand" ADD CONSTRAINT "RemoteCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceEvent" ADD CONSTRAINT "DeviceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceCertificate" ADD CONSTRAINT "DeviceCertificate_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceCertificate" ADD CONSTRAINT "DeviceCertificate_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "public"."Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SecurityStatus" ADD CONSTRAINT "SecurityStatus_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_DeviceToPolicy" ADD CONSTRAINT "_DeviceToPolicy_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_DeviceToPolicy" ADD CONSTRAINT "_DeviceToPolicy_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

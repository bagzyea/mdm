-- Reconcile the database the migrations build with schema.prisma.
--
-- Replaying the migrations on a fresh database produced a schema that differed from
-- schema.prisma, which is what the code is written against: the hot-path indexes
-- (heartbeat sweep, command queue, event history) existed only in the schema, transfer
-- and retirement statuses were TEXT rather than enums, and deleting a device did not
-- cascade to its commands and events.
--
-- Everything here preserves data and tolerates a database that already has some of it
-- (for instance one built with `prisma db push`): types are converted in place with a
-- cast, and objects are created only if missing. A row whose status is not a valid enum
-- value makes the cast fail and the whole migration roll back, rather than losing data.
--
-- AssetRecord and Device.assetTag are kept: schema.prisma declares them again, for the
-- planned Asset Management System integration (docs/plans/ams-integration.md).

-- Enums --------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RetirementStatus" AS ENUM ('INITIATED', 'APPROVED', 'DATA_WIPE_PENDING', 'DATA_WIPED', 'PHYSICAL_RETURN_PENDING', 'PHYSICAL_RETURNED', 'DISPOSED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RetirementType" AS ENUM ('STANDARD', 'EMERGENCY', 'END_OF_LIFE', 'DAMAGED', 'LOST_STOLEN', 'UPGRADE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "PolicyType" ADD VALUE IF NOT EXISTS 'HARDWARE';
ALTER TYPE "PolicyType" ADD VALUE IF NOT EXISTS 'SYSTEM';

-- Security and certificate tables ------------------------------------------------------
-- A fresh database gets these from the earlier migrations. The long-running database
-- this was written against never had them (its history was repaired by hand), so every
-- certificate, security-status and compliance endpoint failed there. Created only if
-- missing, so this is a no-op wherever they already exist.
DO $$ BEGIN
  CREATE TYPE "CertificateType" AS ENUM ('SSL_TLS', 'CLIENT_AUTH', 'CODE_SIGNING', 'ROOT_CA', 'INTERMEDIATE_CA', 'DEVICE_CA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CertificateStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "EncryptionStatus" AS ENUM ('UNKNOWN', 'NOT_ENCRYPTED', 'PARTIALLY_ENCRYPTED', 'FULLY_ENCRYPTED', 'ENCRYPTION_FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ComplianceStatus" AS ENUM ('UNKNOWN', 'COMPLIANT', 'NON_COMPLIANT', 'PARTIALLY_COMPLIANT', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ComplianceReportType" AS ENUM ('SECURITY', 'ENCRYPTION', 'CERTIFICATE', 'ROOT_DETECTION', 'PATCH_LEVEL', 'OVERALL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Certificate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CertificateType" NOT NULL,
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

CREATE TABLE IF NOT EXISTS "DeviceCertificate" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastVerified" TIMESTAMP(3),
    CONSTRAINT "DeviceCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SecurityStatus" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "encryptionStatus" "EncryptionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "encryptionType" TEXT,
    "encryptionStrength" INTEGER,
    "rootStatus" BOOLEAN NOT NULL DEFAULT false,
    "jailbreakDetected" BOOLEAN NOT NULL DEFAULT false,
    "securityPatchLevel" TEXT,
    "lastSecurityScan" TIMESTAMP(3),
    "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "complianceScore" INTEGER,
    "lastComplianceCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecurityStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ComplianceReport" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "reportType" "ComplianceReportType" NOT NULL,
    "status" "ComplianceStatus" NOT NULL,
    "score" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "violations" JSONB,
    "recommendations" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "ComplianceReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Certificate_isActive_idx" ON "Certificate"("isActive");
CREATE INDEX IF NOT EXISTS "Certificate_validTo_idx" ON "Certificate"("validTo");
CREATE INDEX IF NOT EXISTS "DeviceCertificate_expiresAt_idx" ON "DeviceCertificate"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceCertificate_deviceId_certificateId_key" ON "DeviceCertificate"("deviceId", "certificateId");
CREATE UNIQUE INDEX IF NOT EXISTS "SecurityStatus_deviceId_key" ON "SecurityStatus"("deviceId");
CREATE INDEX IF NOT EXISTS "ComplianceReport_deviceId_idx" ON "ComplianceReport"("deviceId");
CREATE INDEX IF NOT EXISTS "ComplianceReport_generatedAt_idx" ON "ComplianceReport"("generatedAt");
CREATE INDEX IF NOT EXISTS "APKRegistry_packageName_idx" ON "APKRegistry"("packageName");

DO $$ BEGIN
  ALTER TABLE "DeviceCertificate" ADD CONSTRAINT "DeviceCertificate_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DeviceCertificate" ADD CONSTRAINT "DeviceCertificate_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SecurityStatus" ADD CONSTRAINT "SecurityStatus_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status columns: TEXT -> enum, converted in place ------------------------------------
ALTER TABLE "DeviceTransfer" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DeviceTransfer"
  ALTER COLUMN "status" TYPE "TransferStatus" USING "status"::text::"TransferStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "DeviceRetirement" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DeviceRetirement" ALTER COLUMN "retirementType" DROP DEFAULT;
ALTER TABLE "DeviceRetirement"
  ALTER COLUMN "status" TYPE "RetirementStatus" USING "status"::text::"RetirementStatus",
  ALTER COLUMN "status" SET DEFAULT 'INITIATED',
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "retirementType" TYPE "RetirementType" USING "retirementType"::text::"RetirementType",
  ALTER COLUMN "retirementType" SET DEFAULT 'STANDARD',
  ALTER COLUMN "retirementType" SET NOT NULL;

-- Column definitions -------------------------------------------------------------------
ALTER TABLE "Device" ALTER COLUMN "purchaseCost" SET DATA TYPE DECIMAL(65,30);

UPDATE "ProvisioningApp" SET "autoStart" = false WHERE "autoStart" IS NULL;
ALTER TABLE "ProvisioningApp" ALTER COLUMN "autoStart" SET NOT NULL;

-- One retirement per device, as the schema's 1:1 relation assumes. Fails (and rolls back)
-- if duplicates exist, so they can be resolved by hand rather than silently.
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceRetirement_deviceId_key" ON "DeviceRetirement"("deviceId");
-- Redundant with the unique index above.
DROP INDEX IF EXISTS "DeviceRetirement_deviceId_idx";

-- The APK migration created this as a partial index; the schema declares a plain one.
DROP INDEX IF EXISTS "ProvisioningApp_profileId_apkId_key";
CREATE UNIQUE INDEX "ProvisioningApp_profileId_apkId_key" ON "ProvisioningApp"("profileId", "apkId");

-- Hot-path indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Device_lastSeen_idx" ON "Device"("lastSeen");
CREATE INDEX IF NOT EXISTS "Device_status_idx" ON "Device"("status");
CREATE INDEX IF NOT EXISTS "Device_provisioningStatus_idx" ON "Device"("provisioningStatus");
CREATE INDEX IF NOT EXISTS "DeviceEvent_createdAt_idx" ON "DeviceEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "DeviceEvent_deviceId_createdAt_idx" ON "DeviceEvent"("deviceId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeviceEvent_eventType_idx" ON "DeviceEvent"("eventType");
CREATE INDEX IF NOT EXISTS "DeviceRetirement_status_idx" ON "DeviceRetirement"("status");
CREATE INDEX IF NOT EXISTS "DeviceTransfer_status_idx" ON "DeviceTransfer"("status");
CREATE INDEX IF NOT EXISTS "RemoteCommand_status_idx" ON "RemoteCommand"("status");
CREATE INDEX IF NOT EXISTS "RemoteCommand_deviceId_status_idx" ON "RemoteCommand"("deviceId", "status");
CREATE INDEX IF NOT EXISTS "RemoteCommand_createdAt_idx" ON "RemoteCommand"("createdAt");

-- Deleting a device removes its commands and events ------------------------------------
ALTER TABLE "RemoteCommand" DROP CONSTRAINT IF EXISTS "RemoteCommand_deviceId_fkey";
ALTER TABLE "RemoteCommand" ADD CONSTRAINT "RemoteCommand_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceEvent" DROP CONSTRAINT IF EXISTS "DeviceEvent_deviceId_fkey";
ALTER TABLE "DeviceEvent" ADD CONSTRAINT "DeviceEvent_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AMS link: the lifecycle migration made the asset-tag index partial (WHERE NOT NULL).
-- A plain unique index is equivalent in Postgres (NULLs never collide) and is what the
-- schema declares.
DROP INDEX IF EXISTS "Device_assetTag_key";
CREATE UNIQUE INDEX "Device_assetTag_key" ON "Device"("assetTag");

-- Prisma maintains updatedAt itself; databases where the APK migration was repaired by
-- hand carry a column default the schema does not declare.
ALTER TABLE "APKDataFolder" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "APKRegistry" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "APKUploadSession" ALTER COLUMN "updatedAt" DROP DEFAULT;

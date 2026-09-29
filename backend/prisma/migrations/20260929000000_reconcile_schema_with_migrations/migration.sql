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
-- Deliberately NOT done, pending a decision: dropping the AssetRecord table and the
-- Device.assetTag column, which schema.prisma no longer declares but which may hold data
-- (AssetRecord appears to be the link to the asset-management system).

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

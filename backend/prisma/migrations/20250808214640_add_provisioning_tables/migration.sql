-- CreateEnum
CREATE TYPE "public"."ProvisioningSessionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED');

-- CreateEnum
CREATE TYPE "public"."ProvisioningDeviceStatus" AS ENUM ('NOT_PROVISIONED', 'PENDING', 'DOWNLOADING_APPS', 'INSTALLING_APPS', 'CONFIGURING_NETWORK', 'CONFIGURING_SECURITY', 'DEPLOYING_FILES', 'VALIDATING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."FilePackageType" AS ENUM ('CONFIG', 'FORM', 'DATA', 'CERTIFICATE', 'DOCUMENTATION', 'MEDIA', 'OTHER');

-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "deviceModel" TEXT,
ADD COLUMN     "lastProvisionedAt" TIMESTAMP(3),
ADD COLUMN     "provisioningStatus" "public"."ProvisioningDeviceStatus" NOT NULL DEFAULT 'NOT_PROVISIONED';

-- CreateTable
CREATE TABLE "public"."FieldConfiguration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deviceModels" TEXT[],
    "configurations" JSONB NOT NULL,
    "dataCollectionRules" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProvisioningProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deviceModels" TEXT[],
    "networkConfig" JSONB,
    "securityConfig" JSONB,
    "geographicRules" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "ProvisioningProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProvisioningApp" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "version" TEXT,
    "apkUrl" TEXT,
    "apkHash" TEXT,
    "requiredPermissions" TEXT[],
    "installOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProvisioningApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FilePackage" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileType" "public"."FilePackageType" NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileHash" TEXT,
    "targetPath" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "fileSize" BIGINT,

    CONSTRAINT "FilePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProvisioningSession" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."ProvisioningSessionStatus" NOT NULL DEFAULT 'PENDING',
    "deviceIds" TEXT[],
    "totalDevices" INTEGER NOT NULL DEFAULT 0,
    "completedDevices" INTEGER NOT NULL DEFAULT 0,
    "failedDevices" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProvisioningProgress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "public"."ProvisioningDeviceStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" TEXT,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "logs" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProvisioningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QualityControlResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PASSED',
    "notes" TEXT,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityControlResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldConfiguration_isActive_idx" ON "public"."FieldConfiguration"("isActive");

-- CreateIndex
CREATE INDEX "FieldConfiguration_createdBy_idx" ON "public"."FieldConfiguration"("createdBy");

-- CreateIndex
CREATE INDEX "ProvisioningProfile_isActive_idx" ON "public"."ProvisioningProfile"("isActive");

-- CreateIndex
CREATE INDEX "ProvisioningApp_profileId_idx" ON "public"."ProvisioningApp"("profileId");

-- CreateIndex
CREATE INDEX "FilePackage_profileId_idx" ON "public"."FilePackage"("profileId");

-- CreateIndex
CREATE INDEX "ProvisioningSession_status_idx" ON "public"."ProvisioningSession"("status");

-- CreateIndex
CREATE INDEX "ProvisioningSession_createdBy_idx" ON "public"."ProvisioningSession"("createdBy");

-- CreateIndex
CREATE INDEX "ProvisioningProgress_sessionId_idx" ON "public"."ProvisioningProgress"("sessionId");

-- CreateIndex
CREATE INDEX "ProvisioningProgress_deviceId_idx" ON "public"."ProvisioningProgress"("deviceId");

-- CreateIndex
CREATE INDEX "ProvisioningProgress_status_idx" ON "public"."ProvisioningProgress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningProgress_sessionId_deviceId_key" ON "public"."ProvisioningProgress"("sessionId", "deviceId");

-- CreateIndex
CREATE INDEX "QualityControlResult_sessionId_idx" ON "public"."QualityControlResult"("sessionId");

-- CreateIndex
CREATE INDEX "QualityControlResult_deviceId_idx" ON "public"."QualityControlResult"("deviceId");

-- CreateIndex
CREATE INDEX "QualityControlResult_status_idx" ON "public"."QualityControlResult"("status");

-- CreateIndex
CREATE UNIQUE INDEX "QualityControlResult_sessionId_deviceId_key" ON "public"."QualityControlResult"("sessionId", "deviceId");

-- AddForeignKey
ALTER TABLE "public"."ProvisioningApp" ADD CONSTRAINT "ProvisioningApp_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."ProvisioningProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FilePackage" ADD CONSTRAINT "FilePackage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."ProvisioningProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProvisioningSession" ADD CONSTRAINT "ProvisioningSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."ProvisioningProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProvisioningProgress" ADD CONSTRAINT "ProvisioningProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ProvisioningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProvisioningProgress" ADD CONSTRAINT "ProvisioningProgress_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QualityControlResult" ADD CONSTRAINT "QualityControlResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ProvisioningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QualityControlResult" ADD CONSTRAINT "QualityControlResult_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

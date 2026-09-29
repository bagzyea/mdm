-- Migration: Add Flexible APK Management System
-- This migration adds the enhanced schema for dynamic APK selection and data folder management

-- Create APK Registry table
CREATE TYPE "APKCategory" AS ENUM (
  'CENSUS',
  'PRODUCTIVITY', 
  'UTILITY',
  'COMMUNICATION',
  'MEDIA',
  'EDUCATION',
  'GOVERNMENT',
  'CUSTOM'
);

CREATE TYPE "DataFolderType" AS ENUM (
  'FORMS',
  'DATA',
  'CONFIG', 
  'ASSETS',
  'TEMPLATES',
  'LOOKUP_TABLES',
  'GIS_DATA',
  'CERTIFICATES'
);

CREATE TYPE "UploadSessionStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

-- APK Registry table
CREATE TABLE "APKRegistry" (
    "id" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "category" "APKCategory" NOT NULL,
    "version" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "minSdkVersion" INTEGER NOT NULL DEFAULT 21,
    "targetSdkVersion" INTEGER NOT NULL DEFAULT 33,
    "fileSize" BIGINT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "icon" TEXT,
    "screenshots" TEXT[],
    "permissions" TEXT[],
    "features" TEXT[],
    "supportedDeviceModels" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "APKRegistry_pkey" PRIMARY KEY ("id")
);

-- APK Data Folders table
CREATE TABLE "APKDataFolder" (
    "id" TEXT NOT NULL,
    "apkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "folderType" "DataFolderType" NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "folderSize" BIGINT,
    "fileCount" INTEGER,
    "checksum" TEXT,
    "geographicScope" TEXT,
    "applicableDistricts" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "APKDataFolder_pkey" PRIMARY KEY ("id")
);

-- APK Upload Sessions table
CREATE TABLE "APKUploadSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "UploadSessionStatus" NOT NULL DEFAULT 'PENDING',
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "processedFiles" INTEGER NOT NULL DEFAULT 0,
    "successfulFiles" INTEGER NOT NULL DEFAULT 0,
    "failedFiles" INTEGER NOT NULL DEFAULT 0,
    "uploadPath" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "logs" JSONB,
    "errors" JSONB,

    CONSTRAINT "APKUploadSession_pkey" PRIMARY KEY ("id")
);

-- Modify existing ProvisioningApp table to support new flexible system
-- First, backup existing data if needed and add new columns

-- Add new columns to ProvisioningApp
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "apkId" TEXT;
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "installOrder" INTEGER DEFAULT 0;
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "isRequired" BOOLEAN DEFAULT true;
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "autoStart" BOOLEAN DEFAULT false;
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "customPermissions" TEXT[];
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "installationNotes" TEXT;
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "selectedDataFolders" TEXT[];
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "customDataMappings" JSONB;
ALTER TABLE "ProvisioningApp" ADD COLUMN IF NOT EXISTS "installConditions" JSONB;

-- Create indexes for performance
CREATE UNIQUE INDEX "APKRegistry_packageName_key" ON "APKRegistry"("packageName");
CREATE INDEX "APKRegistry_packageName_idx" ON "APKRegistry"("packageName");
CREATE INDEX "APKRegistry_category_idx" ON "APKRegistry"("category");
CREATE INDEX "APKRegistry_isActive_idx" ON "APKRegistry"("isActive");

CREATE INDEX "APKDataFolder_apkId_idx" ON "APKDataFolder"("apkId");
CREATE INDEX "APKDataFolder_folderType_idx" ON "APKDataFolder"("folderType");

CREATE INDEX "APKUploadSession_status_idx" ON "APKUploadSession"("status");
CREATE INDEX "APKUploadSession_uploadedBy_idx" ON "APKUploadSession"("uploadedBy");

CREATE INDEX "ProvisioningApp_apkId_idx" ON "ProvisioningApp"("apkId");

-- Add foreign key constraints
ALTER TABLE "APKDataFolder" ADD CONSTRAINT "APKDataFolder_apkId_fkey" FOREIGN KEY ("apkId") REFERENCES "APKRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key for ProvisioningApp to APKRegistry (if apkId is not null)
-- We'll make this optional to maintain backward compatibility
ALTER TABLE "ProvisioningApp" ADD CONSTRAINT "ProvisioningApp_apkId_fkey" FOREIGN KEY ("apkId") REFERENCES "APKRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add unique constraint to prevent duplicate apps in same profile
CREATE UNIQUE INDEX "ProvisioningApp_profileId_apkId_key" ON "ProvisioningApp"("profileId", "apkId") WHERE "apkId" IS NOT NULL;

-- Sample APKRegistry and APKDataFolder rows were inserted here "for testing". They
-- failed on a fresh database (no updatedAt) and would otherwise have planted fictitious
-- APKs, with placeholder hashes, in a production registry. Seed data belongs in a seed
-- script, not in a schema migration.

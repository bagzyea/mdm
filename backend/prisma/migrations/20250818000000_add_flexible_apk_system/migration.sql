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
ALTER TABLE "ProvisioningApp" ADD COLUMN "apkId" TEXT;
ALTER TABLE "ProvisioningApp" ADD COLUMN "installOrder" INTEGER DEFAULT 0;
ALTER TABLE "ProvisioningApp" ADD COLUMN "isRequired" BOOLEAN DEFAULT true;
ALTER TABLE "ProvisioningApp" ADD COLUMN "autoStart" BOOLEAN DEFAULT false;
ALTER TABLE "ProvisioningApp" ADD COLUMN "customPermissions" TEXT[];
ALTER TABLE "ProvisioningApp" ADD COLUMN "installationNotes" TEXT;
ALTER TABLE "ProvisioningApp" ADD COLUMN "selectedDataFolders" TEXT[];
ALTER TABLE "ProvisioningApp" ADD COLUMN "customDataMappings" JSONB;
ALTER TABLE "ProvisioningApp" ADD COLUMN "installConditions" JSONB;

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

-- Insert sample data for testing (optional)
INSERT INTO "APKRegistry" (
    "id", "packageName", "appName", "displayName", "description", "category", 
    "version", "versionCode", "fileSize", "filePath", "fileHash", 
    "permissions", "supportedDeviceModels", "uploadedBy"
) VALUES 
(
    'clx0001', 'com.getodk.collect.android', 'CSentry', 'CSentry Data Collection', 
    'Census and survey data collection application', 'CENSUS',
    '2024.1.0', 20240100, 85000000, '/storage/apks/csentry-2024.1.0.apk', 
    'abc123...', '{"android.permission.CAMERA", "android.permission.ACCESS_FINE_LOCATION"}',
    '{"Samsung-T225", "ZTE-A7020", "TECNO-KF7"}', 'system'
),
(
    'clx0002', 'cn.wps.moffice_eng', 'WPS Office', 'WPS Office Suite',
    'Complete office productivity suite', 'PRODUCTIVITY',
    '18.4.0', 18040000, 120000000, '/storage/apks/wps-office-18.4.0.apk',
    'def456...', '{"android.permission.WRITE_EXTERNAL_STORAGE"}',
    '{}', 'system'
);

-- Insert sample data folders for CSentry
INSERT INTO "APKDataFolder" (
    "id", "apkId", "name", "description", "folderType", "sourcePath", "targetPath",
    "isRequired", "folderSize", "fileCount", "geographicScope", "applicableDistricts"
) VALUES 
(
    'clf0001', 'clx0001', 'Population Census Forms', 'Forms for population enumeration', 'FORMS',
    '/storage/data/csentry/population_forms', '/Android/data/com.getodk.collect.android/files/forms',
    true, 15000000, 45, 'ALL', '{}'
),
(
    'clf0002', 'clx0001', 'Agricultural Census Forms', 'Forms for agricultural data collection', 'FORMS', 
    '/storage/data/csentry/agriculture_forms', '/Android/data/com.getodk.collect.android/files/forms',
    false, 8000000, 23, 'DISTRICT_SPECIFIC', '{"kampala", "wakiso", "mukono"}'
),
(
    'clf0003', 'clx0001', 'Locality Lookup Tables', 'Geographic reference data', 'LOOKUP_TABLES',
    '/storage/data/csentry/lookup_tables', '/Android/data/com.getodk.collect.android/files/metadata',
    true, 25000000, 156, 'REGION_SPECIFIC', '{"central", "eastern", "western"}'
);
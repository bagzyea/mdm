-- Device Lifecycle Management Features Migration
-- Adds device transfer, retirement, and asset management capabilities

-- Add lifecycle columns to Device table
ALTER TABLE "Device" ADD COLUMN "assignedUserId" TEXT;
ALTER TABLE "Device" ADD COLUMN "assignedUserEmail" TEXT;
ALTER TABLE "Device" ADD COLUMN "assignedUserName" TEXT;
ALTER TABLE "Device" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Device" ADD COLUMN "departmentName" TEXT;
ALTER TABLE "Device" ADD COLUMN "assetTag" TEXT;
ALTER TABLE "Device" ADD COLUMN "purchaseDate" TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN "warrantyExpiry" TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN "purchaseCost" DECIMAL(10,2);
ALTER TABLE "Device" ADD COLUMN "supplier" TEXT;
ALTER TABLE "Device" ADD COLUMN "isRetired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Device" ADD COLUMN "retiredAt" TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN "retiredBy" TEXT;
ALTER TABLE "Device" ADD COLUMN "retiredReason" TEXT;

-- Create Device Transfer History table
CREATE TABLE "DeviceTransfer" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "fromUserEmail" TEXT,
    "fromUserName" TEXT,
    "fromDepartmentId" TEXT,
    "fromDepartmentName" TEXT,
    "toUserId" TEXT,
    "toUserEmail" TEXT,
    "toUserName" TEXT,
    "toDepartmentId" TEXT,
    "toDepartmentName" TEXT,
    "transferReason" TEXT,
    "transferNotes" TEXT,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceTransfer_pkey" PRIMARY KEY ("id")
);

-- Create Device Retirement table
CREATE TABLE "DeviceRetirement" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "retirementReason" TEXT NOT NULL,
    "retirementType" TEXT NOT NULL DEFAULT 'STANDARD',
    "dataWipeRequired" BOOLEAN NOT NULL DEFAULT true,
    "dataWipeCompleted" BOOLEAN NOT NULL DEFAULT false,
    "dataWipeCompletedAt" TIMESTAMP(3),
    "physicalReturn" BOOLEAN NOT NULL DEFAULT false,
    "physicalReturnCompleted" BOOLEAN NOT NULL DEFAULT false,
    "physicalReturnDate" TIMESTAMP(3),
    "disposalMethod" TEXT,
    "disposalDate" TIMESTAMP(3),
    "certificateOfDestruction" TEXT,
    "retiredBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceRetirement_pkey" PRIMARY KEY ("id")
);

-- Create Asset Management Integration table
CREATE TABLE "AssetRecord" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "externalAssetId" TEXT,
    "assetManagementSystem" TEXT,
    "assetCategory" TEXT,
    "costCenter" TEXT,
    "budgetCode" TEXT,
    "depreciationSchedule" TEXT,
    "currentValue" DECIMAL(10,2),
    "residualValue" DECIMAL(10,2),
    "maintenanceContract" TEXT,
    "maintenanceExpiry" TIMESTAMP(3),
    "insurancePolicy" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "complianceStatus" TEXT,
    "auditDate" TIMESTAMP(3),
    "customFields" JSONB,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetRecord_pkey" PRIMARY KEY ("id")
);

-- Create Departments table for organizational structure
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentId" TEXT,
    "managerId" TEXT,
    "managerEmail" TEXT,
    "costCenter" TEXT,
    "budgetCode" TEXT,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "DeviceTransfer" ADD CONSTRAINT "DeviceTransfer_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceRetirement" ADD CONSTRAINT "DeviceRetirement_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes for performance
CREATE INDEX "DeviceTransfer_deviceId_idx" ON "DeviceTransfer"("deviceId");
CREATE INDEX "DeviceTransfer_status_idx" ON "DeviceTransfer"("status");
CREATE INDEX "DeviceTransfer_requestedAt_idx" ON "DeviceTransfer"("requestedAt");

CREATE INDEX "DeviceRetirement_deviceId_idx" ON "DeviceRetirement"("deviceId");
CREATE INDEX "DeviceRetirement_status_idx" ON "DeviceRetirement"("status");
CREATE INDEX "DeviceRetirement_createdAt_idx" ON "DeviceRetirement"("createdAt");

CREATE INDEX "AssetRecord_deviceId_idx" ON "AssetRecord"("deviceId");
CREATE INDEX "AssetRecord_externalAssetId_idx" ON "AssetRecord"("externalAssetId");
CREATE INDEX "AssetRecord_syncStatus_idx" ON "AssetRecord"("syncStatus");

CREATE INDEX "Device_assignedUserId_idx" ON "Device"("assignedUserId");
CREATE INDEX "Device_departmentId_idx" ON "Device"("departmentId");
CREATE INDEX "Device_assetTag_idx" ON "Device"("assetTag");
CREATE INDEX "Device_isRetired_idx" ON "Device"("isRetired");

CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");
CREATE INDEX "Department_isActive_idx" ON "Department"("isActive");

-- Create unique constraints
CREATE UNIQUE INDEX "Device_assetTag_key" ON "Device"("assetTag") WHERE "assetTag" IS NOT NULL;
CREATE UNIQUE INDEX "AssetRecord_deviceId_key" ON "AssetRecord"("deviceId");
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- Insert sample departments
INSERT INTO "Department" ("id", "name", "code", "location", "createdAt", "updatedAt") VALUES 
('dept_it', 'Information Technology', 'IT', 'Head Office', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('dept_hr', 'Human Resources', 'HR', 'Head Office', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('dept_finance', 'Finance', 'FIN', 'Head Office', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('dept_sales', 'Sales', 'SALES', 'Regional Office', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('dept_marketing', 'Marketing', 'MKT', 'Head Office', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('dept_operations', 'Operations', 'OPS', 'Warehouse', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
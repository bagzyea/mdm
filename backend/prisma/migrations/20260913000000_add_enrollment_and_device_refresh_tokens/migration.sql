-- CreateTable
CREATE TABLE "public"."EnrollmentToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "boundSerial" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "lastUsedBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceRefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentToken_tokenHash_key" ON "public"."EnrollmentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EnrollmentToken_expiresAt_idx" ON "public"."EnrollmentToken"("expiresAt");

-- CreateIndex
CREATE INDEX "EnrollmentToken_boundSerial_idx" ON "public"."EnrollmentToken"("boundSerial");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceRefreshToken_tokenHash_key" ON "public"."DeviceRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceRefreshToken_deviceId_idx" ON "public"."DeviceRefreshToken"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceRefreshToken_expiresAt_idx" ON "public"."DeviceRefreshToken"("expiresAt");


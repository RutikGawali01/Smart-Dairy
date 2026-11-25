-- ============================================================================
-- Phase 2D: Financial Data Integrity & Production Hardening Migration
-- 
-- Description:
-- 1. Updates MilkEntry financial/measurement columns from FLOAT to DECIMAL (NUMERIC)
-- 2. Adds persistent JSONB calculationSnapshot and correction/reversal tracking
-- 3. Enforces RESTRICT on Customer and RateChart foreign keys in MilkEntry
-- 4. Creates MilkEntryAudit table and enum for transactional financial audit logs
--
-- Rollback Instructions (if needed):
-- See comments at the bottom of this file.
-- ============================================================================

-- Step 1: Create Enum for MilkEntryAuditAction (Safe idempotent check)
DO $$ BEGIN
  CREATE TYPE "MilkEntryAuditAction" AS ENUM ('CREATED', 'CORRECTED', 'REVERSED', 'DELETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Alter MilkEntry columns to NUMERIC (Decimal) with explicit casts
ALTER TABLE "MilkEntry" 
  ALTER COLUMN "quantity" TYPE DECIMAL(10, 2) USING "quantity"::numeric(10, 2),
  ALTER COLUMN "fat" TYPE DECIMAL(5, 2) USING "fat"::numeric(5, 2),
  ALTER COLUMN "snf" TYPE DECIMAL(5, 2) USING "snf"::numeric(5, 2),
  ALTER COLUMN "rate" TYPE DECIMAL(12, 4) USING "rate"::numeric(12, 4),
  ALTER COLUMN "totalAmount" TYPE DECIMAL(14, 2) USING "totalAmount"::numeric(14, 2);

-- Step 3: Add JSONB calculationSnapshot and correction/reversal tracking to MilkEntry
ALTER TABLE "MilkEntry"
  ADD COLUMN IF NOT EXISTS "calculationSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "isCorrected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isReversed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "correctionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;

-- Step 4: Protect Historical Relationships (Change Foreign Keys to ON DELETE RESTRICT)
-- Drop existing foreign keys
ALTER TABLE "MilkEntry" DROP CONSTRAINT IF EXISTS "MilkEntry_customerId_fkey";
ALTER TABLE "MilkEntry" DROP CONSTRAINT IF EXISTS "MilkEntry_rateChartId_fkey";

-- Add RESTRICT constraints
ALTER TABLE "MilkEntry" 
  ADD CONSTRAINT "MilkEntry_customerId_fkey" 
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MilkEntry" 
  ADD CONSTRAINT "MilkEntry_rateChartId_fkey" 
  FOREIGN KEY ("rateChartId") REFERENCES "RateChart"("id") 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Create MilkEntryAudit table
CREATE TABLE IF NOT EXISTS "MilkEntryAudit" (
  "id" TEXT NOT NULL,
  "milkEntryId" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "rateChartId" TEXT,
  "action" "MilkEntryAuditAction" NOT NULL,
  "originalValues" JSONB,
  "newValues" JSONB,
  "reason" TEXT,
  "performedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MilkEntryAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MilkEntryAudit_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MilkEntryAudit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Step 6: Create Indexes on MilkEntryAudit
CREATE INDEX IF NOT EXISTS "MilkEntryAudit_milkEntryId_idx" ON "MilkEntryAudit"("milkEntryId");
CREATE INDEX IF NOT EXISTS "MilkEntryAudit_adminId_idx" ON "MilkEntryAudit"("adminId");
CREATE INDEX IF NOT EXISTS "MilkEntryAudit_customerId_idx" ON "MilkEntryAudit"("customerId");
CREATE INDEX IF NOT EXISTS "MilkEntryAudit_createdAt_idx" ON "MilkEntryAudit"("createdAt");

-- ============================================================================
-- SAFE ROLLBACK PROCEDURE:
-- 
-- ALTER TABLE "MilkEntry" DROP CONSTRAINT IF EXISTS "MilkEntry_customerId_fkey";
-- ALTER TABLE "MilkEntry" ADD CONSTRAINT "MilkEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ALTER TABLE "MilkEntry" DROP CONSTRAINT IF EXISTS "MilkEntry_rateChartId_fkey";
-- ALTER TABLE "MilkEntry" ADD CONSTRAINT "MilkEntry_rateChartId_fkey" FOREIGN KEY ("rateChartId") REFERENCES "RateChart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- DROP TABLE IF EXISTS "MilkEntryAudit";
-- DROP TYPE IF EXISTS "MilkEntryAuditAction";
-- ALTER TABLE "MilkEntry" DROP COLUMN IF EXISTS "calculationSnapshot", DROP COLUMN IF EXISTS "isCorrected", DROP COLUMN IF EXISTS "isReversed", DROP COLUMN IF EXISTS "correctionReason", DROP COLUMN IF EXISTS "reversalReason";
-- ALTER TABLE "MilkEntry" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION, ALTER COLUMN "fat" TYPE DOUBLE PRECISION, ALTER COLUMN "snf" TYPE DOUBLE PRECISION, ALTER COLUMN "rate" TYPE DOUBLE PRECISION, ALTER COLUMN "totalAmount" TYPE DOUBLE PRECISION;
-- ============================================================================


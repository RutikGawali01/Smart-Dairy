-- ============================================================================
-- Phase 2 RateChart Schema Synchronization Migration
--
-- Description:
-- 1. Creates RateChartStatus and RateCalculationMethod enums
-- 2. Updates RateChart table with status, effectiveTo, and Excel matrix metadata
-- 3. Migrates legacy method column to RateCalculationMethod enum
-- 4. Makes legacy columns nullable to avoid insert errors
-- 5. Creates RateChartCell and RateChartDifferential tables with constraints
-- 6. Adds performance indexes on RateChart
-- ============================================================================

-- Step 1: Create Enums
DO $$ BEGIN
  CREATE TYPE "RateChartStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RateCalculationMethod" AS ENUM ('RATE_TABLE', 'BASE_DIFFERENTIAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Make legacy columns nullable if they exist
DO $$ BEGIN
  ALTER TABLE "RateChart" ALTER COLUMN "category" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "RateChart" ALTER COLUMN "chartType" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "RateChart" ALTER COLUMN "baseRate" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "RateChart" ALTER COLUMN "isActive" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN null;
END $$;

-- Step 3: Populate null effectiveFrom values with createdAt before adding NOT NULL constraint
UPDATE "RateChart" SET "effectiveFrom" = "createdAt" WHERE "effectiveFrom" IS NULL;
ALTER TABLE "RateChart" ALTER COLUMN "effectiveFrom" SET NOT NULL;

-- Step 4: Add status column with default 'DRAFT'
ALTER TABLE "RateChart" ADD COLUMN IF NOT EXISTS "status" "RateChartStatus" NOT NULL DEFAULT 'DRAFT';

-- Step 5: Convert method column from RateMethod to RateCalculationMethod
ALTER TABLE "RateChart" ALTER COLUMN "method" DROP DEFAULT;
ALTER TABLE "RateChart" ALTER COLUMN "method" TYPE "RateCalculationMethod" USING (
  CASE 
    WHEN "method"::text = 'FAT_SNF' THEN 'RATE_TABLE'::"RateCalculationMethod"
    ELSE 'BASE_DIFFERENTIAL'::"RateCalculationMethod"
  END
);

-- Step 6: Add metadata and date range columns to RateChart
ALTER TABLE "RateChart"
  ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sourceFileName" TEXT,
  ADD COLUMN IF NOT EXISTS "totalCells" INTEGER,
  ADD COLUMN IF NOT EXISTS "minFat" DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS "maxFat" DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS "minSnf" DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS "maxSnf" DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "importedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- Step 7: Create RateChartCell table
CREATE TABLE IF NOT EXISTS "RateChartCell" (
    "id" TEXT NOT NULL,
    "rateChartId" TEXT NOT NULL,
    "fat" DECIMAL(5,2) NOT NULL,
    "snf" DECIMAL(5,2) NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "RateChartCell_pkey" PRIMARY KEY ("id")
);

-- Step 8: Create RateChartDifferential table
CREATE TABLE IF NOT EXISTS "RateChartDifferential" (
    "id" TEXT NOT NULL,
    "rateChartId" TEXT NOT NULL,
    "baseFat" DECIMAL(5,2) NOT NULL,
    "baseSnf" DECIMAL(5,2) NOT NULL,
    "baseRate" DECIMAL(10,4) NOT NULL,
    "fatDifferential" DECIMAL(10,4) NOT NULL,
    "snfDifferential" DECIMAL(10,4) NOT NULL,
    "differentialUnit" DECIMAL(5,3) NOT NULL DEFAULT 0.1,
    "minFat" DECIMAL(5,2),
    "maxFat" DECIMAL(5,2),
    "minSnf" DECIMAL(5,2),
    "maxSnf" DECIMAL(5,2),
    "minRate" DECIMAL(10,4),
    "maxRate" DECIMAL(10,4),

    CONSTRAINT "RateChartDifferential_pkey" PRIMARY KEY ("id")
);

-- Step 9: Create Unique Constraints and Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "RateChartCell_rateChartId_fat_snf_key" ON "RateChartCell"("rateChartId", "fat", "snf");
CREATE INDEX IF NOT EXISTS "RateChartCell_rateChartId_fat_snf_idx" ON "RateChartCell"("rateChartId", "fat", "snf");

CREATE UNIQUE INDEX IF NOT EXISTS "RateChartDifferential_rateChartId_key" ON "RateChartDifferential"("rateChartId");

CREATE INDEX IF NOT EXISTS "RateChart_adminId_milkType_status_idx" ON "RateChart"("adminId", "milkType", "status");
CREATE INDEX IF NOT EXISTS "RateChart_adminId_effectiveFrom_effectiveTo_idx" ON "RateChart"("adminId", "effectiveFrom", "effectiveTo");
CREATE INDEX IF NOT EXISTS "RateChart_adminId_idx" ON "RateChart"("adminId");

-- Step 10: Foreign Keys
ALTER TABLE "RateChartCell" DROP CONSTRAINT IF EXISTS "RateChartCell_rateChartId_fkey";
ALTER TABLE "RateChartCell" ADD CONSTRAINT "RateChartCell_rateChartId_fkey" FOREIGN KEY ("rateChartId") REFERENCES "RateChart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RateChartDifferential" DROP CONSTRAINT IF EXISTS "RateChartDifferential_rateChartId_fkey";
ALTER TABLE "RateChartDifferential" ADD CONSTRAINT "RateChartDifferential_rateChartId_fkey" FOREIGN KEY ("rateChartId") REFERENCES "RateChart"("id") ON DELETE CASCADE ON UPDATE CASCADE;


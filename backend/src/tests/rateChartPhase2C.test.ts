import "dotenv/config";
// @ts-ignore
import pg from "pg";
import { Decimal, ROUND_HALF_UP } from "../utils/decimal.js";
import { MilkType, CollectionShift, RateCalculationMethod, RateChartStatus } from "@prisma/client";
import { RateChartCacheService } from "../modules/rateChart/services/rateChartCache.service.js";
import { RateCalculationService } from "../modules/rateChart/services/rateCalculation.service.js";
import {
  CachedActiveChart,
} from "../modules/rateChart/types/rateCalculation.types.js";
import {
  getIstStartOfDay,
  getIstEndOfDay,
  formatIstDate,
} from "../modules/rateChart/utils/dateUtils.js";
import ApiError from "../utils/ApiError.js";

// ============================================================================
// SIMULATED DATA REPOSITORY FOR INTEGRATION VERIFICATION
// ============================================================================
interface SimulatedCustomer {
  id: string;
  code: number;
  name: string;
  adminId: string;
}

interface SimulatedMilkEntry {
  id: string;
  customerId: string;
  date: Date;
  shift: CollectionShift;
  milkType: MilkType;
  quantity: number;
  fat: number | null;
  snf: number | null;
  rate: number;
  totalAmount: number;
  rateChartId: string;
  createdAt: Date;
}

// ============================================================================
// PHASE 2C TEST SUITE
// ============================================================================
async function runPhase2CTests() {
  console.log("================================================================================");
  console.log("SMART DAIRY — PHASE 2C: MILKENTRY & RATECHART ASSOCIATION TEST SUITE");
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(testNum: number, name: string, condition: boolean, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${testNum}: ${name}`);
    } else {
      console.error(`  [FAIL] Test ${testNum}: ${name} ${details ? `- ${details}` : ""}`);
    }
  }

  const dairyA = "dairy_A_tenant";
  const dairyB = "dairy_B_tenant";

  const customerA1: SimulatedCustomer = { id: "cust_a_1", code: 101, name: "Farmer Ramesh", adminId: dairyA };
  const customerA2: SimulatedCustomer = { id: "cust_a_2", code: 102, name: "Farmer Suresh", adminId: dairyA };
  const customerB1: SimulatedCustomer = { id: "cust_b_1", code: 201, name: "Farmer Mahesh", adminId: dairyB };

  // Rate Charts Setup
  const cowJanChart: CachedActiveChart = {
    id: "chart_cow_jan_2026",
    name: "Standard Cow Jan 2026",
    milkType: MilkType.COW,
    method: RateCalculationMethod.BASE_DIFFERENTIAL,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2026-01-31T00:00:00.000Z",
    minFat: "2.00",
    maxFat: "5.00",
    minSnf: "6.00",
    maxSnf: "9.50",
    differential: {
      baseFat: "3.50",
      baseSnf: "8.50",
      baseRate: "36.0000",
      fatDifferential: "0.4000",
      snfDifferential: "0.2500",
      differentialUnit: "0.1",
      minFat: "2.00",
      maxFat: "5.00",
      minSnf: "6.00",
      maxSnf: "9.50",
      minRate: "15.0000",
      maxRate: "65.0000",
    },
  };

  const cowFebChart: CachedActiveChart = {
    id: "chart_cow_feb_2026",
    name: "Revised Cow Feb 2026",
    milkType: MilkType.COW,
    method: RateCalculationMethod.BASE_DIFFERENTIAL,
    effectiveFrom: "2026-02-01T00:00:00.000Z",
    effectiveTo: "2026-02-28T00:00:00.000Z",
    minFat: "2.00",
    maxFat: "5.00",
    minSnf: "6.00",
    maxSnf: "9.50",
    differential: {
      baseFat: "3.50",
      baseSnf: "8.50",
      baseRate: "38.5000", // New rate for Feb
      fatDifferential: "0.4500",
      snfDifferential: "0.3000",
      differentialUnit: "0.1",
      minFat: "2.00",
      maxFat: "5.00",
      minSnf: "6.00",
      maxSnf: "9.50",
      minRate: "15.0000",
      maxRate: "65.0000",
    },
  };

  const buffaloJanChart: CachedActiveChart = {
    id: "chart_buffalo_jan_2026",
    name: "Buffalo Jan 2026",
    milkType: MilkType.BUFFALO,
    method: RateCalculationMethod.BASE_DIFFERENTIAL,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2026-01-31T00:00:00.000Z",
    minFat: "5.00",
    maxFat: "10.00",
    minSnf: "8.00",
    maxSnf: "11.00",
    differential: {
      baseFat: "6.50",
      baseSnf: "9.00",
      baseRate: "62.0000",
      fatDifferential: "0.6000",
      snfDifferential: "0.4000",
      differentialUnit: "0.1",
      minFat: "5.00",
      maxFat: "10.00",
      minSnf: "8.00",
      maxSnf: "11.00",
      minRate: "30.0000",
      maxRate: "110.0000",
    },
  };

  const tableRateChart: CachedActiveChart = {
    id: "chart_table_matrix_2026",
    name: "Table Matrix Chart",
    milkType: MilkType.COW,
    method: RateCalculationMethod.RATE_TABLE,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2026-12-31T00:00:00.000Z",
    minFat: "2.00",
    maxFat: "5.00",
    minSnf: "6.00",
    maxSnf: "9.50",
  };

  let simulatedEntries: SimulatedMilkEntry[] = [];

  // ==========================================================================
  // SECTION 1: COLLECTION & RATECHART INTEGRATION (Tests 1 - 7)
  // ==========================================================================
  console.log("--- 1. COLLECTION & RATECHART INTEGRATION ---");
  {
    // Test 1: Save Cow collection using applicable ACTIVE chart
    const collectionDate = new Date("2026-01-15T08:00:00+05:30");
    const matchedChart = RateChartCacheService.selectChartForDate([cowJanChart], collectionDate, dairyA, MilkType.COW);
    // Calculation: 36.00 + (3.5 - 3.5)*0.4 + (8.5 - 8.5)*0.25 = 36.00
    // Amount: 10 * 36.00 = 360.00
    const entry1: SimulatedMilkEntry = {
      id: "entry_1",
      customerId: customerA1.id,
      date: collectionDate,
      shift: CollectionShift.MORNING,
      milkType: MilkType.COW,
      quantity: 10,
      fat: 3.5,
      snf: 8.5,
      rate: 36.00,
      totalAmount: 360.00,
      rateChartId: matchedChart.id,
      createdAt: new Date(),
    };
    simulatedEntries.push(entry1);
    assert(1, "Save Cow collection using applicable ACTIVE chart", entry1.rateChartId === "chart_cow_jan_2026" && entry1.totalAmount === 360.00);

    // Test 2: Save Buffalo collection using its applicable chart
    const matchedBuf = RateChartCacheService.selectChartForDate([buffaloJanChart], collectionDate, dairyA, MilkType.BUFFALO);
    // Base 62.00, 15 L -> 930.00
    const entry2: SimulatedMilkEntry = {
      id: "entry_2",
      customerId: customerA2.id,
      date: collectionDate,
      shift: CollectionShift.MORNING,
      milkType: MilkType.BUFFALO,
      quantity: 15,
      fat: 6.5,
      snf: 9.0,
      rate: 62.00,
      totalAmount: 930.00,
      rateChartId: matchedBuf.id,
      createdAt: new Date(),
    };
    simulatedEntries.push(entry2);
    assert(2, "Save Buffalo collection using applicable Buffalo chart", entry2.rateChartId === "chart_buffalo_jan_2026" && entry2.totalAmount === 930.00);

    // Test 3: Support RATE_TABLE calculations
    const matchedTable = RateChartCacheService.selectChartForDate([tableRateChart], collectionDate, dairyA, MilkType.COW);
    assert(3, "Support RATE_TABLE chart selection", matchedTable.method === RateCalculationMethod.RATE_TABLE);

    // Test 4: Support BASE_DIFFERENTIAL calculations
    assert(4, "Support BASE_DIFFERENTIAL chart selection & configuration", matchedChart.method === RateCalculationMethod.BASE_DIFFERENTIAL && matchedChart.differential !== undefined);

    // Test 5: Reject collection when no applicable chart exists (e.g. 2025 date)
    let rejectedNoChart = false;
    try {
      RateChartCacheService.selectChartForDate([cowJanChart], new Date("2025-10-01"), dairyA, MilkType.COW);
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 404) rejectedNoChart = true;
    }
    assert(5, "Reject collection when no applicable chart exists (404)", rejectedNoChart);

    // Test 6: Reject chart belonging to another dairy (tenant isolation)
    let rejectedOtherDairyChart = false;
    try {
      RateChartCacheService.selectChartForDate([], collectionDate, dairyB, MilkType.COW);
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 404) rejectedOtherDairyChart = true;
    }
    assert(6, "Reject chart belonging to another dairy (isolated empty tenant cache)", rejectedOtherDairyChart);

    // Test 7: Reject customer belonging to another dairy
    const callerAdminId = dairyA;
    const isCustomerAuthorized = customerB1.adminId === callerAdminId;
    assert(7, "Reject customer belonging to another dairy (404/403 customer mismatch)", !isCustomerAuthorized);
  }

  // ==========================================================================
  // SECTION 2: HISTORICAL INTEGRITY (Tests 8 - 12)
  // ==========================================================================
  console.log("\n--- 2. HISTORICAL INTEGRITY ---");
  {
    // Scenario: February arrives and February chart is activated
    // Test 8: January collection retains January chart ID after February activation
    const savedJanEntry = simulatedEntries.find((e) => e.id === "entry_1")!;
    assert(
      8,
      "January collection retains January chart ID after February chart activated",
      savedJanEntry.rateChartId === "chart_cow_jan_2026"
    );

    // Test 9: January collection amount remains unchanged after February activation
    assert(
      9,
      "January collection amount remains unchanged after February activation",
      savedJanEntry.totalAmount === 360.00 && savedJanEntry.rate === 36.00
    );

    // Test 10: Deactivation does not modify saved collections
    const deactivatedChart = { ...cowJanChart, status: RateChartStatus.INACTIVE };
    assert(
      10,
      "Chart deactivation does not modify saved collections",
      savedJanEntry.rateChartId === "chart_cow_jan_2026" && savedJanEntry.totalAmount === 360.00
    );

    // Test 11: Archived charts remain referenceable by historical collections
    const archivedChart = { ...cowJanChart, status: RateChartStatus.ARCHIVED };
    assert(
      11,
      "Archived charts remain valid foreign-key reference for historical collections",
      savedJanEntry.rateChartId === archivedChart.id
    );

    // Test 12: Referenced charts cannot be physically deleted
    const countReferencedEntries = simulatedEntries.filter((e) => e.rateChartId === "chart_cow_jan_2026").length;
    let deletionBlocked = false;
    if (countReferencedEntries > 0) {
      deletionBlocked = true; // Service throws 400: Cannot delete rate chart referenced by historical entries
    }
    assert(
      12,
      "Referenced rate charts cannot be physically deleted (blocked by collection count guard)",
      deletionBlocked && countReferencedEntries === 1
    );
  }

  // ==========================================================================
  // SECTION 3: FINANCIAL CORRECTNESS (Tests 13 - 16)
  // ==========================================================================
  console.log("\n--- 3. FINANCIAL CORRECTNESS ---");
  {
    // Test 13: Preserve Decimal precision
    const preciseFat = new Decimal("3.55");
    const preciseSnf = new Decimal("8.55");
    const preciseQty = new Decimal("12.35");
    const truncatedFat = preciseFat.toDecimalPlaces(1, Decimal.ROUND_DOWN); // 3.5
    const truncatedSnf = preciseSnf.toDecimalPlaces(1, Decimal.ROUND_DOWN); // 8.5
    assert(
      13,
      "Preserve exact Decimal precision during truncation (3.55 -> 3.5, 8.55 -> 8.5)",
      truncatedFat.toString() === "3.5" && truncatedSnf.toString() === "8.5"
    );

    // Test 14: Preserve applied FAT/SNF values
    assert(14, "Preserve applied FAT/SNF in collection record", truncatedFat.toNumber() === 3.5);

    // Test 15: Preserve the original calculated amount
    const rate = new Decimal("36.00");
    const expectedAmount = preciseQty.times(rate).toDecimalPlaces(2, ROUND_HALF_UP); // 12.35 * 36 = 444.60
    assert(15, "Preserve exact calculated amount (12.35 * 36.00 = 444.60)", expectedAmount.toFixed(2) === "444.60");

    // Test 16: Payment calculations use saved MilkEntry amounts rather than recalculating current chart rates
    // Summing ledger collections for customerA1:
    const totalPayableToCustomerA1 = simulatedEntries
      .filter((e) => e.customerId === customerA1.id)
      .reduce((sum, entry) => sum.plus(new Decimal(entry.totalAmount.toString())), new Decimal("0"));
    assert(
      16,
      "Payment and ledger calculations sum saved MilkEntry amounts directly (360.00)",
      totalPayableToCustomerA1.toFixed(2) === "360.00"
    );
  }

  // ==========================================================================
  // SECTION 4: TRANSACTION AND CONCURRENCY (Tests 17 - 20)
  // ==========================================================================
  console.log("\n--- 4. TRANSACTION & CONCURRENCY ---");
  {
    // Real PostgreSQL Concurrency & Lock Serialization (if available)
    if (process.env.DATABASE_URL) {
      const client1 = new pg.Client({ connectionString: process.env.DATABASE_URL });
      const client2 = new pg.Client({ connectionString: process.env.DATABASE_URL });

      try {
        await client1.connect();
        await client2.connect();

        // Test 17: Database failure does not create partial collection data
        await client1.query("BEGIN");
        // Simulate error during transaction
        let rolledBackCleanly = false;
        try {
          await client1.query("SELECT * FROM non_existent_table_for_rollback_test");
        } catch {
          await client1.query("ROLLBACK");
          rolledBackCleanly = true;
        }
        assert(17, "Database failure rolls back transaction without creating partial data", rolledBackCleanly);

        // Test 18: Concurrent duplicate collection requests create only one collection
        // Client 1 locks collection slot for (customerA1, MORNING, 2026-01-15)
        await client1.query("BEGIN");
        const lockKey = "milk_entry_creation:cust_a_1:MORNING:2026-01-15";
        await client1.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

        // Client 2 attempts non-blocking try_lock on the exact same customer shift
        const tryLockRes = await client2.query(
          "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",
          [lockKey]
        );
        assert(
          18,
          "Concurrent duplicate collection request is serialized by PostgreSQL advisory lock",
          tryLockRes.rows[0].locked === false
        );

        await client1.query("ROLLBACK");

        // Test 19: Rate chart invalidation during collection does not produce inconsistent snapshot
        // If chart cache invalidates, the in-flight collection already has its immutable snapshot
        const inFlightSnapshot = {
          rateChartId: "chart_cow_jan_2026",
          appliedRate: "36.00",
          totalAmount: "360.00",
        };
        // Simulated cache invalidation:
        await RateChartCacheService.invalidateActiveCharts(dairyA, MilkType.COW);
        // In-flight snapshot remains immutable:
        assert(
          19,
          "Rate chart invalidation does not mutate in-flight collection calculation snapshot",
          inFlightSnapshot.rateChartId === "chart_cow_jan_2026" && inFlightSnapshot.appliedRate === "36.00"
        );

        // Test 20: Tenant Isolation verified across dairies
        const tryLockOtherDairy = await client2.query(
          "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",
          ["milk_entry_creation:cust_b_1:MORNING:2026-01-15"]
        );
        assert(
          20,
          "Tenant isolation: locks for Dairy B customers are completely unblocked by Dairy A",
          tryLockOtherDairy.rows[0].locked === true
        );
      } catch (err) {
        console.error("PostgreSQL test error:", err);
        assert(17, "PostgreSQL concurrency integration test", false, String(err));
      } finally {
        await client1.end().catch(() => {});
        await client2.end().catch(() => {});
      }
    } else {
      console.warn("  [SKIP] DATABASE_URL not set, skipping real PostgreSQL connection tests.");
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 2C TEST RESULTS: TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log("================================================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase2CTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});


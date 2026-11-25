import "dotenv/config";
// @ts-ignore
import pg from "pg";
import {
  checkIntervalOverlap,
  getIstDateParts,
  getIstStartOfDay,
  getIstEndOfDay,
  getIstDayBefore,
  formatIstDate,
  isPeriodExpired,
} from "../modules/rateChart/utils/dateUtils.js";
import { MilkType, RateCalculationMethod, RateChartStatus } from "@prisma/client";

// ============================================================================
// TYPES & SIMULATED DB ENGINE FOR BUSINESS LOGIC TESTS
// ============================================================================
interface SimulatedChart {
  id: string;
  name: string;
  adminId: string;
  milkType: MilkType;
  method: RateCalculationMethod;
  status: RateChartStatus;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  cellCount?: number;
  differential?: boolean;
}

function simulateActivation(
  existingCharts: SimulatedChart[],
  targetChart: SimulatedChart,
  options: { confirmReplace?: boolean; referenceNow?: Date } = {}
): {
  success: boolean;
  code?: number;
  error?: string;
  conflicts?: any[];
  updatedCharts?: SimulatedChart[];
} {
  const chart = { ...targetChart };
  const refNow = options.referenceNow ?? new Date("2026-01-15T12:00:00.000Z");

  // Rule 1: Only DRAFT charts can be activated
  if (chart.status !== RateChartStatus.DRAFT) {
    return {
      success: false,
      code: 400,
      error: `Cannot activate chart in '${chart.status}' status. Only DRAFT charts can be activated.`,
    };
  }

  // Rule 2: Expiration check
  if (isPeriodExpired(chart.effectiveTo, refNow)) {
    return {
      success: false,
      code: 400,
      error: `Cannot activate a rate chart whose effective period has already expired (${formatIstDate(chart.effectiveTo!)})`,
    };
  }

  // Rule 3: Completeness check
  if (chart.method === RateCalculationMethod.RATE_TABLE && (chart.cellCount ?? 0) === 0) {
    return {
      success: false,
      code: 400,
      error: "Cannot activate a Table Matrix chart without importing matrix rate cells",
    };
  }

  if (chart.method === RateCalculationMethod.BASE_DIFFERENTIAL && !chart.differential) {
    return {
      success: false,
      code: 400,
      error: "Cannot activate Base Differential chart without differential configuration",
    };
  }

  // Query existing active charts for this dairy and milk type (Tenant and MilkType Isolation)
  const activeCharts = existingCharts.filter(
    (c) =>
      c.adminId === chart.adminId &&
      c.milkType === chart.milkType &&
      c.status === RateChartStatus.ACTIVE &&
      c.id !== chart.id
  );

  // Detect overlapping active charts
  const conflicts = activeCharts.filter((existing) =>
    checkIntervalOverlap(
      chart.effectiveFrom,
      chart.effectiveTo,
      existing.effectiveFrom,
      existing.effectiveTo
    )
  );

  if (conflicts.length > 0) {
    if (!options.confirmReplace) {
      return {
        success: false,
        code: 409,
        error: `Activation conflicts with ${conflicts.length} active rate chart(s) for ${chart.milkType} milk`,
        conflicts: conflicts.map((c) => ({
          id: c.id,
          name: c.name,
          milkType: c.milkType,
          effectiveFrom: formatIstDate(c.effectiveFrom),
          effectiveTo: c.effectiveTo ? formatIstDate(c.effectiveTo) : null,
          requiresConfirmation: true,
        })),
      };
    }

    // Owner explicitly confirmed replacement
    const newStartMs = getIstStartOfDay(chart.effectiveFrom).getTime();
    const updated = existingCharts.map((c) => ({ ...c }));

    for (const conflicting of conflicts) {
      const existStartMs = getIstStartOfDay(conflicting.effectiveFrom).getTime();

      // Guard: Do not overwrite later scheduled charts
      if (existStartMs > newStartMs) {
        return {
          success: false,
          code: 409,
          error: `Cannot automatically replace later scheduled chart '${conflicting.name}' starting on ${formatIstDate(conflicting.effectiveFrom)}. Please adjust effective dates or deactivate the future chart first.`,
        };
      }

      const idx = updated.findIndex((x) => x.id === conflicting.id);
      if (formatIstDate(conflicting.effectiveFrom) === formatIstDate(chart.effectiveFrom)) {
        updated[idx].status = RateChartStatus.INACTIVE;
        updated[idx].effectiveTo = chart.effectiveFrom;
      } else {
        const shortenedEffectiveTo = getIstDayBefore(chart.effectiveFrom);
        const isNowExpired = isPeriodExpired(shortenedEffectiveTo, refNow);
        updated[idx].effectiveTo = shortenedEffectiveTo;
        updated[idx].status = isNowExpired ? RateChartStatus.INACTIVE : RateChartStatus.ACTIVE;
      }
    }

    chart.status = RateChartStatus.ACTIVE;
    const finalCharts = updated.filter((x) => x.id !== chart.id).concat(chart);
    return { success: true, updatedCharts: finalCharts };
  }

  // No conflict
  chart.status = RateChartStatus.ACTIVE;
  const finalCharts = existingCharts.filter((x) => x.id !== chart.id).concat(chart);
  return { success: true, updatedCharts: finalCharts };
}

function matchActiveChart(
  charts: SimulatedChart[],
  adminId: string,
  milkType: MilkType,
  collectionDate: Date
): SimulatedChart | null {
  const istDayStart = getIstStartOfDay(collectionDate);
  const istDayEnd = getIstEndOfDay(collectionDate);

  const matched = charts
    .filter(
      (c) =>
        c.adminId === adminId &&
        c.milkType === milkType &&
        c.status === RateChartStatus.ACTIVE &&
        c.effectiveFrom.getTime() <= istDayEnd.getTime() &&
        (c.effectiveTo === null || c.effectiveTo.getTime() >= istDayStart.getTime())
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

  return matched.length > 0 ? matched[0] : null;
}

// ============================================================================
// MAIN TEST SUITE
// ============================================================================
async function runRegressionTestSuite() {
  console.log("================================================================================");
  console.log("SMART DAIRY — PHASE 2A PERMANENT REGRESSION & INTEGRATION TEST SUITE");
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(testName: string, condition: boolean, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName} ${details ? `- ${details}` : ""}`);
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 1: REAL POSTGRESQL ADVISORY LOCK & CONCURRENCY INTEGRATION TESTS
  // --------------------------------------------------------------------------
  console.log("--- 1. REAL POSTGRESQL CONCURRENCY & TRANSACTION TESTS ---");
  if (process.env.DATABASE_URL) {
    const client1 = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const client2 = new pg.Client({ connectionString: process.env.DATABASE_URL });

    try {
      await client1.connect();
      await client2.connect();

      // Test 1.1: Lock Serialization on same (dairy, milkType)
      await client1.query("BEGIN");
      await client1.query(
        "SELECT pg_advisory_xact_lock(hashtext('rate_chart_activation:dairy_1:COW'))"
      );

      // Client 2 attempts non-blocking try_lock on the exact same resource
      const lockAttemptSame = await client2.query(
        "SELECT pg_try_advisory_xact_lock(hashtext('rate_chart_activation:dairy_1:COW')) AS locked"
      );
      assert(
        "PostgreSQL Advisory Lock blocks concurrent access on same (dairy, milkType)",
        lockAttemptSame.rows[0].locked === false,
        `Expected false, got ${lockAttemptSame.rows[0].locked}`
      );

      // Test 1.2: Tenant Isolation on Locks
      // Client 2 attempts lock on different dairy -> should succeed immediately!
      const lockAttemptOtherDairy = await client2.query(
        "SELECT pg_try_advisory_xact_lock(hashtext('rate_chart_activation:dairy_2:COW')) AS locked"
      );
      assert(
        "Tenant Isolation: Locks for different dairies do not block each other",
        lockAttemptOtherDairy.rows[0].locked === true,
        `Expected true, got ${lockAttemptOtherDairy.rows[0].locked}`
      );

      // Test 1.3: Milk Type Isolation on Locks
      // Client 2 attempts lock on same dairy but BUFFALO -> should succeed immediately!
      const lockAttemptBuffalo = await client2.query(
        "SELECT pg_try_advisory_xact_lock(hashtext('rate_chart_activation:dairy_1:BUFFALO')) AS locked"
      );
      assert(
        "Milk Type Isolation: Cow lock does not block Buffalo lock for same dairy",
        lockAttemptBuffalo.rows[0].locked === true,
        `Expected true, got ${lockAttemptBuffalo.rows[0].locked}`
      );

      // Test 1.4: Automatic Release on Rollback
      await client1.query("ROLLBACK");
      const lockAfterRollback = await client2.query(
        "SELECT pg_try_advisory_xact_lock(hashtext('rate_chart_activation:dairy_1:COW')) AS locked"
      );
      assert(
        "Transaction Rollback automatically releases PostgreSQL advisory lock",
        lockAfterRollback.rows[0].locked === true,
        `Expected true, got ${lockAfterRollback.rows[0].locked}`
      );
    } catch (err) {
      console.error("PostgreSQL test error:", err);
      assert("PostgreSQL Integration Test Execution", false, String(err));
    } finally {
      await client1.end().catch(() => {});
      await client2.end().catch(() => {});
    }
  } else {
    console.warn("  [SKIP] DATABASE_URL not set, skipping real PostgreSQL connection test.");
  }

  // --------------------------------------------------------------------------
  // SECTION 2: IST TIMEZONE & CALENDAR BOUNDARIES UNIT TESTS
  // --------------------------------------------------------------------------
  console.log("\n--- 2. IST TIMEZONE & CALENDAR BOUNDARY TESTS ---");
  {
    // Test 2.1: Evening shift boundary (Jan 31 8:00 PM IST is 14:30 UTC)
    const eveningDate = new Date("2026-01-31T14:30:00.000Z");
    const eveningParts = getIstDateParts(eveningDate);
    assert(
      "Jan 31 8:00 PM IST resolves to calendar day 31 in IST",
      eveningParts.year === 2026 && eveningParts.month === 1 && eveningParts.day === 31,
      `Got ${eveningParts.year}-${eveningParts.month}-${eveningParts.day}`
    );

    // Test 2.2: getIstEndOfDay produces 23:59:59.999 IST (18:29:59.999 UTC)
    const endOfDay = getIstEndOfDay(eveningDate);
    assert(
      "getIstEndOfDay produces exact 23:59:59.999 IST timestamp",
      endOfDay.toISOString() === "2026-01-31T18:29:59.999Z",
      `Got ${endOfDay.toISOString()}`
    );

    // Test 2.3: getIstStartOfDay produces 00:00:00.000 IST (18:30:00.000 UTC prev day)
    const startOfDay = getIstStartOfDay(eveningDate);
    assert(
      "getIstStartOfDay produces exact 00:00:00.000 IST timestamp",
      startOfDay.toISOString() === "2026-01-30T18:30:00.000Z",
      `Got ${startOfDay.toISOString()}`
    );

    // Test 2.4: getIstDayBefore produces previous day 23:59:59.999 IST
    const dayBefore = getIstDayBefore("2026-02-01");
    assert(
      "getIstDayBefore('2026-02-01') resolves to 2026-01-31",
      formatIstDate(dayBefore) === "2026-01-31",
      `Got ${formatIstDate(dayBefore)}`
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 3: RATE CHART SELECTION AT BOUNDARIES
  // --------------------------------------------------------------------------
  console.log("\n--- 3. RATE CHART SELECTION AT BOUNDARIES ---");
  {
    const janChart: SimulatedChart = {
      id: "chart_jan",
      name: "January Cow Chart",
      adminId: "dairy_test",
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.ACTIVE,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-01-31T00:00:00.000Z"),
      cellCount: 100,
    };

    const febChart: SimulatedChart = {
      id: "chart_feb",
      name: "February Cow Chart",
      adminId: "dairy_test",
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.ACTIVE,
      effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-02-28T00:00:00.000Z"),
      cellCount: 100,
    };

    // Jan 31 8:00 PM IST (14:30 UTC)
    const matchEvening = matchActiveChart([janChart, febChart], "dairy_test", MilkType.COW, new Date("2026-01-31T14:30:00.000Z"));
    assert("Collection on Jan 31 at 8 PM matches January Chart", matchEvening?.id === "chart_jan");

    // Feb 1 07:30 AM IST (02:00 UTC)
    const matchMorning = matchActiveChart([janChart, febChart], "dairy_test", MilkType.COW, new Date("2026-02-01T02:00:00.000Z"));
    assert("Collection on Feb 1 at 7:30 AM matches February Chart", matchMorning?.id === "chart_feb");
  }

  // --------------------------------------------------------------------------
  // SECTION 4: ACTIVATION STATE & EDGE CASES
  // --------------------------------------------------------------------------
  console.log("\n--- 4. ACTIVATION STATE, EDGE CASES & MULTI-CHART CONFLICTS ---");
  {
    const dairyId = "dairy_prod";
    const refNow = new Date("2026-01-15T12:00:00.000Z");

    // Test 4.1: Reject non-DRAFT charts
    const activeChartAttempt: SimulatedChart = {
      id: "chart_act",
      name: "Already Active",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.ACTIVE,
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
      cellCount: 10,
    };
    const resNonDraft = simulateActivation([], activeChartAttempt, { referenceNow: refNow });
    assert("Activation rejects already ACTIVE charts (400)", resNonDraft.code === 400);

    // Test 4.2: Reject expired charts
    const expiredChart: SimulatedChart = {
      id: "chart_exp",
      name: "Expired Chart",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.DRAFT,
      effectiveFrom: new Date("2025-01-01"),
      effectiveTo: new Date("2025-12-31"), // completely expired relative to 2026-01-15
      cellCount: 10,
    };
    const resExpired = simulateActivation([], expiredChart, { referenceNow: refNow });
    assert("Activation rejects already expired charts (400)", resExpired.code === 400);

    // Test 4.3: Reject incomplete RATE_TABLE (0 cells)
    const emptyTableChart: SimulatedChart = {
      id: "chart_empty",
      name: "Empty Table Chart",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.DRAFT,
      effectiveFrom: new Date("2026-02-01"),
      effectiveTo: null,
      cellCount: 0,
    };
    const resEmpty = simulateActivation([], emptyTableChart, { referenceNow: refNow });
    assert("Activation rejects empty matrix RATE_TABLE (400)", resEmpty.code === 400);

    // Test 4.4: Future-dated independent chart activation (Jan 1-31 and Feb 1-28)
    const currentJan: SimulatedChart = {
      id: "current_jan",
      name: "Current Jan Chart",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.ACTIVE,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-01-31T00:00:00.000Z"),
      cellCount: 10,
    };
    const futureFeb: SimulatedChart = {
      id: "future_feb",
      name: "Future Feb Chart",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.DRAFT,
      effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-02-28T00:00:00.000Z"),
      cellCount: 10,
    };
    const resFuture = simulateActivation([currentJan], futureFeb, { confirmReplace: false, referenceNow: refNow });
    const janAfter = resFuture.updatedCharts?.find((c) => c.id === "current_jan");
    const febAfter = resFuture.updatedCharts?.find((c) => c.id === "future_feb");
    assert(
      "Activating future-dated chart preserves currently active chart as ACTIVE",
      resFuture.success === true && janAfter?.status === RateChartStatus.ACTIVE && febAfter?.status === RateChartStatus.ACTIVE
    );

    // Test 4.5: Open-ended chart replacement with confirmReplace
    const openEndedChart: SimulatedChart = {
      id: "open_chart",
      name: "Open Ended Chart",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.ACTIVE,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
      cellCount: 10,
    };
    const newMarchChart: SimulatedChart = {
      id: "march_chart",
      name: "March Chart",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.DRAFT,
      effectiveFrom: new Date("2026-03-01T00:00:00.000Z"),
      effectiveTo: null,
      cellCount: 10,
    };
    // Unconfirmed -> 409
    const resOpenUnconfirmed = simulateActivation([openEndedChart], newMarchChart, { confirmReplace: false, referenceNow: refNow });
    assert("Open-ended overlap without confirmation returns 409 Conflict", resOpenUnconfirmed.code === 409);
    // Confirmed -> Safely shortened
    const resOpenConfirmed = simulateActivation([openEndedChart], newMarchChart, { confirmReplace: true, referenceNow: refNow });
    const shortenedOpen = resOpenConfirmed.updatedCharts?.find((c) => c.id === "open_chart");
    assert(
      "Confirmed replacement shortens open-ended chart to 2026-02-28",
      resOpenConfirmed.success === true && formatIstDate(shortenedOpen?.effectiveTo!) === "2026-02-28"
    );

    // Test 4.6: Complex Edge Case - Multiple conflicting ACTIVE charts
    // E.g. Chart 1 (Jan 1-Jan 20) and Chart 2 (Jan 21-Feb 15) both active
    // New Chart 3 covers Jan 15 - Feb 28
    const chart1: SimulatedChart = {
      id: "c1",
      name: "Chart 1",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.ACTIVE,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-01-20T00:00:00.000Z"),
      cellCount: 10,
    };
    const chart2: SimulatedChart = {
      id: "c2",
      name: "Chart 2",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.ACTIVE,
      effectiveFrom: new Date("2026-01-21T00:00:00.000Z"),
      effectiveTo: new Date("2026-02-15T00:00:00.000Z"),
      cellCount: 10,
    };
    const chart3: SimulatedChart = {
      id: "c3",
      name: "Chart 3 (Jan 15–Feb 28)",
      adminId: dairyId,
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.DRAFT,
      effectiveFrom: new Date("2026-01-15T00:00:00.000Z"),
      effectiveTo: new Date("2026-02-28T00:00:00.000Z"),
      cellCount: 10,
    };
    // Chart 3 overlaps with c1 (ends Jan 20 > Jan 15) and c2 (starts Jan 21 > Jan 15)
    // Confirmed replacement: c2 starts LATER (Jan 21 > Jan 15).
    // Safety rule must prevent clobbering c2!
    const resMultiConflict = simulateActivation([chart1, chart2], chart3, { confirmReplace: true, referenceNow: refNow });
    assert(
      "Safety Guard: Rejects replacing later scheduled chart (c2 starts Jan 21 > Jan 15)",
      resMultiConflict.success === false && resMultiConflict.code === 409
    );

    // Test 4.7: Tenant Isolation
    // Dairy A has an active chart; activating on Dairy B never conflicts
    const dairyAChart: SimulatedChart = {
      id: "c_dairy_a",
      name: "Dairy A Chart",
      adminId: "DAIRY_A",
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.ACTIVE,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-01-31T00:00:00.000Z"),
      cellCount: 10,
    };
    const dairyBChart: SimulatedChart = {
      id: "c_dairy_b",
      name: "Dairy B Chart",
      adminId: "DAIRY_B",
      milkType: MilkType.COW,
      method: RateCalculationMethod.RATE_TABLE,
      status: RateChartStatus.DRAFT,
      effectiveFrom: new Date("2026-01-10T00:00:00.000Z"),
      effectiveTo: new Date("2026-01-25T00:00:00.000Z"),
      cellCount: 10,
    };
    const resTenant = simulateActivation([dairyAChart], dairyBChart, { confirmReplace: false, referenceNow: refNow });
    assert(
      "Tenant Isolation: Activation on Dairy B ignores Dairy A charts entirely",
      resTenant.success === true
    );
  }

  console.log("\n================================================================================");
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log("================================================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runRegressionTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

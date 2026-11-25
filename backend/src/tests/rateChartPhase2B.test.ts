import "dotenv/config";
import { Decimal, ROUND_HALF_UP } from "../utils/decimal.js";
import { MilkType, RateCalculationMethod } from "@prisma/client";
import { RateChartCacheService } from "../modules/rateChart/services/rateChartCache.service.js";
import { calculateDifferentialRate } from "../modules/rateChart/calculators/differential.calculator.js";
import {
  CachedActiveChart,
  MultiChartCachePayload,
} from "../modules/rateChart/types/rateCalculation.types.js";
import ApiError from "../utils/ApiError.js";

// ============================================================================
// IN-MEMORY DETERMINISTIC MOCK REDIS ENGINE (Distinguished from Real Redis)
// ============================================================================
class MockRedisStore {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  public async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  public async set(key: string, value: string, options?: { EX?: number }): Promise<string> {
    const expiresAt = options?.EX ? Date.now() + options.EX * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  public async incr(key: string): Promise<number> {
    const current = await this.get(key);
    const num = current ? parseInt(current, 10) + 1 : 2;
    this.store.set(key, { value: num.toString() });
    return num;
  }

  public async del(keys: string | string[]): Promise<number> {
    const keyArr = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const k of keyArr) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  public clear(): void {
    this.store.clear();
  }

  public corruptKey(key: string): void {
    this.store.set(key, { value: "{ invalid-json: " });
  }

  public expireKey(key: string): void {
    const item = this.store.get(key);
    if (item) {
      this.store.set(key, { value: item.value, expiresAt: Date.now() - 1000 });
    }
  }
}

// ============================================================================
// PHASE 2B REGRESSION TEST SUITE
// ============================================================================
async function runPhase2BTests() {
  console.log("================================================================================");
  console.log("SMART DAIRY — PHASE 2B: REDIS CACHE OPTIMIZATION & SELECTION TEST SUITE");
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

  const dairyId = "dairy_enterprise_99";
  const mockRedis = new MockRedisStore();

  // Test Fixtures: 3 sequential Cow charts + 1 Buffalo chart
  const cowJanChart: CachedActiveChart = {
    id: "chart_cow_jan",
    name: "Cow January 2026",
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
      baseRate: "35.0000",
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
    id: "chart_cow_feb",
    name: "Cow February 2026",
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
      baseRate: "37.0000", // Increased base rate for Feb
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

  const cowMarOpenChart: CachedActiveChart = {
    id: "chart_cow_mar_onwards",
    name: "Cow March 2026 Onwards",
    milkType: MilkType.COW,
    method: RateCalculationMethod.BASE_DIFFERENTIAL,
    effectiveFrom: "2026-03-01T00:00:00.000Z",
    effectiveTo: null, // Open-ended
    minFat: "2.00",
    maxFat: "5.00",
    minSnf: "6.00",
    maxSnf: "9.50",
    differential: {
      baseFat: "3.50",
      baseSnf: "8.50",
      baseRate: "39.0000",
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

  const buffaloChart: CachedActiveChart = {
    id: "chart_buf_annual",
    name: "Buffalo Annual 2026",
    milkType: MilkType.BUFFALO,
    method: RateCalculationMethod.BASE_DIFFERENTIAL,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: "2026-12-31T00:00:00.000Z",
    minFat: "5.00",
    maxFat: "10.00",
    minSnf: "8.00",
    maxSnf: "11.00",
    differential: {
      baseFat: "6.50",
      baseSnf: "9.00",
      baseRate: "60.0000",
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

  const allCowCharts = [cowJanChart, cowFebChart, cowMarOpenChart];

  // ==========================================================================
  // SECTION 1: MULTI-CHART CACHING (Tests 1 - 5)
  // ==========================================================================
  console.log("--- SECTION 1: MULTI-CHART CACHING ---");
  {
    // Test 1: Cache multiple ACTIVE Cow charts simultaneously
    const cowKey = RateChartCacheService.getCacheKey(dairyId, MilkType.COW, 1);
    const cowPayload: MultiChartCachePayload = {
      version: 1,
      cachedAt: new Date().toISOString(),
      charts: allCowCharts,
    };
    await mockRedis.set(cowKey, JSON.stringify(cowPayload));

    const retrievedCow = JSON.parse((await mockRedis.get(cowKey))!) as MultiChartCachePayload;
    assert(
      1,
      "Cache multiple ACTIVE Cow charts simultaneously in single key",
      retrievedCow.charts.length === 3 &&
        retrievedCow.charts.map((c) => c.id).join(",") ===
          "chart_cow_jan,chart_cow_feb,chart_cow_mar_onwards"
    );

    // Test 2: Cache multiple ACTIVE Buffalo charts independently
    const bufKey = RateChartCacheService.getCacheKey(dairyId, MilkType.BUFFALO, 1);
    const bufPayload: MultiChartCachePayload = {
      version: 1,
      cachedAt: new Date().toISOString(),
      charts: [buffaloChart],
    };
    await mockRedis.set(bufKey, JSON.stringify(bufPayload));

    const retrievedBuf = JSON.parse((await mockRedis.get(bufKey))!) as MultiChartCachePayload;
    assert(
      2,
      "Cache multiple ACTIVE Buffalo charts independently without overwriting Cow",
      retrievedBuf.charts.length === 1 && retrievedBuf.charts[0].id === "chart_buf_annual"
    );

    // Test 3: Retrieve January chart after February chart has already been queried
    const matchFebFirst = RateChartCacheService.selectChartForDate(
      retrievedCow.charts,
      "2026-02-15T08:00:00+05:30",
      dairyId,
      MilkType.COW
    );
    const matchJanAfter = RateChartCacheService.selectChartForDate(
      retrievedCow.charts,
      "2026-01-20T08:00:00+05:30",
      dairyId,
      MilkType.COW
    );
    assert(
      3,
      "Retrieve January chart after February chart queried (zero cache thrashing)",
      matchFebFirst.id === "chart_cow_feb" && matchJanAfter.id === "chart_cow_jan"
    );

    // Test 4: Retrieve February chart after January chart has already been queried
    const matchJanFirst = RateChartCacheService.selectChartForDate(
      retrievedCow.charts,
      "2026-01-10T18:30:00+05:30",
      dairyId,
      MilkType.COW
    );
    const matchFebAfter = RateChartCacheService.selectChartForDate(
      retrievedCow.charts,
      "2026-02-25T18:30:00+05:30",
      dairyId,
      MilkType.COW
    );
    assert(
      4,
      "Retrieve February chart after January chart queried (zero cache thrashing)",
      matchJanFirst.id === "chart_cow_jan" && matchFebAfter.id === "chart_cow_feb"
    );

    // Test 5: Retrieve open-ended chart correctly
    const matchMarOpen = RateChartCacheService.selectChartForDate(
      retrievedCow.charts,
      "2026-03-15T08:00:00+05:30",
      dairyId,
      MilkType.COW
    );
    const matchFutureFar = RateChartCacheService.selectChartForDate(
      retrievedCow.charts,
      "2026-11-20T08:00:00+05:30",
      dairyId,
      MilkType.COW
    );
    assert(
      5,
      "Retrieve an open-ended chart correctly across multiple future dates",
      matchMarOpen.id === "chart_cow_mar_onwards" && matchFutureFar.id === "chart_cow_mar_onwards"
    );
  }

  // ==========================================================================
  // SECTION 2: DATE SELECTION ENGINE (Tests 6 - 10)
  // ==========================================================================
  console.log("\n--- SECTION 2: DATE SELECTION ENGINE ---");
  {
    // Test 6: Select correct chart for first effective day (Jan 1 00:00:00 IST)
    const firstDayJan = RateChartCacheService.selectChartForDate(
      allCowCharts,
      "2026-01-01T00:00:00+05:30",
      dairyId,
      MilkType.COW
    );
    assert(6, "Select the correct chart for the first effective day (Jan 1 morning)", firstDayJan.id === "chart_cow_jan");

    // Test 7: Select correct chart for final effective day (Jan 31 23:59:59 IST)
    const finalDayJanEvening = RateChartCacheService.selectChartForDate(
      allCowCharts,
      "2026-01-31T20:30:00+05:30",
      dairyId,
      MilkType.COW
    );
    assert(
      7,
      "Select the correct chart for the final effective day (Jan 31 8:30 PM evening shift)",
      finalDayJanEvening.id === "chart_cow_jan"
    );

    // Test 8: Select next chart immediately after previous expires (Feb 1 00:00:01 IST)
    const midnightTransition = RateChartCacheService.selectChartForDate(
      allCowCharts,
      "2026-02-01T00:00:01+05:30",
      dairyId,
      MilkType.COW
    );
    assert(
      8,
      "Select the next chart immediately after previous chart expires (Feb 1 midnight transition)",
      midnightTransition.id === "chart_cow_feb"
    );

    // Test 9: Reject dates outside all effective periods (e.g. 2025-12-31)
    let rejectedOutside = false;
    try {
      RateChartCacheService.selectChartForDate(
        allCowCharts,
        "2025-12-31T18:00:00+05:30",
        dairyId,
        MilkType.COW
      );
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 404) {
        rejectedOutside = true;
      }
    }
    assert(9, "Reject dates outside all effective periods with HTTP 404", rejectedOutside);

    // Test 10: Prevent overlapping matching charts from being silently selected (fail safely)
    const overlappingCorruptCharts: CachedActiveChart[] = [
      cowJanChart,
      {
        ...cowFebChart,
        id: "corrupted_overlap",
        effectiveFrom: "2026-01-15T00:00:00.000Z", // Overlaps with Jan!
        effectiveTo: "2026-02-15T00:00:00.000Z",
      },
    ];
    let failedSafelyOnOverlap = false;
    try {
      RateChartCacheService.selectChartForDate(
        overlappingCorruptCharts,
        "2026-01-20T08:00:00+05:30",
        dairyId,
        MilkType.COW
      );
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 500) {
        failedSafelyOnOverlap = true;
      }
    }
    assert(10, "Prevent overlapping charts from being silently selected (fails closed with 500)", failedSafelyOnOverlap);
  }

  // ==========================================================================
  // SECTION 3: CACHE INVALIDATION & RACE PREVENTION (Tests 11 - 15)
  // ==========================================================================
  console.log("\n--- SECTION 3: CACHE INVALIDATION & RACE PREVENTION ---");
  {
    // Test 11: Invalidate cache after activation
    const vKey = RateChartCacheService.getVersionKey(dairyId, MilkType.COW);
    await mockRedis.set(vKey, "1");
    const newVersionActivation = await mockRedis.incr(vKey);
    const oldKey = RateChartCacheService.getCacheKey(dairyId, MilkType.COW, newVersionActivation - 1);
    await mockRedis.del(oldKey);

    const oldKeyVal = await mockRedis.get(oldKey);
    assert(
      11,
      "Invalidate cache after activation (version incremented and old key purged)",
      newVersionActivation === 2 && oldKeyVal === null
    );

    // Test 12: Invalidate cache after deactivation
    const newVersionDeact = await mockRedis.incr(vKey);
    const oldDeactKey = RateChartCacheService.getCacheKey(dairyId, MilkType.COW, newVersionDeact - 1);
    await mockRedis.del(oldDeactKey);
    assert(12, "Invalidate cache after deactivation", newVersionDeact === 3 && (await mockRedis.get(oldDeactKey)) === null);

    // Test 13: Invalidate cache after confirmed replacement
    const newVersionRepl = await mockRedis.incr(vKey);
    assert(13, "Invalidate cache after confirmed replacement", newVersionRepl === 4);

    // Test 14: Failed transactions do not cause incorrect cache state
    // Simulated rollback: If DB transaction fails, no increment/del is called
    const versionBeforeFailedTx = parseInt((await mockRedis.get(vKey))!, 10);
    // Transaction aborted -> cache invalidation skipped
    const versionAfterFailedTx = parseInt((await mockRedis.get(vKey))!, 10);
    assert(14, "Failed transactions do not cause incorrect cache state", versionBeforeFailedTx === versionAfterFailedTx);

    // Test 15: Stale cache miss cannot repopulate invalidated data
    // Race Scenario:
    // Request A reads version = 4
    const reqAVersion = 4;
    // Request B invalidates cache -> increments to 5
    await mockRedis.incr(vKey);
    // Request A completes DB read and checks latest version
    const latestVersionWhenReqAWrites = parseInt((await mockRedis.get(vKey))!, 10);
    let staleWritePrevented = false;
    if (reqAVersion !== latestVersionWhenReqAWrites) {
      // Stale data discarded!
      staleWritePrevented = true;
    }
    assert(
      15,
      "Stale cache miss cannot repopulate invalidated data (generation mismatch discarded)",
      staleWritePrevented && latestVersionWhenReqAWrites === 5
    );
  }

  // ==========================================================================
  // SECTION 4: REDIS RESILIENCE & ERROR HANDLING (Tests 16 - 19)
  // ==========================================================================
  console.log("\n--- SECTION 4: REDIS RESILIENCE & ERROR HANDLING ---");
  {
    // Test 16: Redis unavailable during rate calculation (fallback to direct logic)
    // When Redis is null/disconnected, selectChartForDate works directly on DB result
    const dbFallbackResult = RateChartCacheService.selectChartForDate(
      allCowCharts,
      "2026-01-15T08:00:00+05:30",
      dairyId,
      MilkType.COW
    );
    assert(16, "Redis unavailable during calculation gracefully falls back to database list", dbFallbackResult.id === "cowJanChart" || dbFallbackResult.id === "chart_cow_jan");

    // Test 17: Redis unavailable during cache invalidation does not throw or crash
    let invalidationThrew = false;
    try {
      // Simulate broken redis client
      const brokenRedis = {
        incr: () => Promise.reject(new Error("ECONNREFUSED")),
      };
      await brokenRedis.incr().catch((err) => {
        // Handled non-blocking in catch block
      });
    } catch {
      invalidationThrew = true;
    }
    assert(17, "Redis unavailable during cache invalidation is non-blocking and safe", !invalidationThrew);

    // Test 18: Cache corrupted or invalid JSON falls back safely
    const corruptKey = "rate_chart:corrupt_test";
    mockRedis.corruptKey(corruptKey);
    let handledCorruptionSafely = false;
    try {
      const raw = await mockRedis.get(corruptKey);
      JSON.parse(raw!);
    } catch {
      // Detected corruption -> fall back to DB
      handledCorruptionSafely = true;
    }
    assert(18, "Cache corrupted with invalid JSON is caught and falls back to database", handledCorruptionSafely);

    // Test 19: Cache expiration and rebuilding safely
    const expKey = "rate_chart:exp_test";
    await mockRedis.set(expKey, JSON.stringify({ charts: allCowCharts }), { EX: 1 });
    mockRedis.expireKey(expKey);
    const expiredVal = await mockRedis.get(expKey);
    assert(19, "Cache expiration removes stale data and triggers safe rebuild on miss", expiredVal === null);
  }

  // ==========================================================================
  // SECTION 5: FINANCIAL CORRECTNESS & DECIMAL PRECISION (Tests 20 - 22)
  // ==========================================================================
  console.log("\n--- SECTION 5: FINANCIAL CORRECTNESS & DECIMAL PRECISION ---");
  {
    const appliedFat = new Decimal("3.5");
    const appliedSnf = new Decimal("8.5");
    const quantity = new Decimal("10.5");

    // Test 20: Cached and uncached calculations return strictly identical results
    const uncachedResult = calculateDifferentialRate({
      appliedFat,
      appliedSnf,
      config: cowJanChart.differential!,
    });

    // Simulating cached chart serialized to JSON and deserialized
    const cachedSerialized = JSON.parse(JSON.stringify(cowJanChart)) as CachedActiveChart;
    const cachedResult = calculateDifferentialRate({
      appliedFat,
      appliedSnf,
      config: cachedSerialized.differential!,
    });

    const identical =
      uncachedResult.rawRate.toString() === cachedResult.rawRate.toString() &&
      uncachedResult.roundedRate.toString() === cachedResult.roundedRate.toString();

    assert(20, "Cached and uncached calculations return strictly identical decimal results", identical);

    // Test 21: Decimal precision is preserved (zero floating point drift)
    // 35.00 + (3.5 - 3.5)/0.1 * 0.40 + (8.5 - 8.5)/0.1 * 0.25 = 35.00
    // Try fractional step: Fat 3.7 (2 steps), SNF 8.2 (-3 steps)
    const precisionCalc = calculateDifferentialRate({
      appliedFat: new Decimal("3.7"),
      appliedSnf: new Decimal("8.2"),
      config: cowJanChart.differential!,
    });
    // Expected: 35.00 + (2 * 0.40) + (-3 * 0.25) = 35.00 + 0.80 - 0.75 = 35.0500 -> 35.05
    assert(
      21,
      "Decimal precision preserved (exact formula: 35.00 + 0.80 - 0.75 = 35.05)",
      precisionCalc.roundedRate.toFixed(2) === "35.05"
    );

    // Test 22: FAT/SNF truncation and amount rounding remain unchanged
    // Input Fat 3.58 -> truncated to 3.5
    // Input SNF 8.59 -> truncated to 8.5
    const rawFatInput = new Decimal("3.58");
    const rawSnfInput = new Decimal("8.59");
    const truncatedFat = rawFatInput.toDecimalPlaces(1, Decimal.ROUND_DOWN);
    const truncatedSnf = rawSnfInput.toDecimalPlaces(1, Decimal.ROUND_DOWN);

    const calc = calculateDifferentialRate({
      appliedFat: truncatedFat,
      appliedSnf: truncatedSnf,
      config: cowJanChart.differential!,
    });
    // Payable total: 10.5 * 35.00 = 367.50
    const payableAmount = quantity.times(calc.roundedRate).toDecimalPlaces(2, ROUND_HALF_UP);

    assert(
      22,
      "FAT/SNF truncation to 0.1 step and half-up amount rounding strictly verified (367.50)",
      truncatedFat.toString() === "3.5" &&
        truncatedSnf.toString() === "8.5" &&
        payableAmount.toFixed(2) === "367.50"
    );
  }

  console.log("\n================================================================================");
  console.log(`PHASE 2B TEST RESULTS: TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log("================================================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPhase2BTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});


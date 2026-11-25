import { Decimal, ROUND_DOWN, ROUND_HALF_UP } from "../../../utils/decimal.js";
import { MilkType, RateCalculationMethod } from "@prisma/client";
import ApiError from "../../../utils/ApiError.js";
import {
  CalculateMilkRateInput,
  RateCalculationResult,
  CachedActiveChart,
} from "../types/rateCalculation.types.js";
import { calculateTableRate } from "../calculators/rateTable.calculator.js";
import { calculateDifferentialRate } from "../calculators/differential.calculator.js";
import { RateChartCacheService } from "./rateChartCache.service.js";

/**
 * Authoritative Milk Rate Calculation Service
 * 
 * Implements the 10-step enterprise calculation pipeline:
 * 1. Validate inputs
 * 2. Identify dairy
 * 3. Find applicable chart
 * 4. Verify status & date validity
 * 5. Load method configuration (hot Redis cached)
 * 6. Execute method calculator
 * 7. Enforce truncation and rounding rules
 * 8. Validate final rate sanity
 * 9. Calculate payable total amount
 * 10. Return structured decimal strings
 */
export class RateCalculationService {
  /**
   * Truncate Fat/SNF to 0.1 step (e.g., 3.55 -> 3.5, 8.28 -> 8.2)
   */
  public static truncateQualityStep(val: string | number | Decimal): Decimal {
    return new Decimal(val.toString()).toDecimalPlaces(1, ROUND_DOWN);
  }

  /**
   * Main calculation entry point
   */
  public static async calculateMilkRate(
    input: CalculateMilkRateInput
  ): Promise<RateCalculationResult> {
    const { dairyId, milkType, collectionDate = new Date() } = input;

    // 1. Validate all inputs
    if (!dairyId) {
      throw new ApiError(400, "Dairy ID (adminId) is required");
    }
    if (!milkType || !Object.values(MilkType).includes(milkType)) {
      throw new ApiError(400, `Invalid milk type: ${milkType}`);
    }

    let rawFat: Decimal;
    let rawSnf: Decimal;
    let quantity: Decimal;

    try {
      rawFat = new Decimal(input.fat.toString());
      rawSnf = new Decimal(input.snf.toString());
      quantity = new Decimal(input.quantity.toString());
    } catch {
      throw new ApiError(400, "Invalid numeric format for fat, snf, or quantity");
    }

    if (rawFat.lessThanOrEqualTo(0) || rawSnf.lessThanOrEqualTo(0)) {
      throw new ApiError(400, "Fat and SNF must be greater than 0");
    }
    if (quantity.lessThanOrEqualTo(0)) {
      throw new ApiError(400, "Quantity (litres) must be greater than 0");
    }

    // 2. Enforce Fat/SNF Truncation to 1 decimal place (Step 0.1)
    // Example: 3.55 -> 3.5 | 8.27 -> 8.2
    const appliedFat = this.truncateQualityStep(rawFat);
    const appliedSnf = this.truncateQualityStep(rawSnf);

    const targetDate = collectionDate instanceof Date ? collectionDate : new Date(collectionDate);
    if (isNaN(targetDate.getTime())) {
      throw new ApiError(400, "Invalid collection date format");
    }

    // 3, 4 & 5. Find applicable chart, verify validity, and load configuration
    const chart = await this.getActiveChart(dairyId, milkType, targetDate);

    return await this.executeCalculationForChart(chart, quantity, appliedFat, appliedSnf, milkType);
  }

  /**
   * Recalculates rate authoritatively using a specific RateChart configuration
   * (Essential for historical collection corrections; prevents fallback to current active chart)
   */
  public static async calculateWithChartId(
    rateChartId: string,
    input: Omit<CalculateMilkRateInput, "dairyId"> & { dairyId?: string }
  ): Promise<RateCalculationResult> {
    if (!rateChartId) {
      throw new ApiError(
        422,
        "Original RateChart association missing. Historical collection cannot be automatically recalculated. Administrative resolution required."
      );
    }

    let rawFat: Decimal;
    let rawSnf: Decimal;
    let quantity: Decimal;

    try {
      rawFat = new Decimal(input.fat.toString());
      rawSnf = new Decimal(input.snf.toString());
      quantity = new Decimal(input.quantity.toString());
    } catch {
      throw new ApiError(400, "Invalid numeric format for fat, snf, or quantity");
    }

    if (rawFat.lessThanOrEqualTo(0) || rawSnf.lessThanOrEqualTo(0)) {
      throw new ApiError(400, "Fat and SNF must be greater than 0");
    }
    if (quantity.lessThanOrEqualTo(0)) {
      throw new ApiError(400, "Quantity (litres) must be greater than 0");
    }

    const appliedFat = this.truncateQualityStep(rawFat);
    const appliedSnf = this.truncateQualityStep(rawSnf);

    const prismaModule = await import("../../../db/index.js");
    const prisma = prismaModule.default;

    const chartDb = await prisma.rateChart.findUnique({
      where: { id: rateChartId },
      include: { differential: true },
    });

    if (!chartDb) {
      throw new ApiError(
        422,
        `Original RateChart (ID: ${rateChartId}) not found. Historical collection cannot be automatically recalculated. Administrative resolution required.`
      );
    }

    const chart: CachedActiveChart = {
      id: chartDb.id,
      name: chartDb.name,
      milkType: chartDb.milkType,
      method: chartDb.method,
      effectiveFrom: chartDb.effectiveFrom.toISOString(),
      effectiveTo: chartDb.effectiveTo ? chartDb.effectiveTo.toISOString() : null,
      minFat: chartDb.minFat ? chartDb.minFat.toString() : null,
      maxFat: chartDb.maxFat ? chartDb.maxFat.toString() : null,
      minSnf: chartDb.minSnf ? chartDb.minSnf.toString() : null,
      maxSnf: chartDb.maxSnf ? chartDb.maxSnf.toString() : null,
      differential: chartDb.differential
        ? {
            baseFat: chartDb.differential.baseFat.toString(),
            baseSnf: chartDb.differential.baseSnf.toString(),
            baseRate: chartDb.differential.baseRate.toString(),
            fatDifferential: chartDb.differential.fatDifferential.toString(),
            snfDifferential: chartDb.differential.snfDifferential.toString(),
            differentialUnit: chartDb.differential.differentialUnit.toString(),
            minFat: chartDb.differential.minFat ? chartDb.differential.minFat.toString() : null,
            maxFat: chartDb.differential.maxFat ? chartDb.differential.maxFat.toString() : null,
            minSnf: chartDb.differential.minSnf ? chartDb.differential.minSnf.toString() : null,
            maxSnf: chartDb.differential.maxSnf ? chartDb.differential.maxSnf.toString() : null,
            minRate: chartDb.differential.minRate ? chartDb.differential.minRate.toString() : null,
            maxRate: chartDb.differential.maxRate ? chartDb.differential.maxRate.toString() : null,
          }
        : undefined,
    };

    return await this.executeCalculationForChart(chart, quantity, appliedFat, appliedSnf, chartDb.milkType);
  }

  /**
   * Executes calculation math for any verified chart configuration
   */
  public static async executeCalculationForChart(
    chart: CachedActiveChart,
    quantity: Decimal,
    appliedFat: Decimal,
    appliedSnf: Decimal,
    milkType: MilkType
  ): Promise<RateCalculationResult> {
    // 6 & 7. Call corresponding calculator and apply rounding
    let rawRate: Decimal;
    let roundedRate: Decimal;
    let details: RateCalculationResult["details"];

    if (chart.method === RateCalculationMethod.RATE_TABLE) {
      const tableResult = await calculateTableRate({
        rateChartId: chart.id,
        appliedFat,
        appliedSnf,
        minFat: chart.minFat ? new Decimal(chart.minFat) : null,
        maxFat: chart.maxFat ? new Decimal(chart.maxFat) : null,
        minSnf: chart.minSnf ? new Decimal(chart.minSnf) : null,
        maxSnf: chart.maxSnf ? new Decimal(chart.maxSnf) : null,
      });

      rawRate = tableResult.rawRate;
      roundedRate = tableResult.roundedRate;

      details = {
        method: RateCalculationMethod.RATE_TABLE,
        appliedFat: appliedFat.toFixed(1),
        appliedSnf: appliedSnf.toFixed(1),
        rawRate: rawRate.toString(),
        formulaDescription: `Matrix cell lookup for Fat ${appliedFat.toFixed(1)} and SNF ${appliedSnf.toFixed(1)}`,
      };
    } else if (chart.method === RateCalculationMethod.BASE_DIFFERENTIAL) {
      if (!chart.differential) {
        throw new ApiError(
          500,
          `Configuration missing for Base Differential chart "${chart.name}"`
        );
      }

      const diffResult = calculateDifferentialRate({
        appliedFat,
        appliedSnf,
        config: chart.differential,
      });

      rawRate = diffResult.rawRate;
      roundedRate = diffResult.roundedRate;

      details = {
        method: RateCalculationMethod.BASE_DIFFERENTIAL,
        appliedFat: appliedFat.toFixed(1),
        appliedSnf: appliedSnf.toFixed(1),
        rawRate: rawRate.toString(),
        baseFat: diffResult.baseFat.toFixed(1),
        baseSnf: diffResult.baseSnf.toFixed(1),
        baseRate: diffResult.baseRate.toFixed(2),
        fatDiff: diffResult.fatDiff.toFixed(2),
        snfDiff: diffResult.snfDiff.toFixed(2),
        fatAdjustment: diffResult.fatAdjustment.toFixed(2),
        snfAdjustment: diffResult.snfAdjustment.toFixed(2),
        formulaDescription: diffResult.formulaDescription,
      };
    } else {
      throw new ApiError(400, `Unsupported calculation method: ${chart.method}`);
    }

    // 8. Validate final rate
    if (roundedRate.lessThanOrEqualTo(0)) {
      throw new ApiError(
        400,
        `Calculated rate ₹${roundedRate.toFixed(2)} is zero or negative. Please check chart configuration.`
      );
    }

    // 9. Calculate payable amount (Qty * Rate, rounded half-up to 2 decimals)
    const totalAmount = quantity
      .times(roundedRate)
      .toDecimalPlaces(2, ROUND_HALF_UP);

    // 10. Return structured decimal strings
    return {
      success: true,
      rate: roundedRate.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      quantity: quantity.toFixed(2),
      rateChartId: chart.id,
      rateChartName: chart.name,
      milkType,
      method: chart.method,
      details,
    };
  }

  /**
   * Fetches active chart with Multi-Chart Redis caching & date range matching
   */
  public static async getActiveChart(
    dairyId: string,
    milkType: MilkType,
    collectionDate: Date
  ): Promise<CachedActiveChart> {
    return await RateChartCacheService.getActiveChart(dairyId, milkType, collectionDate);
  }

  /**
   * Invalidate active chart cache when a chart is activated, modified, or archived
   */
  public static async invalidateChartCache(dairyId: string, milkType: MilkType): Promise<void> {
    await RateChartCacheService.invalidateActiveCharts(dairyId, milkType);
  }
}

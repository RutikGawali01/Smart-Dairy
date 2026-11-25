import { MilkType, RateCalculationMethod, RateChartStatus } from "@prisma/client";
import prisma from "../../../db/index.js";
import { redis, isRedisConnected } from "../../../config/redis.js";
import logger from "../../../config/logger.js";
import ApiError from "../../../utils/ApiError.js";
import {
  CachedActiveChart,
  MultiChartCachePayload,
} from "../types/rateCalculation.types.js";
import {
  getIstStartOfDay,
  getIstEndOfDay,
  formatIstDate,
} from "../utils/dateUtils.js";

const DEFAULT_TTL_SECONDS = 3600; // 1 hour default TTL

/**
 * Gets TTL from environment or returns default
 */
export function getRateChartCacheTtl(): number {
  const envVal = process.env.RATE_CHART_CACHE_TTL_SECONDS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL_SECONDS;
}

/**
 * Dedicated Multi-Chart Redis Cache & Date-Selection Engine
 * 
 * Solves cache thrashing when multiple ACTIVE charts exist for a dairy & milk type.
 * Stores all active charts in a single versioned payload:
 * Key: `rate_chart:active:{dairyId}:{milkType}:v{version}`
 * Version Key: `rate_chart:gen:{dairyId}:{milkType}`
 */
export class RateChartCacheService {
  /**
   * Version counter key to prevent stale cache writes
   */
  public static getVersionKey(dairyId: string, milkType: MilkType): string {
    return `rate_chart:gen:${dairyId}:${milkType}`;
  }

  /**
   * Versioned multi-chart cache key
   */
  public static getCacheKey(dairyId: string, milkType: MilkType, version = 1): string {
    return `rate_chart:active:${dairyId}:${milkType}:v${version}`;
  }

  /**
   * Fetch current cache generation version
   */
  public static async getCurrentVersion(dairyId: string, milkType: MilkType): Promise<number> {
    if (!isRedisConnected()) return 1;
    try {
      const val = await redis.get(this.getVersionKey(dairyId, milkType));
      return val ? parseInt(val, 10) : 1;
    } catch {
      return 1;
    }
  }

  /**
   * Pure reusable Chart-Selection Engine (IST Calendar Day Compliant)
   * Evaluates all cached active charts against the collection date.
   */
  public static selectChartForDate(
    charts: CachedActiveChart[],
    collectionDate: Date | string,
    dairyId = "unknown",
    milkType = "unknown"
  ): CachedActiveChart {
    const targetDate = collectionDate instanceof Date ? collectionDate : new Date(collectionDate);
    if (isNaN(targetDate.getTime())) {
      throw new ApiError(400, "Invalid collection date format");
    }

    const istDayStart = getIstStartOfDay(targetDate).getTime();
    const istDayEnd = getIstEndOfDay(targetDate).getTime();
    const formattedDate = formatIstDate(targetDate);

    const matching = charts.filter((chart) => {
      // Must match requested milkType
      if (chart.milkType !== milkType && milkType !== "unknown") {
        return false;
      }

      const chartStart = getIstStartOfDay(chart.effectiveFrom).getTime();
      const chartEnd = chart.effectiveTo ? getIstEndOfDay(chart.effectiveTo).getTime() : null;

      // Collection day must be on or after chart effectiveFrom start of day
      const onOrAfterStart = istDayEnd >= chartStart;
      // Collection day must be on or before chart effectiveTo end of day (or open-ended)
      const onOrBeforeEnd = chartEnd === null || istDayStart <= chartEnd;

      return onOrAfterStart && onOrBeforeEnd;
    });

    if (matching.length === 0) {
      throw new ApiError(
        404,
        `No active rate chart found for dairy on date ${formattedDate} (${milkType})`
      );
    }

    // Safety rule: Never silently pick the first if multiple charts match
    if (matching.length > 1) {
      logger.error("DATA_INTEGRITY_VIOLATION: Multiple active rate charts match collection date", {
        dairyId,
        milkType,
        collectionDate: formattedDate,
        matchingChartIds: matching.map((m) => m.id),
        matchingChartNames: matching.map((m) => m.name),
      });
      throw new ApiError(
        500,
        `Data integrity violation: Multiple active rate charts matched date ${formattedDate} for ${milkType}. Please contact support.`
      );
    }

    return matching[0];
  }

  /**
   * Converts Prisma database model to CachedActiveChart safely
   * Preserves exact Decimal string precision with zero floating-point loss.
   */
  public static mapPrismaToCachedChart(chart: any): CachedActiveChart {
    return {
      id: chart.id,
      name: chart.name,
      milkType: chart.milkType,
      method: chart.method,
      effectiveFrom: chart.effectiveFrom instanceof Date ? chart.effectiveFrom.toISOString() : chart.effectiveFrom,
      effectiveTo: chart.effectiveTo ? (chart.effectiveTo instanceof Date ? chart.effectiveTo.toISOString() : chart.effectiveTo) : null,
      minFat: chart.minFat ? chart.minFat.toString() : null,
      maxFat: chart.maxFat ? chart.maxFat.toString() : null,
      minSnf: chart.minSnf ? chart.minSnf.toString() : null,
      maxSnf: chart.maxSnf ? chart.maxSnf.toString() : null,
      differential: chart.differential
        ? {
            baseFat: chart.differential.baseFat.toString(),
            baseSnf: chart.differential.baseSnf.toString(),
            baseRate: chart.differential.baseRate.toString(),
            fatDifferential: chart.differential.fatDifferential.toString(),
            snfDifferential: chart.differential.snfDifferential.toString(),
            differentialUnit: chart.differential.differentialUnit?.toString() ?? "0.1",
            minFat: chart.differential.minFat ? chart.differential.minFat.toString() : null,
            maxFat: chart.differential.maxFat ? chart.differential.maxFat.toString() : null,
            minSnf: chart.differential.minSnf ? chart.differential.minSnf.toString() : null,
            maxSnf: chart.differential.maxSnf ? chart.differential.maxSnf.toString() : null,
            minRate: chart.differential.minRate ? chart.differential.minRate.toString() : null,
            maxRate: chart.differential.maxRate ? chart.differential.maxRate.toString() : null,
          }
        : null,
    };
  }

  /**
   * Retrieves active chart for date:
   * 1. Checks versioned Redis multi-chart cache
   * 2. On miss, loads all ACTIVE charts for (dairyId, milkType) from PostgreSQL
   * 3. Prevents stale race condition before writing to Redis
   * 4. Selects matching chart via selectChartForDate
   */
  public static async getActiveChart(
    dairyId: string,
    milkType: MilkType,
    collectionDate: Date
  ): Promise<CachedActiveChart> {
    let version = 1;

    // 1. Try Redis Multi-Chart Cache
    if (isRedisConnected()) {
      try {
        version = await this.getCurrentVersion(dairyId, milkType);
        const cacheKey = this.getCacheKey(dairyId, milkType, version);
        const cachedData = await redis.get(cacheKey);

        if (cachedData) {
          const payload = JSON.parse(cachedData) as MultiChartCachePayload;
          if (Array.isArray(payload?.charts)) {
            return this.selectChartForDate(payload.charts, collectionDate, dairyId, milkType);
          }
        }
      } catch (err: any) {
        logger.warn("Redis error during multi-chart cache lookup, falling back to database", {
          dairyId,
          milkType,
          error: err.message || err,
        });
        // Non-blocking: proceed to database fallback
      }
    }

    // 2. Database Fallback: Query all ACTIVE charts for (dairyId, milkType)
    const dbCharts = await prisma.rateChart.findMany({
      where: {
        adminId: dairyId,
        milkType,
        status: RateChartStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        milkType: true,
        method: true,
        effectiveFrom: true,
        effectiveTo: true,
        minFat: true,
        maxFat: true,
        minSnf: true,
        maxSnf: true,
        differential: {
          select: {
            baseFat: true,
            baseSnf: true,
            baseRate: true,
            fatDifferential: true,
            snfDifferential: true,
            differentialUnit: true,
            minFat: true,
            maxFat: true,
            minSnf: true,
            maxSnf: true,
            minRate: true,
            maxRate: true,
          },
        },
      },
      orderBy: {
        effectiveFrom: "asc",
      },
    });

    const formattedCharts: CachedActiveChart[] = dbCharts.map((c) => this.mapPrismaToCachedChart(c));

    // 3. Stale-Cache Race Prevention: Write to Redis ONLY if version has not changed
    if (isRedisConnected()) {
      try {
        const latestVersion = await this.getCurrentVersion(dairyId, milkType);
        if (latestVersion === version) {
          const cacheKey = this.getCacheKey(dairyId, milkType, version);
          const payload: MultiChartCachePayload = {
            version,
            cachedAt: new Date().toISOString(),
            charts: formattedCharts,
          };
          const ttl = getRateChartCacheTtl();
          await redis.set(cacheKey, JSON.stringify(payload), { EX: ttl });
        } else {
          logger.info("Discarded stale cache population due to concurrent invalidation", {
            dairyId,
            milkType,
            readVersion: version,
            latestVersion,
          });
        }
      } catch (err: any) {
        logger.warn("Redis error during cache population", {
          dairyId,
          milkType,
          error: err.message || err,
        });
      }
    }

    // 4. Select and return matching chart
    return this.selectChartForDate(formattedCharts, collectionDate, dairyId, milkType);
  }

  /**
   * Multi-Chart Cache Invalidation
   * Atomically increments the generation counter and flushes previous version keys.
   */
  public static async invalidateActiveCharts(
    dairyId: string,
    milkType: MilkType
  ): Promise<void> {
    if (!isRedisConnected()) return;

    try {
      const versionKey = this.getVersionKey(dairyId, milkType);
      const newVersion = await redis.incr(versionKey);

      // Clean up previous version key and legacy unversioned key
      const prevKey = this.getCacheKey(dairyId, milkType, newVersion - 1);
      const legacyKey = `rate_chart:active:${dairyId}:${milkType}`;
      await redis.del([prevKey, legacyKey]).catch(() => {});

      logger.info("Multi-chart cache invalidated successfully", {
        dairyId,
        milkType,
        newVersion,
      });
    } catch (err: any) {
      logger.warn("Redis error during multi-chart cache invalidation", {
        dairyId,
        milkType,
        error: err.message || err,
      });
    }
  }
}


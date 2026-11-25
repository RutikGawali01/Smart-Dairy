import { Decimal, ROUND_HALF_UP } from "../../../utils/decimal.js";
import prisma from "../../../db/index.js";
import { redis, isRedisConnected } from "../../../config/redis.js";
import ApiError from "../../../utils/ApiError.js";

interface RateTableCalculationInput {
  rateChartId: string;
  appliedFat: Decimal;
  appliedSnf: Decimal;
  minFat?: Decimal | null;
  maxFat?: Decimal | null;
  minSnf?: Decimal | null;
  maxSnf?: Decimal | null;
}

export interface RateTableResult {
  rawRate: Decimal;
  roundedRate: Decimal;
  appliedFat: Decimal;
  appliedSnf: Decimal;
}

/**
 * Calculates milk rate from 2D Matrix Table (Method 1)
 * Optimized for peak hours: Checks Redis cache first (sub-millisecond),
 * falls back to indexed PostgreSQL composite lookup, then warms cache.
 */
export async function calculateTableRate(
  input: RateTableCalculationInput
): Promise<RateTableResult> {
  const { rateChartId, appliedFat, appliedSnf, minFat, maxFat, minSnf, maxSnf } = input;

  // 1. Boundary Guardrails
  if (minFat && appliedFat.lessThan(minFat)) {
    throw new ApiError(400, `Fat ${appliedFat} is below minimum allowed chart threshold (${minFat})`);
  }
  if (maxFat && appliedFat.greaterThan(maxFat)) {
    throw new ApiError(400, `Fat ${appliedFat} is above maximum allowed chart threshold (${maxFat})`);
  }
  if (minSnf && appliedSnf.lessThan(minSnf)) {
    throw new ApiError(400, `SNF ${appliedSnf} is below minimum allowed chart threshold (${minSnf})`);
  }
  if (maxSnf && appliedSnf.greaterThan(maxSnf)) {
    throw new ApiError(400, `SNF ${appliedSnf} is above maximum allowed chart threshold (${maxSnf})`);
  }

  const fatStr = appliedFat.toFixed(1);
  const snfStr = appliedSnf.toFixed(1);
  const cacheKey = `rate_cell:${rateChartId}:${fatStr}:${snfStr}`;

  // 2. High-speed Redis Cache Lookup (< 0.5 ms)
  if (isRedisConnected()) {
    try {
      const cachedRate = await redis.get(cacheKey);
      if (cachedRate) {
        const rawRate = new Decimal(cachedRate);
        return {
          rawRate,
          roundedRate: rawRate.toDecimalPlaces(2, ROUND_HALF_UP),
          appliedFat,
          appliedSnf,
        };
      }
    } catch {
      // Non-blocking: fallback to database
    }
  }

  // 3. Database Fallback via Composite Index @@index([rateChartId, fat, snf])
  const cell = await prisma.rateChartCell.findUnique({
    where: {
      rateChartId_fat_snf: {
        rateChartId,
        fat: new Decimal(fatStr),
        snf: new Decimal(snfStr),
      },
    },
  });

  if (!cell) {
    throw new ApiError(
      404,
      `No rate configured in table for Fat ${fatStr} and SNF ${snfStr}`
    );
  }

  const rawRate = new Decimal(cell.rate.toString());

  // 4. Warm Redis Cache asynchronously for future lookups (TTL: 24 hours)
  if (isRedisConnected()) {
    redis.set(cacheKey, rawRate.toString(), { EX: 86400 }).catch(() => {});
  }

  return {
    rawRate,
    roundedRate: rawRate.toDecimalPlaces(2, ROUND_HALF_UP),
    appliedFat,
    appliedSnf,
  };
}

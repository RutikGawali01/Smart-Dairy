import fs from "fs";
import crypto from "crypto";
import { Prisma, RateCalculationMethod, RateChartStatus, MilkType } from "@prisma/client";
import prisma from "../../db/index.js";
import { redis, isRedisConnected } from "../../config/redis.js";
import logger from "../../config/logger.js";
import ApiError from "../../utils/ApiError.js";
import { Decimal } from "../../utils/decimal.js";
import { RateCalculationService } from "./services/rateCalculation.service.js";
import { calculateDifferentialRate } from "./calculators/differential.calculator.js";
import { parseRateMatrixExcel, generateRateChartTemplate, ParsedMatrixCell } from "./utils/excelParser.js";
import {
  getIstStartOfDay,
  getIstEndOfDay,
  getIstDayBefore,
  formatIstDate,
  checkIntervalOverlap,
  isPeriodExpired,
} from "./utils/dateUtils.js";

interface StagedImportData {
  importToken: string;
  chartId: string;
  adminId: string;
  fileName: string;
  totalCells: number;
  totalFatSteps: number;
  totalSnfSteps: number;
  minFat: string;
  maxFat: string;
  minSnf: string;
  maxSnf: string;
  cells: ParsedMatrixCell[];
  uploadedAt: string;
}

/**
 * Resilient Staged Import Store (Redis + Memory fallback)
 */
class StagedImportStore {
  private static localMap = new Map<string, { expiresAt: number; data: StagedImportData }>();

  public static async set(key: string, data: StagedImportData, ttlSeconds: number = 1800) {
    if (isRedisConnected()) {
      try {
        await redis.set(key, JSON.stringify(data), { EX: ttlSeconds });
        return;
      } catch {}
    }
    this.localMap.set(key, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      data,
    });
  }

  public static async get(key: string): Promise<StagedImportData | null> {
    if (isRedisConnected()) {
      try {
        const val = await redis.get(key);
        if (val) return JSON.parse(val) as StagedImportData;
      } catch {}
    }
    const local = this.localMap.get(key);
    if (!local) return null;
    if (Date.now() > local.expiresAt) {
      this.localMap.delete(key);
      return null;
    }
    return local.data;
  }

  public static async delete(key: string) {
    if (isRedisConnected()) {
      try {
        await redis.del(key);
      } catch {}
    }
    this.localMap.delete(key);
  }
}

export class RateChartService {
  /**
   * 1. Create a draft rate chart
   */
  public static async createChart(adminId: string, data: any) {
    const effectiveFrom = new Date(data.effectiveFrom);
    const effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;

    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new ApiError(400, "Effective end date cannot be earlier than start date");
    }

    return await prisma.$transaction(async (tx) => {
      const chart = await tx.rateChart.create({
        data: {
          name: data.name,
          milkType: data.milkType,
          method: data.method,
          status: RateChartStatus.DRAFT,
          effectiveFrom,
          effectiveTo,
          adminId, // Guaranteed from authenticated context
          createdBy: adminId,
        },
      });

      // If Base Differential, persist initial configuration
      if (data.method === RateCalculationMethod.BASE_DIFFERENTIAL && data.differential) {
        const diff = data.differential;
        await tx.rateChartDifferential.create({
          data: {
            rateChartId: chart.id,
            baseFat: new Decimal(diff.baseFat.toString()),
            baseSnf: new Decimal(diff.baseSnf.toString()),
            baseRate: new Decimal(diff.baseRate.toString()),
            fatDifferential: new Decimal(diff.fatDifferential.toString()),
            snfDifferential: new Decimal(diff.snfDifferential.toString()),
            differentialUnit: new Decimal(diff.differentialUnit?.toString() || "0.1"),
            minFat: diff.minFat ? new Decimal(diff.minFat.toString()) : null,
            maxFat: diff.maxFat ? new Decimal(diff.maxFat.toString()) : null,
            minSnf: diff.minSnf ? new Decimal(diff.minSnf.toString()) : null,
            maxSnf: diff.maxSnf ? new Decimal(diff.maxSnf.toString()) : null,
            minRate: diff.minRate ? new Decimal(diff.minRate.toString()) : null,
            maxRate: diff.maxRate ? new Decimal(diff.maxRate.toString()) : null,
          },
        });
      }

      return tx.rateChart.findUnique({
        where: { id: chart.id },
        include: { differential: true },
      });
    });
  }

  /**
   * 2. List charts with pagination & filters
   */
  public static async listCharts(
    adminId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      milkType?: MilkType;
      method?: RateCalculationMethod;
      status?: RateChartStatus;
    }
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.RateChartWhereInput = {
      adminId,
      ...(query.milkType ? { milkType: query.milkType } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            name: {
              contains: query.search,
              mode: "insensitive",
            },
          }
        : {}),
    };

    const [total, charts] = await Promise.all([
      prisma.rateChart.count({ where }),
      prisma.rateChart.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
        include: {
          differential: true,
          _count: {
            select: {
              rateTable: true,
              milkEntries: true,
            },
          },
        },
      }),
    ]);

    return {
      charts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 3. Get chart details by ID
   */
  public static async getChartById(adminId: string, id: string) {
    const chart = await prisma.rateChart.findFirst({
      where: { id, adminId },
      include: {
        differential: true,
        _count: {
          select: {
            rateTable: true,
            milkEntries: true,
          },
        },
      },
    });

    if (!chart) {
      throw new ApiError(404, "Rate chart not found");
    }

    // Include full matrix cells for both RATE_TABLE and BASE_DIFFERENTIAL previews
    let sampleCells: any[] = [];
    let cells: Array<{ fat: string; snf: string; rate: string }> = [];

    if (chart.method === RateCalculationMethod.RATE_TABLE) {
      const allCells = await prisma.rateChartCell.findMany({
        where: { rateChartId: id },
        orderBy: [{ fat: "asc" }, { snf: "asc" }],
      });
      sampleCells = allCells.slice(0, 15);
      cells = allCells.map((c) => ({
        fat: c.fat.toFixed(1),
        snf: c.snf.toFixed(1),
        rate: c.rate.toFixed(2),
      }));
    } else if (chart.method === RateCalculationMethod.BASE_DIFFERENTIAL && chart.differential) {
      const diff = chart.differential;
      const stepVal = new Decimal(diff.differentialUnit?.toString() || "0.1");
      const step = stepVal.greaterThan(0) ? stepVal : new Decimal("0.1");

      const baseFat = new Decimal(diff.baseFat.toString());
      const baseSnf = new Decimal(diff.baseSnf.toString());

      const minFat = diff.minFat
        ? new Decimal(diff.minFat.toString())
        : Decimal.max(new Decimal("1.0"), baseFat.minus("1.5"));
      const maxFat = diff.maxFat
        ? new Decimal(diff.maxFat.toString())
        : baseFat.plus("2.5");
      const minSnf = diff.minSnf
        ? new Decimal(diff.minSnf.toString())
        : Decimal.max(new Decimal("5.0"), baseSnf.minus("1.0"));
      const maxSnf = diff.maxSnf
        ? new Decimal(diff.maxSnf.toString())
        : baseSnf.plus("1.0");

      let rowCount = 0;
      for (let f = minFat; f.lessThanOrEqualTo(maxFat) && rowCount < 150; f = f.plus(step), rowCount++) {
        let colCount = 0;
        for (let s = minSnf; s.lessThanOrEqualTo(maxSnf) && colCount < 100; s = s.plus(step), colCount++) {
          const res = calculateDifferentialRate({
            appliedFat: f,
            appliedSnf: s,
            config: diff,
          });
          cells.push({
            fat: f.toFixed(1),
            snf: s.toFixed(1),
            rate: res.roundedRate.toFixed(2),
          });
        }
      }
    }

    return {
      ...chart,
      sampleCells,
      cells,
    };
  }

  /**
   * 4. Update a draft chart
   */
  public static async updateChart(adminId: string, id: string, data: any) {
    const chart = await prisma.rateChart.findFirst({
      where: { id, adminId },
      include: { differential: true },
    });

    if (!chart) {
      throw new ApiError(404, "Rate chart not found");
    }

    // Production safety rule: Only DRAFT charts can be modified in place
    if (chart.status !== RateChartStatus.DRAFT) {
      throw new ApiError(
        400,
        `Cannot edit a ${chart.status.toLowerCase()} chart. To modify rates, create a new draft version.`
      );
    }

    return await prisma.$transaction(async (tx) => {
      const updateData: Prisma.RateChartUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.effectiveFrom !== undefined) updateData.effectiveFrom = new Date(data.effectiveFrom);
      if (data.effectiveTo !== undefined) {
        updateData.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;
      }

      await tx.rateChart.update({
        where: { id },
        data: updateData,
      });

      if (chart.method === RateCalculationMethod.BASE_DIFFERENTIAL && data.differential) {
        const diff = data.differential;
        await tx.rateChartDifferential.upsert({
          where: { rateChartId: id },
          create: {
            rateChartId: id,
            baseFat: new Decimal(diff.baseFat.toString()),
            baseSnf: new Decimal(diff.baseSnf.toString()),
            baseRate: new Decimal(diff.baseRate.toString()),
            fatDifferential: new Decimal(diff.fatDifferential.toString()),
            snfDifferential: new Decimal(diff.snfDifferential.toString()),
            differentialUnit: new Decimal(diff.differentialUnit?.toString() || "0.1"),
            minFat: diff.minFat ? new Decimal(diff.minFat.toString()) : null,
            maxFat: diff.maxFat ? new Decimal(diff.maxFat.toString()) : null,
            minSnf: diff.minSnf ? new Decimal(diff.minSnf.toString()) : null,
            maxSnf: diff.maxSnf ? new Decimal(diff.maxSnf.toString()) : null,
            minRate: diff.minRate ? new Decimal(diff.minRate.toString()) : null,
            maxRate: diff.maxRate ? new Decimal(diff.maxRate.toString()) : null,
          },
          update: {
            baseFat: new Decimal(diff.baseFat.toString()),
            baseSnf: new Decimal(diff.baseSnf.toString()),
            baseRate: new Decimal(diff.baseRate.toString()),
            fatDifferential: new Decimal(diff.fatDifferential.toString()),
            snfDifferential: new Decimal(diff.snfDifferential.toString()),
            differentialUnit: new Decimal(diff.differentialUnit?.toString() || "0.1"),
            minFat: diff.minFat ? new Decimal(diff.minFat.toString()) : null,
            maxFat: diff.maxFat ? new Decimal(diff.maxFat.toString()) : null,
            minSnf: diff.minSnf ? new Decimal(diff.minSnf.toString()) : null,
            maxSnf: diff.maxSnf ? new Decimal(diff.maxSnf.toString()) : null,
            minRate: diff.minRate ? new Decimal(diff.minRate.toString()) : null,
            maxRate: diff.maxRate ? new Decimal(diff.maxRate.toString()) : null,
          },
        });
      }

      return tx.rateChart.findUnique({
        where: { id },
        include: { differential: true },
      });
    });
  }

  /**
   * 5. Delete an eligible draft chart
   */
  public static async deleteChart(adminId: string, id: string) {
    const chart = await prisma.rateChart.findFirst({
      where: { id, adminId },
      include: {
        _count: {
          select: { milkEntries: true },
        },
      },
    });

    if (!chart) {
      throw new ApiError(404, "Rate chart not found");
    }

    if (chart.status === RateChartStatus.ACTIVE) {
      throw new ApiError(400, "Cannot delete an active rate chart. Deactivate or archive it instead.");
    }

    if (chart._count.milkEntries > 0) {
      throw new ApiError(
        400,
        `Cannot delete rate chart because it is referenced by ${chart._count.milkEntries} historical milk collections.`
      );
    }

    await prisma.rateChart.delete({
      where: { id },
    });

    return { message: "Rate chart deleted successfully" };
  }

  /**
   * 6. Preview calculated rates on a chart
   */
  public static async previewChartRate(
    adminId: string,
    id: string,
    params: {
      fat: number | string;
      snf: number | string;
      quantity?: number | string;
      collectionDate?: string;
    }
  ) {
    const chart = await prisma.rateChart.findFirst({
      where: { id, adminId },
      include: { differential: true },
    });

    if (!chart) {
      throw new ApiError(404, "Rate chart not found");
    }

    const collectionDate = params.collectionDate ? new Date(params.collectionDate) : new Date();

    // Evaluate directly against THIS specific chart (works for DRAFT, ACTIVE, INACTIVE, ARCHIVED)
    return await RateCalculationService.calculateWithChartId(id, {
      dairyId: adminId,
      milkType: chart.milkType,
      fat: params.fat,
      snf: params.snf,
      quantity: params.quantity || 1,
      collectionDate,
    });
  }

  /**
   * 7. Activate chart
   * Enforces:
   * - Only DRAFT charts can be activated
   * - Completeness validation (rate table cells or differential configuration)
   * - Checks that chart effective period has not completely expired
   * - PostgreSQL advisory locking for atomic concurrency protection per (adminId, milkType)
   * - Overlap detection: detects conflicts with current or future ACTIVE charts
   * - Requires explicit confirmReplace=true to supersede or safely shorten conflicting charts
   * - Prevents overwriting later scheduled charts
   * - Invalidates Redis cache post-commit
   * - Records structured audit log
   */
  public static async activateChart(
    adminId: string,
    id: string,
    options: { confirmReplace?: boolean } = {}
  ) {
    const chart = await prisma.rateChart.findFirst({
      where: { id, adminId },
      include: {
        differential: true,
        _count: { select: { rateTable: true } },
      },
    });

    if (!chart) {
      throw new ApiError(404, "Rate chart not found");
    }

    // Rule 1: Only DRAFT charts can be activated
    if (chart.status !== RateChartStatus.DRAFT) {
      throw new ApiError(
        400,
        `Cannot activate chart in '${chart.status}' status. Only DRAFT charts can be activated.`
      );
    }

    // Rule 2: Expiration check (cannot activate already expired chart)
    if (isPeriodExpired(chart.effectiveTo)) {
      throw new ApiError(
        400,
        `Cannot activate a rate chart whose effective period has already expired (${formatIstDate(chart.effectiveTo!)})`
      );
    }

    // Rule 3: Method completeness checks
    if (chart.method === RateCalculationMethod.RATE_TABLE && chart._count.rateTable === 0) {
      throw new ApiError(
        400,
        "Cannot activate a Table Matrix chart without importing matrix rate cells"
      );
    }

    if (chart.method === RateCalculationMethod.BASE_DIFFERENTIAL && !chart.differential) {
      throw new ApiError(
        400,
        "Cannot activate Base Differential chart without differential configuration"
      );
    }

    let replacedCount = 0;

    // Execute within transaction with concurrency protection
    await prisma.$transaction(async (tx) => {
      // Concurrency protection: acquire transaction-level advisory lock on (adminId, milkType)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'rate_chart_activation:' + adminId + ':' + chart.milkType}))`;

      // Find existing active charts for this dairy and milk type
      const activeCharts = await tx.rateChart.findMany({
        where: {
          adminId,
          milkType: chart.milkType,
          status: RateChartStatus.ACTIVE,
          id: { not: id },
        },
        orderBy: { effectiveFrom: "asc" },
      });

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
          // Reject with 409 Conflict if explicit confirmation is missing
          throw new ApiError(
            409,
            `Activation conflicts with ${conflicts.length} active rate chart(s) for ${chart.milkType} milk. Set confirmReplace: true to supersede or shorten previous chart.`,
            {
              code: "RATE_CHART_CONFLICT",
              errors: conflicts.map((c) => ({
                id: c.id,
                name: c.name,
                milkType: c.milkType,
                effectiveFrom: formatIstDate(c.effectiveFrom),
                effectiveTo: c.effectiveTo ? formatIstDate(c.effectiveTo) : null,
                requiresConfirmation: true,
              })),
            }
          );
        }

        // Owner explicitly confirmed replacement (confirmReplace === true)
        const newStartMs = getIstStartOfDay(chart.effectiveFrom).getTime();

        for (const conflicting of conflicts) {
          const existStartMs = getIstStartOfDay(conflicting.effectiveFrom).getTime();

          // Safety Rule: Do not overwrite later scheduled charts
          if (existStartMs > newStartMs) {
            throw new ApiError(
              409,
              `Cannot automatically replace later scheduled chart '${conflicting.name}' starting on ${formatIstDate(conflicting.effectiveFrom)}. Please adjust effective dates or deactivate the future chart first.`
            );
          }

          if (formatIstDate(conflicting.effectiveFrom) === formatIstDate(chart.effectiveFrom)) {
            // Started on the exact same calendar day -> fully superseded
            await tx.rateChart.update({
              where: { id: conflicting.id },
              data: {
                status: RateChartStatus.INACTIVE,
                effectiveTo: chart.effectiveFrom,
              },
            });
            replacedCount++;
          } else {
            // Conflicting chart started earlier -> safely shorten its effectiveTo to the day before
            const shortenedEffectiveTo = getIstDayBefore(chart.effectiveFrom);
            const isNowExpired = isPeriodExpired(shortenedEffectiveTo);

            await tx.rateChart.update({
              where: { id: conflicting.id },
              data: {
                effectiveTo: shortenedEffectiveTo,
                status: isNowExpired ? RateChartStatus.INACTIVE : RateChartStatus.ACTIVE,
              },
            });
            replacedCount++;
          }
        }
      }

      // Activate the target chart
      await tx.rateChart.update({
        where: { id },
        data: {
          status: RateChartStatus.ACTIVE,
        },
      });
    });

    // Invalidate Redis hot cache immediately after successful commit
    await RateCalculationService.invalidateChartCache(adminId, chart.milkType);

    // Record structured audit log
    logger.info("RATE_CHART_ACTIVATED", {
      adminId,
      chartId: id,
      name: chart.name,
      milkType: chart.milkType,
      effectiveFrom: formatIstDate(chart.effectiveFrom),
      effectiveTo: chart.effectiveTo ? formatIstDate(chart.effectiveTo) : null,
      replacedCount,
    });

    return await prisma.rateChart.findUnique({
      where: { id },
      include: { differential: true },
    });
  }

  /**
   * 8. Deactivate chart
   * Enforces:
   * - Only ACTIVE charts can be deactivated
   * - Scoped to authenticated adminId
   * - Preserves historical collection data
   * - Checks whether any active chart remains for this milkType
   * - Returns warning if 0 active charts remain
   * - Invalidates Redis cache post-commit
   * - Records structured audit log
   */
  public static async deactivateChart(adminId: string, id: string) {
    const chart = await prisma.rateChart.findFirst({
      where: { id, adminId },
    });

    if (!chart) {
      throw new ApiError(404, "Rate chart not found");
    }

    if (chart.status !== RateChartStatus.ACTIVE) {
      throw new ApiError(400, `Only ACTIVE charts can be deactivated. Current status is ${chart.status}`);
    }

    const updated = await prisma.rateChart.update({
      where: { id },
      data: { status: RateChartStatus.INACTIVE },
    });

    // Check if any other ACTIVE chart remains for this dairy and milkType
    const remainingActiveCount = await prisma.rateChart.count({
      where: {
        adminId,
        milkType: chart.milkType,
        status: RateChartStatus.ACTIVE,
      },
    });

    // Invalidate Redis hot cache
    await RateCalculationService.invalidateChartCache(adminId, chart.milkType);

    logger.info("RATE_CHART_DEACTIVATED", {
      adminId,
      chartId: id,
      name: chart.name,
      milkType: chart.milkType,
      remainingActiveCount,
    });

    return {
      chart: updated,
      warning:
        remainingActiveCount === 0
          ? `No other active rate chart remains for ${chart.milkType} milk. Subsequent milk collections will fail or require manual rates until another chart is activated.`
          : undefined,
    };
  }

  /**
   * 9. Step 1: Upload, Parse, and Validate Excel Matrix (Stage in memory/Redis)
   * Does NOT write to production rate matrix. Returns validation preview & confirmation token.
   */
  public static async validateAndStageMatrix(
    adminId: string,
    id: string,
    filePath: string,
    originalName: string
  ) {
    const chart = await prisma.rateChart.findFirst({
      where: { id, adminId },
    });

    if (!chart) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw new ApiError(404, "Rate chart not found");
    }

    if (chart.method !== RateCalculationMethod.RATE_TABLE) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw new ApiError(400, "Excel matrix import is only available for RATE_TABLE calculation method");
    }

    if (chart.status !== RateChartStatus.DRAFT) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw new ApiError(400, "Matrix can only be imported into a DRAFT rate chart. Active or published charts cannot be overwritten.");
    }

    try {
      const parsed = parseRateMatrixExcel(filePath);

      if (!parsed.isValid) {
        return {
          isValid: false,
          totalCells: 0,
          totalFatSteps: 0,
          totalSnfSteps: 0,
          minFat: "0.0",
          maxFat: "0.0",
          minSnf: "0.0",
          maxSnf: "0.0",
          sampleCells: [],
          errors: parsed.errors,
          warnings: parsed.warnings,
          message: "Excel matrix validation failed. Please correct the errors and re-upload.",
        };
      }

      // Generate cryptographically secure import token
      const importToken = crypto.randomUUID();
      const stagingKey = `rate_chart:import_staged:${adminId}:${id}:${importToken}`;

      const stagedData: StagedImportData = {
        importToken,
        chartId: id,
        adminId,
        fileName: originalName,
        totalCells: parsed.totalCells,
        totalFatSteps: parsed.totalFatSteps,
        totalSnfSteps: parsed.totalSnfSteps,
        minFat: parsed.minFat,
        maxFat: parsed.maxFat,
        minSnf: parsed.minSnf,
        maxSnf: parsed.maxSnf,
        cells: parsed.cells,
        uploadedAt: new Date().toISOString(),
      };

      // Stage for 30 minutes
      await StagedImportStore.set(stagingKey, stagedData, 1800);

      return {
        isValid: true,
        importToken,
        fileName: originalName,
        totalCells: parsed.totalCells,
        totalFatSteps: parsed.totalFatSteps,
        totalSnfSteps: parsed.totalSnfSteps,
        minFat: parsed.minFat,
        maxFat: parsed.maxFat,
        minSnf: parsed.minSnf,
        maxSnf: parsed.maxSnf,
        sampleCells: parsed.sampleCells,
        cells: parsed.cells,
        fatSteps: parsed.fatSteps,
        snfSteps: parsed.snfSteps,
        errors: [],
        warnings: parsed.warnings,
        message: "Matrix passed all validations. Explicit owner confirmation is required to commit to draft chart.",
      };
    } finally {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  }

  /**
   * 10. Step 2: Owner Confirms Import
   * Atomically replaces the draft matrix inside a database transaction,
   * performs post-commit verification, and logs audit metadata.
   */
  public static async confirmImportMatrix(adminId: string, id: string, importToken: string) {
    const chart = await prisma.rateChart.findFirst({
      where: { id, adminId },
    });

    if (!chart) {
      throw new ApiError(404, "Rate chart not found");
    }

    if (chart.status !== RateChartStatus.DRAFT) {
      throw new ApiError(400, "Cannot import into a non-draft rate chart.");
    }

    const stagingKey = `rate_chart:import_staged:${adminId}:${id}:${importToken}`;
    const staged = await StagedImportStore.get(stagingKey);

    if (!staged || staged.chartId !== id || staged.adminId !== adminId) {
      throw new ApiError(
        400,
        "Import session has expired or is invalid. Please upload the Excel file again to preview."
      );
    }

    const now = new Date();

    // Atomic replacement inside database transaction
    await prisma.$transaction(async (tx) => {
      // 1. Wipe previous cells for this draft chart
      await tx.rateChartCell.deleteMany({
        where: { rateChartId: id },
      });

      // 2. Insert cells in batches of 500
      const batchSize = 500;
      for (let i = 0; i < staged.cells.length; i += batchSize) {
        const chunk = staged.cells.slice(i, i + batchSize).map((c) => ({
          rateChartId: id,
          fat: new Decimal(c.fat),
          snf: new Decimal(c.snf),
          rate: new Decimal(c.rate),
        }));

        await tx.rateChartCell.createMany({
          data: chunk,
        });
      }

      // 3. Update chart metadata & audit columns
      await tx.rateChart.update({
        where: { id },
        data: {
          sourceFileName: staged.fileName,
          totalCells: staged.totalCells,
          minFat: new Decimal(staged.minFat),
          maxFat: new Decimal(staged.maxFat),
          minSnf: new Decimal(staged.minSnf),
          maxSnf: new Decimal(staged.maxSnf),
          importedAt: now,
          importedBy: adminId,
        },
      });
    });

    // 4. Post-save integrity verification
    const actualSavedCount = await prisma.rateChartCell.count({
      where: { rateChartId: id },
    });

    if (actualSavedCount !== staged.totalCells) {
      throw new ApiError(
        500,
        `Integrity check failed: Expected ${staged.totalCells} cells but committed ${actualSavedCount}. Transaction aborted.`
      );
    }

    // Clean up staging session
    await StagedImportStore.delete(stagingKey);

    return {
      success: true,
      message: "Rate matrix successfully committed to draft chart.",
      totalCells: staged.totalCells,
      minFat: staged.minFat,
      maxFat: staged.maxFat,
      minSnf: staged.minSnf,
      maxSnf: staged.maxSnf,
      sourceFileName: staged.fileName,
      importedAt: now.toISOString(),
      importedBy: adminId,
    };
  }

  /**
   * 11. Generate standard downloadable Excel matrix template
   */
  public static getRateChartTemplate(): Buffer {
    return generateRateChartTemplate();
  }

  /**
   * 12. View chart versions / history for this dairy & milkType
   */
  public static async getChartHistory(adminId: string, id: string) {
    const current = await prisma.rateChart.findFirst({
      where: { id, adminId },
    });

    if (!current) {
      throw new ApiError(404, "Rate chart not found");
    }

    const history = await prisma.rateChart.findMany({
      where: {
        adminId,
        milkType: current.milkType,
      },
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      include: {
        differential: true,
        _count: {
          select: {
            rateTable: true,
            milkEntries: true,
          },
        },
      },
    });

    return {
      milkType: current.milkType,
      history,
    };
  }
}


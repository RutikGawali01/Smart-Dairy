import { z } from "zod";
import { MilkType, RateCalculationMethod, RateChartStatus } from "@prisma/client";

/**
 * Base Differential Configuration Schema
 */
export const differentialConfigSchema = z.object({
  baseFat: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
    message: "Base Fat must be a positive number",
  }),
  baseSnf: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
    message: "Base SNF must be a positive number",
  }),
  baseRate: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
    message: "Base Rate must be a positive number",
  }),
  fatDifferential: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)), {
    message: "Fat differential must be a valid number",
  }),
  snfDifferential: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)), {
    message: "SNF differential must be a valid number",
  }),
  differentialUnit: z.union([z.number(), z.string()]).default("0.1"),
  minFat: z.union([z.number(), z.string()]).nullish(),
  maxFat: z.union([z.number(), z.string()]).nullish(),
  minSnf: z.union([z.number(), z.string()]).nullish(),
  maxSnf: z.union([z.number(), z.string()]).nullish(),
  minRate: z.union([z.number(), z.string()]).nullish(),
  maxRate: z.union([z.number(), z.string()]).nullish(),
});

/**
 * Create Rate Chart Schema
 */
export const createRateChartSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Chart name must be at least 2 characters")
      .max(100, "Chart name cannot exceed 100 characters"),
    milkType: z.enum([MilkType.COW, MilkType.BUFFALO, MilkType.MIX], {
      message: "Milk type must be COW, BUFFALO, or MIX",
    }),
    method: z.enum(
      [RateCalculationMethod.RATE_TABLE, RateCalculationMethod.BASE_DIFFERENTIAL],
      {
        message: "Method must be RATE_TABLE or BASE_DIFFERENTIAL",
      }
    ),
    effectiveFrom: z.string().datetime({ message: "effectiveFrom must be a valid ISO date string" }),
    effectiveTo: z.string().datetime().nullish(),
    differential: differentialConfigSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.effectiveTo) {
        return new Date(data.effectiveTo) >= new Date(data.effectiveFrom);
      }
      return true;
    },
    {
      message: "Effective end date cannot be earlier than start date",
      path: ["effectiveTo"],
    }
  )
  .refine(
    (data) => {
      if (data.method === RateCalculationMethod.BASE_DIFFERENTIAL && !data.differential) {
        return false;
      }
      return true;
    },
    {
      message: "Differential configuration is required for BASE_DIFFERENTIAL method",
      path: ["differential"],
    }
  );

/**
 * Update Rate Chart Schema (Draft only)
 */
export const updateRateChartSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().nullish(),
    differential: differentialConfigSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.effectiveFrom && data.effectiveTo) {
        return new Date(data.effectiveTo) >= new Date(data.effectiveFrom);
      }
      return true;
    },
    {
      message: "Effective end date cannot be earlier than start date",
      path: ["effectiveTo"],
    }
  );

/**
 * Preview Rate Calculation Schema
 */
export const previewRateSchema = z.object({
  fat: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
    message: "Fat must be greater than 0",
  }),
  snf: z.union([z.number(), z.string()]).refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
    message: "SNF must be greater than 0",
  }),
  quantity: z
    .union([z.number(), z.string()])
    .default(1)
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
      message: "Quantity must be greater than 0",
    }),
  collectionDate: z.string().datetime().optional(),
});

/**
 * Activate Rate Chart Schema (Explicit replacement confirmation)
 */
export const activateChartSchema = z.object({
  confirmReplace: z.boolean().optional().default(false),
});

/**
 * Confirm Matrix Import Schema
 */
export const confirmImportSchema = z.object({
  importToken: z.string().uuid("Invalid import token format"),
});

/**
 * Query / Filter Rate Charts Schema
 */
export const queryRateChartsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  milkType: z.enum([MilkType.COW, MilkType.BUFFALO, MilkType.MIX]).optional(),
  method: z.enum([RateCalculationMethod.RATE_TABLE, RateCalculationMethod.BASE_DIFFERENTIAL]).optional(),
  status: z.enum([RateChartStatus.DRAFT, RateChartStatus.ACTIVE, RateChartStatus.INACTIVE, RateChartStatus.ARCHIVED]).optional(),
});

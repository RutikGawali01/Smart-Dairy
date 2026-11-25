import { MilkType, RateCalculationMethod } from "@prisma/client";
import { Decimal } from "../../../utils/decimal.js";

export interface CalculateMilkRateInput {
  dairyId: string; // adminId representing dairy owner
  milkType: MilkType;
  fat: string | number | Decimal;
  snf: string | number | Decimal;
  quantity: string | number | Decimal;
  collectionDate?: Date | string;
}

export interface CalculationDetails {
  method: RateCalculationMethod;
  appliedFat: string; // Truncated to 0.1 step, e.g. "3.5"
  appliedSnf: string; // Truncated to 0.1 step, e.g. "8.2"
  rawRate: string;    // Pre-rounded precision rate
  baseFat?: string;
  baseSnf?: string;
  baseRate?: string;
  fatDiff?: string;
  snfDiff?: string;
  fatAdjustment?: string;
  snfAdjustment?: string;
  formulaDescription?: string;
}

export interface RateCalculationResult {
  success: boolean;
  rate: string;            // Standard commercial rounded (2 decimal places) e.g. "35.57"
  totalAmount: string;     // quantity * rate (2 decimal places) e.g. "373.49"
  quantity: string;        // Formatted quantity
  rateChartId: string;
  rateChartName: string;
  milkType: MilkType;
  method: RateCalculationMethod;
  details: CalculationDetails;
}

export interface CachedActiveChart {
  id: string;
  name: string;
  milkType: MilkType;
  method: RateCalculationMethod;
  effectiveFrom: string;
  effectiveTo: string | null;
  minFat: string | null;
  maxFat: string | null;
  minSnf: string | null;
  maxSnf: string | null;
  differential?: {
    baseFat: string;
    baseSnf: string;
    baseRate: string;
    fatDifferential: string;
    snfDifferential: string;
    differentialUnit: string;
    minFat: string | null;
    maxFat: string | null;
    minSnf: string | null;
    maxSnf: string | null;
    minRate: string | null;
    maxRate: string | null;
  } | null;
}

export interface MultiChartCachePayload {
  version: number;
  cachedAt: string;
  charts: CachedActiveChart[];
}

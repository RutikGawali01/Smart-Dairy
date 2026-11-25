export type MilkType = 'COW' | 'BUFFALO' | 'MIX';

export type RateCalculationMethod = 'RATE_TABLE' | 'BASE_DIFFERENTIAL';

export type RateChartStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface RateChartDifferential {
  id?: string;
  rateChartId?: string;
  baseFat: number | string;
  baseSnf: number | string;
  baseRate: number | string;
  fatDifferential: number | string;
  snfDifferential: number | string;
  differentialUnit?: number | string;
  minFat?: number | string | null;
  maxFat?: number | string | null;
  minSnf?: number | string | null;
  maxSnf?: number | string | null;
  minRate?: number | string | null;
  maxRate?: number | string | null;
}

export interface RateChartCell {
  id: string;
  rateChartId: string;
  fat: number | string;
  snf: number | string;
  rate: number | string;
}

export interface RateChart {
  id: string;
  name: string;
  milkType: MilkType;
  method: RateCalculationMethod;
  status: RateChartStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceFileName?: string | null;
  totalCells?: number | null;
  minFat?: number | string | null;
  maxFat?: number | string | null;
  minSnf?: number | string | null;
  maxSnf?: number | string | null;
  importedAt?: string | null;
  importedBy?: string | null;
  adminId: string;
  differential?: RateChartDifferential | null;
  cells?: Array<{ fat: string; snf: string; rate: string }>;
  _count?: {
    rateTable?: number;
    milkEntries?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface GetRateChartsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  milkType?: MilkType;
  method?: RateCalculationMethod;
  status?: RateChartStatus;
}

export interface PaginatedRateCharts {
  charts: RateChart[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateRateChartPayload {
  name: string;
  milkType: MilkType;
  method: RateCalculationMethod;
  effectiveFrom: string;
  effectiveTo?: string | null;
  differential?: {
    baseFat: number | string;
    baseSnf: number | string;
    baseRate: number | string;
    fatDifferential: number | string;
    snfDifferential: number | string;
    differentialUnit?: number | string;
    minFat?: number | string | null;
    maxFat?: number | string | null;
    minSnf?: number | string | null;
    maxSnf?: number | string | null;
    minRate?: number | string | null;
    maxRate?: number | string | null;
  };
}

export interface UpdateRateChartPayload {
  name?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  differential?: {
    baseFat: number | string;
    baseSnf: number | string;
    baseRate: number | string;
    fatDifferential: number | string;
    snfDifferential: number | string;
    differentialUnit?: number | string;
    minFat?: number | string | null;
    maxFat?: number | string | null;
    minSnf?: number | string | null;
    maxSnf?: number | string | null;
    minRate?: number | string | null;
    maxRate?: number | string | null;
  };
}

export interface CalculateRateInput {
  milkType: MilkType;
  fat: number | string;
  snf: number | string;
  quantity: number | string;
  collectionDate?: string;
}

export interface RateCalculationDetails {
  method: RateCalculationMethod;
  appliedFat: string;
  appliedSnf: string;
  rawRate: string;
  baseFat?: string;
  baseSnf?: string;
  baseRate?: string;
  fatDiff?: string;
  snfDiff?: string;
  fatAdjustment?: string;
  snfAdjustment?: string;
  formulaDescription?: string;
}

export interface CalculateRateResult {
  success: boolean;
  rate: string;
  totalAmount: string;
  quantity: string;
  rateChartId: string;
  rateChartName: string;
  milkType: MilkType;
  method: RateCalculationMethod;
  details: RateCalculationDetails;
}

export interface ExcelValidateResponse {
  isValid: boolean;
  importToken?: string;
  fileName?: string;
  totalCells: number;
  totalFatSteps: number;
  totalSnfSteps: number;
  minFat: string;
  maxFat: string;
  minSnf: string;
  maxSnf: string;
  sampleCells: Array<{ fat: string; snf: string; rate: string }>;
  cells?: Array<{ fat: string; snf: string; rate: string }>;
  fatSteps?: string[];
  snfSteps?: string[];
  errors: string[];
  warnings: string[];
  message: string;
}

export interface ActivationConflict {
  chartId: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  overlapType?: string;
  message?: string;
}

export interface ActivationConflictData {
  conflicts: ActivationConflict[];
  requiresConfirmation: boolean;
  message?: string;
}


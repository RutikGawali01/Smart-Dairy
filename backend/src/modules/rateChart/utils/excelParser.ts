import * as xlsxModule from "xlsx";
import { Decimal, ROUND_DOWN } from "../../../utils/decimal.js";
import ApiError from "../../../utils/ApiError.js";

// Robust ESM/CJS interop for SheetJS (xlsx)
const XLSX: any = (xlsxModule as any).default || xlsxModule;

export interface ParsedMatrixCell {
  fat: string; // Stored as decimal string to avoid precision loss
  snf: string;
  rate: string;
}

export interface MatrixValidationResult {
  isValid: boolean;
  totalCells: number;
  totalFatSteps: number;
  totalSnfSteps: number;
  minFat: string;
  maxFat: string;
  minSnf: string;
  maxSnf: string;
  snfSteps: string[];
  fatSteps: string[];
  sampleCells: { fat: string; snf: string; rate: string }[];
  errors: string[];
  warnings: string[];
  cells: ParsedMatrixCell[];
}

// Security limits
const MAX_ROWS = 150;     // e.g. Fat 1.0 to 15.0 in 0.1 steps = 141 rows
const MAX_COLS = 100;     // e.g. SNF 5.0 to 14.0 in 0.1 steps = 91 cols
const MAX_TOTAL_CELLS = 10000; // DoS defense

/**
 * Parses and validates an Excel workbook containing a 2D Milk Rate Matrix.
 * Enforces all 12 validation rules strictly without trusting embedded formulas.
 */
export function parseRateMatrixExcel(filePath: string): MatrixValidationResult {
  let workbook: any;
  try {
    // cellFormula: false ignores any embedded formulas and parses raw calculated values only
    workbook = XLSX.readFile(filePath, {
      cellFormula: false,
      cellHTML: false,
      cellText: false,
      raw: true,
    });
  } catch (err: any) {
    throw new ApiError(400, `Failed to parse Excel file. The file may be corrupt or encrypted: ${err.message}`);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new ApiError(400, "Empty spreadsheet: The workbook contains no worksheets.");
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet || !worksheet["!ref"]) {
    throw new ApiError(400, "Empty spreadsheet: The worksheet has no data cells.");
  }

  // Parse raw sheet into 2D array
  const rows: any[][] = (XLSX.utils.sheet_to_json as any)(worksheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  if (!rows || rows.length < 2) {
    throw new ApiError(400, "Spreadsheet must contain at least a header row of SNF and one row of FAT.");
  }

  if (rows.length > MAX_ROWS) {
    throw new ApiError(400, `Excessive rows: Sheet has ${rows.length} rows (maximum allowed is ${MAX_ROWS}).`);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate Header Row (SNF Columns)
  const headerRow = rows[0];
  if (!headerRow || headerRow.length < 2) {
    throw new ApiError(400, "Missing SNF header: First row must define SNF column values.");
  }

  if (headerRow.length > MAX_COLS) {
    throw new ApiError(400, `Excessive columns: Sheet has ${headerRow.length} columns (maximum allowed is ${MAX_COLS}).`);
  }

  const snfValues: { colIndex: number; snfStr: string; snfDecimal: Decimal }[] = [];
  const seenSnf = new Set<string>();

  for (let c = 1; c < headerRow.length; c++) {
    const rawSnf = headerRow[c];
    if (rawSnf === null || rawSnf === undefined || String(rawSnf).trim() === "") {
      continue;
    }

    const cleanStr = String(rawSnf).trim();
    if (isNaN(Number(cleanStr))) {
      errors.push(`Header Col ${c + 1}: Invalid non-numeric SNF value "${rawSnf}".`);
      continue;
    }

    const snfNum = Number(cleanStr);
    if (snfNum <= 0) {
      errors.push(`Header Col ${c + 1}: SNF must be greater than 0 (found "${rawSnf}").`);
      continue;
    }

    // Step normalization to 0.1
    const snfDecimal = new Decimal(cleanStr).toDecimalPlaces(1, ROUND_DOWN);
    const snfStr = snfDecimal.toFixed(1);

    if (seenSnf.has(snfStr)) {
      errors.push(`Duplicate SNF header value "${snfStr}" at Col ${c + 1}. Each SNF column must be unique.`);
    } else {
      seenSnf.add(snfStr);
      snfValues.push({ colIndex: c, snfStr, snfDecimal });
    }
  }

  if (snfValues.length === 0) {
    throw new ApiError(400, "Missing SNF header: No valid SNF column headers found in row 1.");
  }

  // 2. Validate Data Rows (FAT Rows & Rates)
  const cells: ParsedMatrixCell[] = [];
  const seenFat = new Set<string>();
  const seenMatrixPairs = new Set<string>();

  let minFat: Decimal | null = null;
  let maxFat: Decimal | null = null;
  let minSnf: Decimal | null = null;
  let maxSnf: Decimal | null = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawFat = row[0];
    if (rawFat === null || rawFat === undefined || String(rawFat).trim() === "") {
      // Check if row has data in other columns without a FAT value
      const hasOtherData = row.slice(1).some((val: any) => val !== null && String(val).trim() !== "");
      if (hasOtherData) {
        errors.push(`Row ${r + 1}: Missing FAT header in first column.`);
      }
      continue;
    }

    const cleanFatStr = String(rawFat).trim();
    if (isNaN(Number(cleanFatStr))) {
      errors.push(`Row ${r + 1}, Col 1: Invalid non-numeric FAT value "${rawFat}".`);
      continue;
    }

    const fatNum = Number(cleanFatStr);
    if (fatNum <= 0) {
      errors.push(`Row ${r + 1}, Col 1: FAT must be greater than 0 (found "${rawFat}").`);
      continue;
    }

    const fatDecimal = new Decimal(cleanFatStr).toDecimalPlaces(1, ROUND_DOWN);
    const fatStr = fatDecimal.toFixed(1);

    if (seenFat.has(fatStr)) {
      errors.push(`Duplicate FAT value "${fatStr}" on Row ${r + 1}. Each FAT row must be unique.`);
      continue;
    }
    seenFat.add(fatStr);

    if (!minFat || fatDecimal.lessThan(minFat)) minFat = fatDecimal;
    if (!maxFat || fatDecimal.greaterThan(maxFat)) maxFat = fatDecimal;

    // Check rate cells for each defined SNF column
    for (const { colIndex, snfStr, snfDecimal } of snfValues) {
      if (!minSnf || snfDecimal.lessThan(minSnf)) minSnf = snfDecimal;
      if (!maxSnf || snfDecimal.greaterThan(maxSnf)) maxSnf = snfDecimal;

      const rawRate = row[colIndex];
      const cellRef = `Fat ${fatStr}, SNF ${snfStr} (Row ${r + 1}, Col ${colIndex + 1})`;

      if (rawRate === null || rawRate === undefined || String(rawRate).trim() === "") {
        errors.push(`Empty required cell at ${cellRef}. Matrix cannot have missing rates.`);
        continue;
      }

      const cleanRateStr = String(rawRate).trim();
      if (isNaN(Number(cleanRateStr))) {
        errors.push(`Text inside rate cell: "${rawRate}" at ${cellRef}. Must be a valid numeric rate.`);
        continue;
      }

      const rateNum = Number(cleanRateStr);
      if (rateNum <= 0) {
        errors.push(`Negative or zero rate: "${rawRate}" at ${cellRef}. Rate must be greater than 0.`);
        continue;
      }

      const matrixPairKey = `${fatStr}:${snfStr}`;
      if (seenMatrixPairs.has(matrixPairKey)) {
        errors.push(`Duplicate matrix cell detected for ${cellRef}.`);
        continue;
      }
      seenMatrixPairs.add(matrixPairKey);

      // Commercial 2-decimal rounded string
      const rateDecimal = new Decimal(cleanRateStr).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      cells.push({
        fat: fatStr,
        snf: snfStr,
        rate: rateDecimal.toFixed(2),
      });
    }
  }

  if (seenFat.size === 0) {
    throw new ApiError(400, "Missing FAT header: No valid FAT rows found in column 1.");
  }

  if (cells.length > MAX_TOTAL_CELLS) {
    throw new ApiError(400, `Excessive cells: Matrix contains ${cells.length} cells (maximum allowed is ${MAX_TOTAL_CELLS}).`);
  }

  if (cells.length === 0 && errors.length === 0) {
    throw new ApiError(400, "No valid rate cells could be extracted from spreadsheet.");
  }

  const sampleCells = cells.slice(0, 15);
  const snfSteps = Array.from(seenSnf).sort((a, b) => Number(a) - Number(b));
  const fatSteps = Array.from(seenFat).sort((a, b) => Number(a) - Number(b));

  return {
    isValid: errors.length === 0,
    totalCells: cells.length,
    totalFatSteps: fatSteps.length,
    totalSnfSteps: snfSteps.length,
    minFat: minFat ? minFat.toFixed(1) : "0.0",
    maxFat: maxFat ? maxFat.toFixed(1) : "0.0",
    minSnf: minSnf ? minSnf.toFixed(1) : "0.0",
    maxSnf: maxSnf ? maxSnf.toFixed(1) : "0.0",
    snfSteps,
    fatSteps,
    sampleCells,
    errors,
    warnings,
    cells,
  };
}

/**
 * Generates an official, pre-formatted Rate Chart Matrix Excel template
 */
export function generateRateChartTemplate(): Buffer {
  const wb = XLSX.utils.book_new();

  // Columns: SNF 8.0 to 9.2 (step 0.1)
  const snfHeader = ["FAT \\ SNF"];
  for (let s = 80; s <= 92; s++) {
    snfHeader.push((s / 10).toFixed(1));
  }

  const data: any[][] = [snfHeader];

  // Rows: Fat 3.0 to 5.0 (step 0.1) with realistic standard base rate
  for (let f = 30; f <= 50; f++) {
    const fatVal = (f / 10).toFixed(1);
    const row = [fatVal];

    for (let s = 80; s <= 92; s++) {
      // Standard demo rate formula: Base 35.00 + (fat - 3.5)*3.0 + (snf - 8.5)*2.0
      const calculated = 35.0 + ((f - 35) / 10) * 3.0 + ((s - 85) / 10) * 2.0;
      row.push(calculated.toFixed(2));
    }
    data.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws["!cols"] = [{ wch: 12 }, ...snfHeader.slice(1).map(() => ({ wch: 8 }))];

  XLSX.utils.book_append_sheet(wb, ws, "RateMatrix");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

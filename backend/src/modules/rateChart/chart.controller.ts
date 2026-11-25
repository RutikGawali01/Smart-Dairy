import { Request, Response } from "express";
import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import ApiError from "../../utils/ApiError.js";
import { RateChartService } from "./chart.service.js";
import {
  createRateChartSchema,
  updateRateChartSchema,
  previewRateSchema,
  queryRateChartsSchema,
  confirmImportSchema,
  activateChartSchema,
} from "./chart.schema.js";

/**
 * 1. POST /rate-charts - Create a draft chart
 */
export const createChart = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const validated = createRateChartSchema.parse(req.body);

  const chart = await RateChartService.createChart(adminId, validated);
  res.status(201).json(new ApiResponse(201, "Rate chart created successfully as draft", chart));
});

/**
 * 2. GET /rate-charts - List charts with pagination & filters
 */
export const listCharts = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const validated = queryRateChartsSchema.parse(req.query);

  const result = await RateChartService.listCharts(adminId, validated);
  res.status(200).json(new ApiResponse(200, "Rate charts retrieved successfully", result));
});

/**
 * 3. GET /rate-charts/:id - Get chart details
 */
export const getChartDetails = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;

  const chart = await RateChartService.getChartById(adminId, id);
  res.status(200).json(new ApiResponse(200, "Rate chart details retrieved", chart));
});

/**
 * 4. PUT /rate-charts/:id - Update a draft chart
 */
export const updateChart = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;
  const validated = updateRateChartSchema.parse(req.body);

  const chart = await RateChartService.updateChart(adminId, id, validated);
  res.status(200).json(new ApiResponse(200, "Draft rate chart updated successfully", chart));
});

/**
 * 5. DELETE /rate-charts/:id - Delete an eligible draft chart
 */
export const deleteChart = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;

  const result = await RateChartService.deleteChart(adminId, id);
  res.status(200).json(new ApiResponse(200, result.message));
});

/**
 * 6. POST /rate-charts/:id/preview - Preview calculated rates
 */
export const previewRate = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;
  const validated = previewRateSchema.parse(req.body);

  const result = await RateChartService.previewChartRate(adminId, id, validated);
  res.status(200).json(new ApiResponse(200, "Rate calculation preview", result));
});

/**
 * 7. POST /rate-charts/:id/activate - Activate chart
 */
export const activateChart = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;
  const validated = activateChartSchema.parse(req.body || {});

  const chart = await RateChartService.activateChart(adminId, id, validated);
  res.status(200).json(new ApiResponse(200, "Rate chart activated successfully", chart));
});

/**
 * 8. POST /rate-charts/:id/deactivate - Deactivate chart
 */
export const deactivateChart = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;

  const result = await RateChartService.deactivateChart(adminId, id);
  res.status(200).json(
    new ApiResponse(
      200,
      result.warning
        ? `Rate chart deactivated. Warning: ${result.warning}`
        : "Rate chart deactivated successfully",
      result
    )
  );
});

/**
 * 9. POST /rate-charts/:id/import/validate - Step 1: Upload, Validate & Stage matrix preview
 */
export const validateAndStageMatrix = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;

  if (!req.file) {
    throw new ApiError(400, "Excel file is required for matrix validation");
  }

  const result = await RateChartService.validateAndStageMatrix(
    adminId,
    id,
    req.file.path,
    req.file.originalname
  );

  res.status(200).json(new ApiResponse(200, result.message, result));
});

/**
 * 10. POST /rate-charts/:id/import/confirm - Step 2: Owner Confirms Import (Atomically commits staged matrix)
 */
export const confirmImportMatrix = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;
  const { importToken } = confirmImportSchema.parse(req.body);

  const result = await RateChartService.confirmImportMatrix(adminId, id, importToken);
  res.status(200).json(new ApiResponse(200, result.message, result));
});

/**
 * 11. GET /rate-charts/template - Download standard Excel rate matrix template
 */
export const downloadTemplate = asyncHandler(async (req: Request, res: Response) => {
  const buffer = RateChartService.getRateChartTemplate();

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="Rate_Chart_Matrix_Template.xlsx"'
  );
  res.send(buffer);
});

/**
 * 12. GET /rate-charts/:id/history - View chart versions/history
 */
export const getChartHistory = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user.id;
  const id = req.params.id as string;

  const result = await RateChartService.getChartHistory(adminId, id);
  res.status(200).json(new ApiResponse(200, "Rate chart version history", result));
});

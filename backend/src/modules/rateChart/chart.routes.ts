import { Router, Request, Response } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import upload from "../../config/multer.js";
import asyncHandler from "../../utils/asyncHandler.js";
import ApiResponse from "../../utils/ApiResponse.js";
import { RateCalculationService } from "./services/rateCalculation.service.js";
import { previewRateSchema } from "./chart.schema.js";
import {
  createChart,
  listCharts,
  getChartDetails,
  updateChart,
  deleteChart,
  previewRate,
  activateChart,
  deactivateChart,
  validateAndStageMatrix,
  confirmImportMatrix,
  downloadTemplate,
  getChartHistory,
} from "./chart.controller.js";

const router = Router();

// Enforce authentication for all rate-chart endpoints
router.use(authMiddleware);

/**
 * Download Standard Excel Rate Matrix Template
 * GET /rate-charts/template
 */
router.get("/template", downloadTemplate);

/**
 * Common quick rate calculation for Milk Collection desk
 * POST /rate-charts/calculate
 */
router.post(
  "/calculate",
  asyncHandler(async (req: Request, res: Response) => {
    const adminId = req.user.id;
    const validated = previewRateSchema.parse(req.body);
    const milkType = req.body.milkType;

    const result = await RateCalculationService.calculateMilkRate({
      dairyId: adminId,
      milkType,
      fat: validated.fat,
      snf: validated.snf,
      quantity: validated.quantity,
      collectionDate: validated.collectionDate,
    });

    res.status(200).json(new ApiResponse(200, "Calculated milk rate", result));
  })
);

/**
 * 1. POST /rate-charts - Create a draft chart
 * 2. GET /rate-charts - List charts with pagination & filters
 */
router.route("/")
  .post(createChart)
  .get(listCharts);

/**
 * Two-Step Excel Matrix Import Workflow:
 * Step 1: POST /rate-charts/:id/import/validate (Upload, Validate & Stage in memory/Redis preview)
 * Step 2: POST /rate-charts/:id/import/confirm  (Owner explicitly confirms to commit staged matrix)
 */
router.post("/:id/import/validate", upload.single("file"), validateAndStageMatrix);
router.post("/:id/import/preview", upload.single("file"), validateAndStageMatrix);
router.post("/:id/import/confirm", confirmImportMatrix);

/**
 * 6. POST /rate-charts/:id/preview - Preview calculated rates
 * 7. POST /rate-charts/:id/activate - Activate chart
 * 8. POST /rate-charts/:id/deactivate - Deactivate chart
 * 11. GET /rate-charts/:id/history - View chart versions/history
 */
router.post("/:id/preview", previewRate);
router.post("/:id/activate", activateChart);
router.post("/:id/deactivate", deactivateChart);
router.get("/:id/history", getChartHistory);

/**
 * 3. GET /rate-charts/:id - Get chart details
 * 4. PUT /rate-charts/:id - Update a draft chart
 * 5. DELETE /rate-charts/:id - Delete an eligible draft chart
 */
router.route("/:id")
  .get(getChartDetails)
  .put(updateChart)
  .delete(deleteChart);

export default router;


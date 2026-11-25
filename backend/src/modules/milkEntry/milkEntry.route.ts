import { Router }
from "express";

import authMiddleware
from "../../middleware/auth.middleware.js";

import { validate }
from "../../middleware/validate.middleware.js";

import {
    addMilkEntry,
    getMilkEntryById,
    updateMilkEntry,
    correctMilkEntry,
    reverseMilkEntry,
    deleteMilkEntry,
    getTodayMilkEntries,
    getMilkEntriesByDate,
    getMilkHistory,
} from "./milkEntry.controller.js";

import {
    addMilkEntrySchema,
    updateMilkEntrySchema,
    correctMilkEntrySchema,
    reverseMilkEntrySchema,
} from "./milkEntry.schema.js";

const router = Router();

/**
 * =====================================================
 * ADD MILK ENTRY
 * =====================================================
 */

router.post(
    "/milk-entry",

    authMiddleware,

    validate({
        body:
            addMilkEntrySchema,
    }),

    addMilkEntry
);

router.get(
    "/today",

    authMiddleware,

    getTodayMilkEntries
);

/**
 * =====================================================
 * GET MILK HISTORY (DATE RANGE)
 * =====================================================
 */

router.get(
    "/history",

    authMiddleware,

    getMilkHistory
);

/**
 * =====================================================
 * GET MILK ENTRIES BY DATE
 * =====================================================
 */

router.get(
    "/milk-entry/by-date",

    authMiddleware,

    getMilkEntriesByDate
);

/**
 * =====================================================
 * GET SINGLE ENTRY
 * =====================================================
 */

router.get(
    "/:id",

    authMiddleware,

    getMilkEntryById
);



/**
 * =====================================================
 * UPDATE ENTRY
 * =====================================================
 */

router.patch(
    "/:id",

    authMiddleware,

    validate({
        body:
            updateMilkEntrySchema,
    }),

    updateMilkEntry
);

/**
 * =====================================================
 * HISTORICAL CORRECTION (Phase 2D Audited Endpoint)
 * =====================================================
 */
router.post(
    "/:id/correct",

    authMiddleware,

    validate({
        body:
            correctMilkEntrySchema,
    }),

    correctMilkEntry
);

/**
 * =====================================================
 * REVERSAL (Phase 2D Audited Endpoint)
 * =====================================================
 */
router.post(
    "/:id/reverse",

    authMiddleware,

    validate({
        body:
            reverseMilkEntrySchema,
    }),

    reverseMilkEntry
);

/**
 * =====================================================
 * DELETE ENTRY
 * =====================================================
 */

router.delete(
    "/:id",

    authMiddleware,

    deleteMilkEntry
);



export default router;
import { Router } from "express";

import {
    verifyPhone,
    register,
    login,
    refresh,
    logout,
    getMe,
} from "./auth.controller.js";

import authMiddleware from "../../middleware/auth.middleware.js";

import { validate }
from "../../middleware/validate.middleware.js";

import {
    verifyPhoneSchema,
    registerSchema,
    loginSchema,
} from "./auth.validate.schema.js";

const router = Router();

router.post(
    "/verify-phone",

    validate({
        body:
            verifyPhoneSchema,
    }),

    verifyPhone
);

router.post(
    "/register",

    validate({
        body:
            registerSchema,
    }),

    register
);

router.post(
    "/login",

    validate({
        body:
            loginSchema,
    }),

    login
);

router.post(
    "/refresh",
    refresh
);

router.post(
    "/logout",
    logout
);

router.get(
    "/me",
    authMiddleware,
    getMe
);

export default router;
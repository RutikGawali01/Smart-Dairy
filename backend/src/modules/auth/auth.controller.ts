import type { CookieOptions } from "express";

import asyncHandler
from "../../utils/asyncHandler.js";

import ApiResponse
from "../../utils/ApiResponse.js";

import * as authService
from "./auth.service.js";

/**
 * Cookie options helper for secure HttpOnly cookie management
 */
export const getAuthCookieOptions = (): CookieOptions => {
    const isProduction = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
    };
};

export const getClearCookieOptions = (): CookieOptions => {
    const isProduction = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
        path: "/",
    };
};

/**
 * =====================================================
 * VERIFY PHONE
 * =====================================================
 */

export const verifyPhone =
    asyncHandler(
        async (req, res) => {

            const result =
                await authService.verifyPhone(
                    req.body
                );

            return res.status(200).json(
                new ApiResponse(
                    200,
                    "Phone verified successfully",
                    result
                )
            );
        }
    );

/**
 * =====================================================
 * REGISTER
 * =====================================================
 */

export const register =
    asyncHandler(
        async (req, res) => {

            const result =
                await authService.register(
                    req.body
                );

            // Set secure HttpOnly cookie for session management
            res.cookie("accessToken", result.accessToken, getAuthCookieOptions());

            return res.status(201).json(
                new ApiResponse(
                    201,
                    "Admin registered successfully",
                    result
                )
            );
        }
    );

/**
 * =====================================================
 * LOGIN
 * =====================================================
 */

export const login =
    asyncHandler(
        async (req, res) => {

            const result =
                await authService.login(
                    req.body
                );

            // Set secure HttpOnly cookie for session management
            res.cookie("accessToken", result.accessToken, getAuthCookieOptions());

            return res.status(200).json(
                new ApiResponse(
                    200,
                    "Login successful",
                    result
                )
            );
        }
    );

/**
 * =====================================================
 * LOGOUT
 * =====================================================
 */

export const logout =
    asyncHandler(
        async (req, res) => {

            // Clear the HttpOnly session cookie
            res.clearCookie("accessToken", getClearCookieOptions());

            return res.status(200).json(
                new ApiResponse(
                    200,
                    "Logged out successfully",
                    null
                )
            );
        }
    );

/**
 * =====================================================
 * GET CURRENT SESSION (ME)
 * =====================================================
 */

export const getMe =
    asyncHandler(
        async (req, res) => {
            // req.user is hydrated by authMiddleware from HttpOnly cookie
            return res.status(200).json(
                new ApiResponse(
                    200,
                    "Session authenticated successfully",
                    req.user
                )
            );
        }
    );
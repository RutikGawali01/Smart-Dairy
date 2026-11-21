import type { CookieOptions } from "express";

import jwt from "jsonwebtoken";

import asyncHandler
from "../../utils/asyncHandler.js";

import ApiResponse
from "../../utils/ApiResponse.js";

import { cache }
from "../../services/cache.service.js";

import { cacheKeys }
from "../../utils/cacheKeys.js";

import * as authService
from "./auth.service.js";

/**
 * Cookie options helper for secure HttpOnly cookie management (Dual Token Architecture)
 */
export const getAccessCookieOptions = (): CookieOptions => {
    const isProduction = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
        maxAge: 15 * 60 * 1000, // Short-lived: 15 minutes
        path: "/",
    };
};

export const getRefreshCookieOptions = (): CookieOptions => {
    const isProduction = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/api/v1/auth", // Restricted only to auth endpoints (refresh/logout)
    };
};

export const getClearAccessCookieOptions = (): CookieOptions => {
    const isProduction = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
        path: "/",
    };
};

export const getClearRefreshCookieOptions = (): CookieOptions => {
    const isProduction = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
        path: "/api/v1/auth",
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

            // Set secure HttpOnly cookies (short-lived access + rotated refresh)
            res.cookie("accessToken", result.accessToken, getAccessCookieOptions());
            res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());

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

            // Set secure HttpOnly cookies (short-lived access + rotated refresh)
            res.cookie("accessToken", result.accessToken, getAccessCookieOptions());
            res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());

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
 * REFRESH TOKEN (DUAL TOKEN ROTATION)
 * =====================================================
 */

export const refresh =
    asyncHandler(
        async (req, res) => {
            const incomingRefreshToken = req.cookies?.refreshToken;
            if (!incomingRefreshToken) {
                return res.status(401).json(
                    new ApiResponse(401, "No refresh token provided", null)
                );
            }

            const result = await authService.refreshSession(incomingRefreshToken);

            // Issue new rotated token pair
            res.cookie("accessToken", result.accessToken, getAccessCookieOptions());
            res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());

            return res.status(200).json(
                new ApiResponse(
                    200,
                    "Token refreshed successfully",
                    {
                        accessToken: result.accessToken,
                        admin: result.admin,
                    }
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
            const incomingRefreshToken = req.cookies?.refreshToken;
            const incomingAccessToken = req.cookies?.accessToken || req.headers.authorization?.split(" ")[1];

            if (incomingRefreshToken) {
                await authService.logoutAdmin(incomingRefreshToken);
            }

            // Invalidate cached admin session
            if (incomingAccessToken) {
                try {
                    const decoded: any = jwt.decode(incomingAccessToken);
                    if (decoded?.id) {
                        await cache.del(cacheKeys.adminSession(decoded.id));
                    }
                } catch {
                    // Ignore decoding error
                }
            }

            // Clear both HttpOnly session cookies
            res.clearCookie("accessToken", getClearAccessCookieOptions());
            res.clearCookie("refreshToken", getClearRefreshCookieOptions());

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
import jwt from "jsonwebtoken";

import { Request, Response, NextFunction } from "express";

import { prisma } from "../db/index.js";

import { cache } from "../services/cache.service.js";

import { cacheKeys } from "../utils/cacheKeys.js";

import ApiError from "../utils/ApiError.js";

import asyncHandler from "../utils/asyncHandler.js";


 // JWT PAYLOAD TYPE 
interface JwtPayload {
  id: string;
}

// EXTEND EXPRESS REQUEST

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// AUTH MIDDLEWARE

const authMiddleware = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {

    // 1. Check HttpOnly cookie first, then fallback to Bearer header
    let token: string | undefined = req.cookies?.accessToken || req.cookies?.token;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }

    // CHECK TOKEN EXISTS
    if (!token) {
      throw new ApiError(401, "Unauthorized access. No authentication token provided.", {
        code: "NO_TOKEN",
      });
    }

    /**
     * =============================================
     * VERIFY JWT
     * =============================================
     */

    let decoded: JwtPayload;

    try {
      decoded = jwt.verify(
        token,

        process.env.JWT_SECRET!,
      ) as JwtPayload;
    } catch {
      throw new ApiError(401, "Invalid or expired token", {
        code: "INVALID_TOKEN",
      });
    }

    /**
     * =============================================
     * FIND ADMIN (REDIS CACHED SESSION)
     * =============================================
     */

    const sessionKey = cacheKeys.adminSession(decoded.id);
    let admin = await cache.get<any>(sessionKey);

    if (!admin) {
      admin = await prisma.admin.findUnique({
        where: {
          id: decoded.id,
        },

        /**
         * NEVER RETURN PASSWORD
         */

        select: {
          id: true,
          ownerName: true,
          mobile: true,
          dairyName: true,
          village: true,
          taluka: true,
          district: true,
          state: true,
          collectionType: true,
          milkType: true,
          collectionShift: true,
          paymentPeriod: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      /**
       * CHECK ADMIN EXISTS
       */

      if (!admin) {
        throw new ApiError(401, "Admin not found", {
          code: "ADMIN_NOT_FOUND",
        });
      }

      // Cache admin session for 5 minutes (300 seconds)
      await cache.set(sessionKey, admin, 300);
    }

    /**
     * =============================================
     * ATTACH USER
     * =============================================
     */

    req.user = admin;

    next();
  },
);

export default authMiddleware;

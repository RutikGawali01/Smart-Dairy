import bcrypt from "bcrypt";

import jwt from "jsonwebtoken";

import admin from "../../config/firebase.js";

import { prisma }
from "../../db/index.js";

import ApiError
from "../../utils/ApiError.js";

import {
    issueTokenPair,
    rotateRefreshToken,
    revokeRefreshToken,
} from "../../utils/generateToken.js";

/**
 * =====================================================
 * VERIFY PHONE
 * =====================================================
 */

export const verifyPhone =
    async (data: any) => {

        const {
            firebaseToken,
            ownerName,
        } = data;

        /**
         * VERIFY FIREBASE TOKEN
         */

        const decodedToken =
            await admin
                .auth()
                .verifyIdToken(
                    firebaseToken
                );

        // /**
        //  * EXTRACT MOBILE
        //  */

        const mobile =
            decodedToken.phone_number;
// const mobile =
//     "+919999999998";

        if (!mobile) {
            throw new ApiError(
                400,
                "Invalid phone number",
                {
                    code:
                        "INVALID_PHONE",
                }
            );
        }

        /**
         * CHECK EXISTING ADMIN
         */

        const existingAdmin =
            await prisma.admin.findUnique({
                where: {
                    mobile,
                },
            });

        if (existingAdmin) {
            throw new ApiError(
                400,
                "Admin already exists",
                {
                    code:
                        "ADMIN_EXISTS",
                }
            );
        }

        /**
         * GENERATE TEMP TOKEN
         */

        const tempToken =
            jwt.sign(
                {
                    mobile,

                    ownerName,
                },

                process.env
                    .JWT_SECRET!,

                {
                    expiresIn:
                        "15m",
                }
            );

        return {
            tempToken,

            mobile,

            ownerName,
        };
    };

/**
 * =====================================================
 * REGISTER
 * =====================================================
 */

export const register =
    async (data: any) => {

        const {
            tempToken,
           

            password,

            dairyName,

            village,

            taluka,

            district,

            state,

            collectionType,

            milkType,

            collectionShift,

            paymentPeriod,
        } = data;

        /**
         * VERIFY TEMP TOKEN
         */

        let decoded: any;

        try {
            decoded =
                jwt.verify(
                    tempToken,

                    process.env
                        .JWT_SECRET!
                );
        } catch {
            throw new ApiError(
                401,
                "Invalid or expired token",
                {
                    code:
                        "INVALID_TOKEN",
                }
            );
        }

        /**
         * HASH PASSWORD
         */

        const hashedPassword =
            await bcrypt.hash(
                password,
                10
            );

        /**
         * CREATE ADMIN
         */

        const adminUser =
            await prisma.admin.create({
                data: {
                    ownerName:
                        decoded.ownerName,

                    mobile:
                        decoded.mobile,

                    password:
                        hashedPassword,

                    dairyName,

                    village,

                    taluka,

                    district,

                    state,

                    collectionType,

                    milkType,

                    collectionShift,

                    paymentPeriod,
                },
            });

        /**
         * GENERATE DUAL TOKENS (Short-lived Access Token + Rotated Refresh Token)
         */

        const { accessToken, refreshToken } =
            await issueTokenPair(adminUser.id);

        /**
         * REMOVE PASSWORD
         */

        const {
            password:
                removedPassword,

            ...safeAdmin
        } = adminUser;

        return {
            accessToken,
            refreshToken,

            admin:
                safeAdmin,
        };
    };

/**
 * =====================================================
 * LOGIN
 * =====================================================
 */

export const login =
    async (data: any) => {

        const {
            mobile,
            password,
        } = data;

        /**
         * FIND ADMIN
         */

        const adminUser =
            await prisma.admin.findUnique({
                where: {
                    mobile,
                },
            });

        if (!adminUser) {
            throw new ApiError(
                404,
                "Admin not found",
                {
                    code:
                        "ADMIN_NOT_FOUND",
                }
            );
        }

        /**
         * CHECK PASSWORD
         */

        const isPasswordCorrect =
            await bcrypt.compare(
                password,
                adminUser.password
            );

        if (!isPasswordCorrect) {
            throw new ApiError(
                401,
                "Invalid credentials",
                {
                    code:
                        "INVALID_CREDENTIALS",
                }
            );
        }

        /**
         * GENERATE DUAL TOKENS (Short-lived Access Token + Rotated Refresh Token)
         */

        const { accessToken, refreshToken } =
            await issueTokenPair(adminUser.id);

        /**
         * REMOVE PASSWORD
         */

        const {
            password:
                removedPassword,

            ...safeAdmin
        } = adminUser;

        return {
            accessToken,
            refreshToken,

            admin:
                safeAdmin,
        };
    };

/**
 * =====================================================
 * REFRESH SESSION (TOKEN ROTATION)
 * =====================================================
 */

export const refreshSession =
    async (token: string) => {
        const { adminId, accessToken, refreshToken } =
            await rotateRefreshToken(token);

        const adminUser =
            await prisma.admin.findUnique({
                where: {
                    id: adminId,
                },
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

        if (!adminUser) {
            throw new ApiError(
                401,
                "Admin user not found",
                {
                    code: "ADMIN_NOT_FOUND",
                }
            );
        }

        return {
            accessToken,
            refreshToken,
            admin: adminUser,
        };
    };

/**
 * =====================================================
 * LOGOUT SESSION (REVOCATION)
 * =====================================================
 */

export const logoutAdmin =
    async (refreshToken?: string) => {
        await revokeRefreshToken(refreshToken);
    };
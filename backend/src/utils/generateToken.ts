import jwt from "jsonwebtoken";
import crypto from "crypto";
import { cache } from "../services/cache.service.js";
import ApiError from "./ApiError.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

interface RefreshTokenPayload {
  id: string;
  tokenId: string;
}

interface AccessTokenPayload {
  id: string;
}

/**
 * Generate a short-lived access token (15 minutes)
 */
export const generateAccessToken = (adminId: string): string => {
  return jwt.sign(
    { id: adminId } as AccessTokenPayload,
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Generate a long-lived refresh token with a unique rotation ID (7 days)
 */
export const generateRefreshToken = (adminId: string): { refreshToken: string; tokenId: string } => {
  const tokenId = crypto.randomUUID();
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!;

  const refreshToken = jwt.sign(
    { id: adminId, tokenId } as RefreshTokenPayload,
    secret,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
  );

  return { refreshToken, tokenId };
};

/**
 * Persist refresh token ID in cache/Redis whitelist
 */
export const persistRefreshToken = async (
  adminId: string,
  tokenId: string,
  ttlSeconds = REFRESH_TOKEN_TTL_SECONDS
): Promise<void> => {
  const cacheKey = `auth:refresh:${adminId}:${tokenId}`;
  await cache.set(cacheKey, { active: true, createdAt: Date.now() }, ttlSeconds);
};

/**
 * Issue both Access Token and Refresh Token, persisting refresh token in cache
 */
export const issueTokenPair = async (
  adminId: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  const accessToken = generateAccessToken(adminId);
  const { refreshToken, tokenId } = generateRefreshToken(adminId);

  await persistRefreshToken(adminId, tokenId);

  return { accessToken, refreshToken };
};

/**
 * Validate incoming refresh token, perform rotation (revoke old, issue new)
 */
export const rotateRefreshToken = async (
  token: string
): Promise<{ adminId: string; accessToken: string; refreshToken: string }> => {
  if (!token) {
    throw new ApiError(401, "Refresh token is required", { code: "NO_REFRESH_TOKEN" });
  }

  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!;
  let decoded: RefreshTokenPayload;

  try {
    decoded = jwt.verify(token, secret) as RefreshTokenPayload;
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token", { code: "INVALID_REFRESH_TOKEN" });
  }

  const { id: adminId, tokenId } = decoded;
  const cacheKey = `auth:refresh:${adminId}:${tokenId}`;

  const tokenEntry = await cache.get(cacheKey);

  // If token is missing from cache, it was already consumed or revoked (Theft / Reuse Detection)
  if (!tokenEntry) {
    // Revoke all sessions for this admin as an enterprise defense measure
    await cache.clearPattern(`auth:refresh:${adminId}:*`);
    throw new ApiError(401, "Session revoked or token already used. Please log in again.", {
      code: "REFRESH_TOKEN_REUSE",
    });
  }

  // Invalidate the old refresh token immediately (Single-use rotation)
  await cache.del(cacheKey);

  // Issue brand-new access and refresh tokens
  const newTokens = await issueTokenPair(adminId);

  return {
    adminId,
    accessToken: newTokens.accessToken,
    refreshToken: newTokens.refreshToken,
  };
};

/**
 * Revoke refresh token on logout
 */
export const revokeRefreshToken = async (token?: string): Promise<void> => {
  if (!token) return;

  try {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET!;
    const decoded = jwt.verify(token, secret, { ignoreExpiration: true }) as RefreshTokenPayload;
    if (decoded?.id && decoded?.tokenId) {
      await cache.del(`auth:refresh:${decoded.id}:${decoded.tokenId}`);
    }
  } catch {
    // Ignore malformed token on logout cleanup
  }
};


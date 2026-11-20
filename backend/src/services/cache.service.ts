import { redis } from "../config/redis.js";
import logger from "../config/logger.js";

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const memoryStore = new Map<string, CacheEntry>();

class CacheService {
  /**
   * GET
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (redis.isOpen) {
        const data = await redis.get(key);
        if (data) {
          return JSON.parse(data);
        }
      }
    } catch (error) {
      logger.warn(`[CacheService] get failed for key "${key}":`, { error });
    }

    // In-memory fallback
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value);
    } catch {
      return null;
    }
  }

  /**
   * SET
   */
  async set(key: string, value: unknown, ttl = 3600): Promise<void> {
    const serialized = JSON.stringify(value);
    try {
      if (redis.isOpen) {
        await redis.set(key, serialized, { EX: ttl });
        return;
      }
    } catch (error) {
      logger.warn(`[CacheService] set failed for key "${key}":`, { error });
    }

    // In-memory fallback
    memoryStore.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  /**
   * DELETE
   */
  async del(key: string): Promise<void> {
    try {
      if (redis.isOpen) {
        await redis.del(key);
      }
    } catch (error) {
      logger.warn(`[CacheService] del failed for key "${key}":`, { error });
    }
    memoryStore.delete(key);
  }

  /**
   * EXISTS
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (redis.isOpen) {
        const result = await redis.exists(key);
        return result === 1;
      }
    } catch (error) {
      logger.warn(`[CacheService] exists failed for key "${key}":`, { error });
    }

    const entry = memoryStore.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return false;
    }
    return true;
  }

  /**
   * CLEAR PATTERN
   */
  async clearPattern(pattern: string): Promise<void> {
    try {
      if (redis.isOpen) {
        const keys = await redis.keys(pattern);
        if (keys && keys.length > 0) {
          await redis.del(keys);
        }
      }
    } catch (error) {
      logger.warn(`[CacheService] clearPattern failed for pattern "${pattern}":`, { error });
    }

    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    for (const k of memoryStore.keys()) {
      if (regex.test(k)) {
        memoryStore.delete(k);
      }
    }
  }
}

export const cache = new CacheService();
import { Request, Response, NextFunction } from "express";
import { redisClient } from "./redis";
import { getClientIp } from "./audit";
import { AppError } from "./errors";
import { randomUUID } from "crypto";

export interface RateLimitOptions {
  windowMs: number; // Duration of window in milliseconds
  max: number;      // Maximum requests allowed in window
  message?: string; // Custom error message
}

// Pre-defined rate-limiting presets as described in the requirements
export const STRICT_LIMIT: RateLimitOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: "Too many authentication or sensitive attempts. Locked for 15 minutes.",
};

export const STANDARD_LIMIT: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: "Too many requests. Please slow down.",
};

export const RELAXED_LIMIT: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  message: "Relaxed limit exceeded.",
};

// Generic Redis-backed rate limiter middleware factory using sliding windows
export const rateLimiter = (options: RateLimitOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Short-circuit if Redis client isn't connected
      if (!redisClient.isOpen) {
        return next();
      }

      const ip = getClientIp(req);
      // Identify request rate limits by User ID if logged in, otherwise fall back to IP
      const rateLimitKey = req.user
        ? `ratelimit:user:${req.user.id}`
        : `ratelimit:ip:${ip}`;

      const now = Date.now();
      const clearBefore = now - options.windowMs;
      const requestIdentifier = randomUUID();

      // Implement sliding window rate limit checks transactionally
      const multi = redisClient.multi();
      multi.zRemRangeByScore(rateLimitKey, 0, clearBefore);
      multi.zCard(rateLimitKey);
      multi.zAdd(rateLimitKey, { score: now, value: requestIdentifier });
      multi.expire(rateLimitKey, Math.ceil(options.windowMs / 1000));

      const results = await multi.exec();
      if (!results) {
        return next();
      }

      // Extract card of set after removing old scores
      const currentRequestCount = (results[1] as number) + 1; // Include the current request

      const remaining = Math.max(0, options.max - currentRequestCount);
      const resetTime = now + options.windowMs;

      // Add rate limiting header telemetry
      res.setHeader("X-RateLimit-Limit", options.max);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000));

      if (currentRequestCount > options.max) {
        throw new AppError(
          429,
          "TOO_MANY_REQUESTS",
          options.message || "Too many requests. Please try again later.",
          {
            retryAfterMs: resetTime - now,
          }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

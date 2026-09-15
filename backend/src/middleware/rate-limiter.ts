import type { RequestHandler } from "express";
import type { RedisClientType } from "redis";

import { redisClient } from "../redis";

interface RateLimiterOptions {
  maxRequests: number;
  windowSeconds: number;
}

// Fixed-window counter per IP: INCR the window key and set its TTL only on the
// first hit in that window, so the count always expires with the window.
const incrementRequestCount = async (
  redis: RedisClientType,
  key: string,
  windowSeconds: number,
): Promise<number> => {
  const luaScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return current
  `;

  const result = await redis.eval(luaScript, {
    keys: [key],
    arguments: [windowSeconds.toString()],
  });

  return Number(result);
};

export const rateLimiter = (options: RateLimiterOptions): RequestHandler => {
  const { maxRequests, windowSeconds } = options;

  return (request, response, next): void => {
    void (async (): Promise<void> => {
      const ip = request.ip ?? "unknown";
      const key = `rate-limit:${ip}`;

      let requestCount: number;
      try {
        requestCount = await incrementRequestCount(
          redisClient,
          key,
          windowSeconds,
        );
      } catch (error) {
        console.error("Rate limiter unavailable; allowing request", error);
        next();
        return;
      }

      if (requestCount > maxRequests) {
        response.status(429).json({
          status: 429,
          message: "Too many requests",
        });
        return;
      }

      next();
    })().catch(next);
  };
};

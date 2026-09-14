import "../env";

import { createClient, type RedisClientType } from "redis";

const host = process.env.REDIS_HOST ?? "localhost";
const port = Number(process.env.REDIS_PORT ?? 6379);

export const redisClient: RedisClientType = createClient({
  socket: {
    host,
    port,
  },
});

redisClient.on("error", (error: Error): void => {
  console.error("Redis client error", error);
});

export const connectRedis = async (): Promise<void> => {
  await redisClient.connect();
};

export const closeRedis = async (): Promise<void> => {
  await redisClient.quit();
};

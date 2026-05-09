import IORedis, { type Redis, type RedisOptions } from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

const baseOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const redis: Redis =
  globalForRedis.redis ?? new IORedis(env.REDIS_URL, baseOptions);

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export function createRedisConnection(): Redis {
  return new IORedis(env.REDIS_URL, baseOptions);
}

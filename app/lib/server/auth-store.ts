import { Redis } from "@upstash/redis";

/**
 * Short-lived server state for signed requests: which signatures were
 * already used (replay protection) and the My Bookings sessions. Kept in the
 * Upstash Redis the rate limiter already uses, with a TTL on every key, so
 * nothing needs cleaning up.
 */
export interface AuthStore {
  /** Records `key` for `ttlMs`; false when it was already recorded. */
  claimOnce(key: string, ttlMs: number): Promise<boolean>;
  put(key: string, value: string, ttlMs: number): Promise<void>;
  get(key: string): Promise<string | null>;
}

const PREFIX = "el-solar:auth:";

export const createUpstashAuthStore = (): AuthStore => {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    automaticDeserialization: false,
  });
  return {
    claimOnce: async (key, ttlMs) =>
      (await redis.set(PREFIX + key, "1", { nx: true, px: ttlMs })) === "OK",
    put: async (key, value, ttlMs) => {
      await redis.set(PREFIX + key, value, { px: ttlMs });
    },
    get: (key) => redis.get<string>(PREFIX + key),
  };
};

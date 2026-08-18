import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  prefix: "el-solar",
  // analytics: true, // Enable on paid tier for monitoring dashboard
});

/**
 * Marketing generation calls a model provider, so every request costs real
 * money rather than a database read. It gets its own far tighter budget.
 *
 * The prefix must stay distinct from the one above: sharing it would make
 * booking traffic eat the marketing allowance and vice versa, since Upstash
 * keys on prefix plus identifier.
 */
export const marketingRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(4, "1 h"),
  prefix: "el-solar-marketing",
  // analytics: true, // Enable on paid tier for monitoring dashboard
});

import { PLAN_RATE_LIMITS, type PlanSlug } from "@supacontext/core";
import { ApiError } from "./errors.js";

export type RateLimitInput = {
  workspaceId: string;
  plan: PlanSlug;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export interface RateLimiter {
  check(input: RateLimitInput): Promise<RateLimitResult>;
}

type CounterState = {
  count: number;
  resetAt: number;
};

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, CounterState>();

  async check(input: RateLimitInput): Promise<RateLimitResult> {
    const limit = PLAN_RATE_LIMITS[input.plan].requestsPerMinute;
    const now = Date.now();
    const windowStart = Math.floor(now / 60_000) * 60_000;
    const resetAt = windowStart + 60_000;
    const key = `${input.workspaceId}:${windowStart}`;
    const current = this.counters.get(key);
    const state = current && current.resetAt > now ? current : { count: 0, resetAt };

    state.count += 1;
    this.counters.set(key, state);

    return {
      allowed: state.count <= limit,
      limit,
      remaining: Math.max(0, limit - state.count),
      resetAt: new Date(resetAt),
    };
  }
}

class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly redisUrl: string,
    private readonly redisToken: string,
  ) {}

  async check(input: RateLimitInput): Promise<RateLimitResult> {
    const limit = PLAN_RATE_LIMITS[input.plan].requestsPerMinute;
    const now = Date.now();
    const windowStart = Math.floor(now / 60_000) * 60_000;
    const resetAt = windowStart + 60_000;
    const key = `supacontext:rate:${input.workspaceId}:${windowStart}`;
    let response: Response;

    try {
      response = await fetch(`${this.redisUrl.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.redisToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, "60"],
        ]),
        signal: AbortSignal.timeout(2_000),
      });
    } catch {
      throw new ApiError(503, "rate_limited", "Rate limiter is unavailable.");
    }

    if (!response.ok) {
      throw new ApiError(503, "rate_limited", "Rate limiter is unavailable.");
    }

    const data = (await response.json()) as Array<{ result?: unknown }>;
    const count = Number(data[0]?.result ?? 0);

    if (!Number.isFinite(count)) {
      throw new ApiError(503, "rate_limited", "Rate limiter returned an invalid response.");
    }

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(resetAt),
    };
  }
}

export function createRateLimiter(input: {
  nodeEnv: string;
  redisUrl: string | undefined;
  redisToken: string | undefined;
  warn?: (message: string) => void;
}): RateLimiter {
  if (input.redisUrl && input.redisToken) {
    return new UpstashRateLimiter(input.redisUrl, input.redisToken);
  }

  if (input.nodeEnv === "production") {
    throw new Error("Upstash Redis must be configured in production.");
  }

  input.warn?.("Upstash Redis is not configured; using in-memory development rate limits.");

  return new InMemoryRateLimiter();
}

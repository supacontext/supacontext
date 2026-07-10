import type { PlanSlug } from "./types.js";

export type BillingInterval = "one_time" | "month";

export type PlanConfig = {
  slug: PlanSlug;
  name: string;
  billingInterval: BillingInterval;
  priceCents: number;
  includedCredits: number;
};

export type PlanRateLimit = {
  requestsPerMinute: number;
  concurrentJobs: number;
};

export const PLANS = {
  trial: {
    slug: "trial",
    name: "Trial",
    billingInterval: "one_time",
    priceCents: 0,
    includedCredits: 50,
  },
  starter: {
    slug: "starter",
    name: "Starter",
    billingInterval: "month",
    priceCents: 1900,
    includedCredits: 1500,
  },
  builder: {
    slug: "builder",
    name: "Builder",
    billingInterval: "month",
    priceCents: 4900,
    includedCredits: 4000,
  },
  pro: {
    slug: "pro",
    name: "Pro",
    billingInterval: "month",
    priceCents: 9900,
    includedCredits: 9000,
  },
  scale: {
    slug: "scale",
    name: "Scale",
    billingInterval: "month",
    priceCents: 24900,
    includedCredits: 22000,
  },
} as const satisfies Record<PlanSlug, PlanConfig>;

export const PLAN_RATE_LIMITS = {
  trial: {
    requestsPerMinute: 5,
    concurrentJobs: 1,
  },
  starter: {
    requestsPerMinute: 20,
    concurrentJobs: 3,
  },
  builder: {
    requestsPerMinute: 60,
    concurrentJobs: 8,
  },
  pro: {
    requestsPerMinute: 150,
    concurrentJobs: 20,
  },
  scale: {
    requestsPerMinute: 300,
    concurrentJobs: 50,
  },
} as const satisfies Record<PlanSlug, PlanRateLimit>;

export function getPlanIncludedCredits(plan: PlanSlug): number {
  return PLANS[plan].includedCredits;
}

import type { PlanSlug } from "./types.js";

export type BillingInterval = "one_time" | "month" | "custom";

export type PlanConfig = {
  slug: PlanSlug;
  name: string;
  billingInterval: BillingInterval;
  priceCents: number | null;
  annualPriceCents: number | null;
  includedCredits: number | null;
};

export type PlanRateLimit = {
  requestsPerMinute: number | null;
  concurrentJobs: number | null;
};

export const PLANS = {
  free: {
    slug: "free",
    name: "Free",
    billingInterval: "one_time",
    priceCents: 0,
    annualPriceCents: null,
    includedCredits: 250,
  },
  starter: {
    slug: "starter",
    name: "Starter",
    billingInterval: "month",
    priceCents: 1900,
    annualPriceCents: 19000,
    includedCredits: 5_000,
  },
  pro: {
    slug: "pro",
    name: "Pro",
    billingInterval: "month",
    priceCents: 7900,
    annualPriceCents: 79000,
    includedCredits: 25_000,
  },
  growth: {
    slug: "growth",
    name: "Growth",
    billingInterval: "month",
    priceCents: 19900,
    annualPriceCents: 199000,
    includedCredits: 75_000,
  },
  scale: {
    slug: "scale",
    name: "Scale",
    billingInterval: "month",
    priceCents: 49900,
    annualPriceCents: 499000,
    includedCredits: 200_000,
  },
  enterprise: {
    slug: "enterprise",
    name: "Enterprise",
    billingInterval: "custom",
    priceCents: null,
    annualPriceCents: null,
    includedCredits: null,
  },
} as const satisfies Record<PlanSlug, PlanConfig>;

export const PLAN_RATE_LIMITS = {
  free: {
    requestsPerMinute: 5,
    concurrentJobs: 1,
  },
  starter: {
    requestsPerMinute: 20,
    concurrentJobs: 3,
  },
  pro: {
    requestsPerMinute: 60,
    concurrentJobs: 10,
  },
  growth: {
    requestsPerMinute: 150,
    concurrentJobs: 25,
  },
  scale: {
    requestsPerMinute: 300,
    concurrentJobs: 75,
  },
  enterprise: {
    requestsPerMinute: null,
    concurrentJobs: null,
  },
} as const satisfies Record<PlanSlug, PlanRateLimit>;

export function getPlanIncludedCredits(plan: PlanSlug): number | null {
  return PLANS[plan].includedCredits;
}

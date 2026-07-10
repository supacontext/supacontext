import type { ContextDepth, PlanSlug } from "./types.js";

export type BillingInterval = "one_time" | "month" | "custom";

export type PlanConfig = {
  slug: PlanSlug;
  name: string;
  billingInterval: BillingInterval;
  priceCents: number | null;
  annualPriceCents: number | null;
  includedCredits: number | null;
  deepAllowed: boolean;
};

export type PlanRateLimit = {
  requestsPerMinute: number | null;
  concurrentJobs: number | null;
};

export const DEPTH_CREDIT_COST = {
  fast: 5,
  standard: 20,
  thorough: 50,
  deep: 100,
} as const satisfies Record<ContextDepth, number>;

export const CREDIT_CENTS = 1;

export const PLANS = {
  free: {
    slug: "free",
    name: "Free",
    billingInterval: "one_time",
    priceCents: 0,
    annualPriceCents: null,
    includedCredits: 250,
    deepAllowed: false,
  },
  starter: {
    slug: "starter",
    name: "Starter",
    billingInterval: "month",
    priceCents: 1900,
    annualPriceCents: 19000,
    includedCredits: 5_000,
    deepAllowed: true,
  },
  pro: {
    slug: "pro",
    name: "Pro",
    billingInterval: "month",
    priceCents: 7900,
    annualPriceCents: 79000,
    includedCredits: 25_000,
    deepAllowed: true,
  },
  growth: {
    slug: "growth",
    name: "Growth",
    billingInterval: "month",
    priceCents: 19900,
    annualPriceCents: 199000,
    includedCredits: 75_000,
    deepAllowed: true,
  },
  scale: {
    slug: "scale",
    name: "Scale",
    billingInterval: "month",
    priceCents: 49900,
    annualPriceCents: 499000,
    includedCredits: 200_000,
    deepAllowed: true,
  },
  enterprise: {
    slug: "enterprise",
    name: "Enterprise",
    billingInterval: "custom",
    priceCents: null,
    annualPriceCents: null,
    includedCredits: null,
    deepAllowed: true,
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

export function getDepthCreditCost(depth: ContextDepth): number {
  return DEPTH_CREDIT_COST[depth];
}

export function isDepthAllowedForPlan(plan: PlanSlug, depth: ContextDepth): boolean {
  return depth !== "deep" || PLANS[plan].deepAllowed;
}

export function getPlanIncludedCredits(plan: PlanSlug): number | null {
  return PLANS[plan].includedCredits;
}

export function getCreditValueCents(credits: number): number {
  if (!Number.isInteger(credits) || credits < 0) {
    throw new Error("Credits must be a non-negative integer.");
  }

  return credits * CREDIT_CENTS;
}

export function assertSufficientCredits(balance: number, depth: ContextDepth): void {
  if (!Number.isInteger(balance) || balance < 0) {
    throw new Error("Credit balance must be a non-negative integer.");
  }

  const requiredCredits = getDepthCreditCost(depth);

  if (balance < requiredCredits) {
    throw new Error(`Insufficient credits: ${requiredCredits} required, ${balance} available.`);
  }
}

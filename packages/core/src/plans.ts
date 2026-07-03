import type { ContextDepth, PlanSlug } from "./types.js";

export type BillingInterval = "one_time" | "month";

export type PlanConfig = {
  slug: PlanSlug;
  name: string;
  billingInterval: BillingInterval;
  priceCents: number;
  includedCredits: number;
  deepAllowed: boolean;
};

export type PlanRateLimit = {
  requestsPerMinute: number;
  concurrentJobs: number;
  deepConcurrentJobs: number;
};

export const DEPTH_CREDIT_COST = {
  fast: 5,
  standard: 20,
  thorough: 50,
  deep: 100,
} as const satisfies Record<ContextDepth, number>;

export const CREDIT_CENTS = 1;

export const PLANS = {
  trial: {
    slug: "trial",
    name: "Trial",
    billingInterval: "one_time",
    priceCents: 0,
    includedCredits: 50,
    deepAllowed: false,
  },
  starter: {
    slug: "starter",
    name: "Starter",
    billingInterval: "month",
    priceCents: 1900,
    includedCredits: 1500,
    deepAllowed: true,
  },
  builder: {
    slug: "builder",
    name: "Builder",
    billingInterval: "month",
    priceCents: 4900,
    includedCredits: 4000,
    deepAllowed: true,
  },
  pro: {
    slug: "pro",
    name: "Pro",
    billingInterval: "month",
    priceCents: 9900,
    includedCredits: 9000,
    deepAllowed: true,
  },
  scale: {
    slug: "scale",
    name: "Scale",
    billingInterval: "month",
    priceCents: 24900,
    includedCredits: 22000,
    deepAllowed: true,
  },
} as const satisfies Record<PlanSlug, PlanConfig>;

export const PLAN_RATE_LIMITS = {
  trial: {
    requestsPerMinute: 5,
    concurrentJobs: 1,
    deepConcurrentJobs: 0,
  },
  starter: {
    requestsPerMinute: 20,
    concurrentJobs: 3,
    deepConcurrentJobs: 1,
  },
  builder: {
    requestsPerMinute: 60,
    concurrentJobs: 8,
    deepConcurrentJobs: 2,
  },
  pro: {
    requestsPerMinute: 150,
    concurrentJobs: 20,
    deepConcurrentJobs: 5,
  },
  scale: {
    requestsPerMinute: 300,
    concurrentJobs: 50,
    deepConcurrentJobs: 10,
  },
} as const satisfies Record<PlanSlug, PlanRateLimit>;

export function getDepthCreditCost(depth: ContextDepth): number {
  return DEPTH_CREDIT_COST[depth];
}

export function isDepthAllowedForPlan(plan: PlanSlug, depth: ContextDepth): boolean {
  return depth !== "deep" || PLANS[plan].deepAllowed;
}

export function getPlanIncludedCredits(plan: PlanSlug): number {
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

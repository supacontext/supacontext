import { describe, expect, it } from "vitest";
import { getPlanIncludedCredits, PLAN_RATE_LIMITS, PLANS } from "../plans.js";
import { PLAN_SLUGS, SELF_SERVE_PAID_PLAN_SLUGS } from "../types.js";

describe("subscription plans", () => {
  it("keeps the public plan catalog, prices, and allowances", () => {
    expect(PLAN_SLUGS).toEqual(["free", "starter", "pro", "growth", "scale", "enterprise"]);
    expect(SELF_SERVE_PAID_PLAN_SLUGS).toEqual(["starter", "pro", "growth", "scale"]);
    expect(PLANS).toMatchObject({
      free: {
        billingInterval: "one_time",
        priceCents: 0,
        annualPriceCents: null,
        includedCredits: 250,
      },
      starter: {
        billingInterval: "month",
        priceCents: 1900,
        annualPriceCents: 19000,
        includedCredits: 5_000,
      },
      pro: {
        billingInterval: "month",
        priceCents: 7900,
        annualPriceCents: 79000,
        includedCredits: 25_000,
      },
      growth: {
        billingInterval: "month",
        priceCents: 19900,
        annualPriceCents: 199000,
        includedCredits: 75_000,
      },
      scale: {
        billingInterval: "month",
        priceCents: 49900,
        annualPriceCents: 499000,
        includedCredits: 200_000,
      },
      enterprise: {
        billingInterval: "custom",
        priceCents: null,
        annualPriceCents: null,
        includedCredits: null,
      },
    });
    expect(getPlanIncludedCredits("pro")).toBe(25_000);
  });

  it("keeps plan rate limits without effort-specific restrictions", () => {
    expect(PLAN_RATE_LIMITS.free).toEqual({ requestsPerMinute: 5, concurrentJobs: 1 });
    expect(PLAN_RATE_LIMITS.scale).toEqual({ requestsPerMinute: 300, concurrentJobs: 75 });
    expect(PLAN_RATE_LIMITS.enterprise).toEqual({
      requestsPerMinute: null,
      concurrentJobs: null,
    });
    expect(PLANS.free).not.toHaveProperty("deepAllowed");
  });
});

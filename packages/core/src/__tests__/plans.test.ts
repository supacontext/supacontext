import { describe, expect, it } from "vitest";
import { getPlanIncludedCredits, PLAN_RATE_LIMITS, PLANS } from "../plans.js";

describe("subscription plans", () => {
  it("keeps the existing subscription prices and allowances", () => {
    expect(PLANS).toMatchObject({
      trial: { priceCents: 0, includedCredits: 50 },
      starter: { priceCents: 1900, includedCredits: 1500 },
      builder: { priceCents: 4900, includedCredits: 4000 },
      pro: { priceCents: 9900, includedCredits: 9000 },
      scale: { priceCents: 24900, includedCredits: 22000 },
    });
    expect(getPlanIncludedCredits("pro")).toBe(9000);
  });

  it("keeps plan rate limits without depth-specific restrictions", () => {
    expect(PLAN_RATE_LIMITS.trial).toEqual({
      requestsPerMinute: 5,
      concurrentJobs: 1,
    });
    expect(PLAN_RATE_LIMITS.scale).toEqual({
      requestsPerMinute: 300,
      concurrentJobs: 50,
    });
    expect(PLANS.trial).not.toHaveProperty("deepAllowed");
  });
});

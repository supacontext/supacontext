import { describe, expect, it } from "vitest";
import {
  assertSufficientCredits,
  DEPTH_CREDIT_COST,
  getCreditValueCents,
  getDepthCreditCost,
  isDepthAllowedForPlan,
  PLAN_RATE_LIMITS,
  PLANS,
} from "../plans.js";
import { PLAN_SLUGS, SELF_SERVE_PAID_PLAN_SLUGS } from "../types.js";

describe("credit math", () => {
  it("prices depths in credits", () => {
    expect(DEPTH_CREDIT_COST).toEqual({
      fast: 5,
      standard: 20,
      thorough: 50,
      deep: 100,
    });
    expect(getDepthCreditCost("deep")).toBe(100);
  });

  it("uses one cent per credit", () => {
    expect(getCreditValueCents(1500)).toBe(1500);
  });

  it("keeps the public plan catalog in shared constants", () => {
    expect(PLAN_SLUGS).toEqual(["free", "starter", "pro", "growth", "scale", "enterprise"]);
    expect(SELF_SERVE_PAID_PLAN_SLUGS).toEqual(["starter", "pro", "growth", "scale"]);
    expect(PLANS).toMatchObject({
      free: {
        name: "Free",
        priceCents: 0,
        annualPriceCents: null,
        includedCredits: 250,
      },
      starter: {
        name: "Starter",
        priceCents: 1900,
        annualPriceCents: 19000,
        includedCredits: 5_000,
      },
      pro: {
        name: "Pro",
        priceCents: 7900,
        annualPriceCents: 79000,
        includedCredits: 25_000,
      },
      growth: {
        name: "Growth",
        priceCents: 19900,
        annualPriceCents: 199000,
        includedCredits: 75_000,
      },
      scale: {
        name: "Scale",
        priceCents: 49900,
        annualPriceCents: 499000,
        includedCredits: 200_000,
      },
      enterprise: {
        name: "Enterprise",
        priceCents: null,
        annualPriceCents: null,
        includedCredits: null,
      },
    });
  });

  it("blocks deep requests on the free plan", () => {
    expect(isDepthAllowedForPlan("free", "deep")).toBe(false);
    expect(isDepthAllowedForPlan("starter", "deep")).toBe(true);
  });

  it("keeps advertised concurrency in shared constants", () => {
    expect(
      Object.fromEntries(
        Object.entries(PLAN_RATE_LIMITS).map(([slug, limits]) => [slug, limits.concurrentJobs]),
      ),
    ).toEqual({
      free: 1,
      starter: 3,
      pro: 10,
      growth: 25,
      scale: 75,
      enterprise: null,
    });
    expect(PLAN_RATE_LIMITS.free.requestsPerMinute).toBe(5);
  });

  it("rejects insufficient balances", () => {
    expect(() => assertSufficientCredits(19, "standard")).toThrow("Insufficient credits");
    expect(() => assertSufficientCredits(20, "standard")).not.toThrow();
  });
});

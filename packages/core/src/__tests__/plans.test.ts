import { describe, expect, it } from "vitest";
import {
  assertSufficientCredits,
  DEPTH_CREDIT_COST,
  getCreditValueCents,
  getDepthCreditCost,
  isDepthAllowedForPlan,
  PLANS,
} from "../plans.js";

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

  it("blocks deep requests on trial", () => {
    expect(PLANS.trial.includedCredits).toBe(50);
    expect(isDepthAllowedForPlan("trial", "deep")).toBe(false);
    expect(isDepthAllowedForPlan("starter", "deep")).toBe(true);
  });

  it("rejects insufficient balances", () => {
    expect(() => assertSufficientCredits(19, "standard")).toThrow("Insufficient credits");
    expect(() => assertSufficientCredits(20, "standard")).not.toThrow();
  });
});


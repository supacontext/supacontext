import { describe, expect, it } from "vitest";
import { getDepthCreditCost } from "@supacontext/core";
import { authorizeUsage, getDepthRank } from "../index.js";

describe("usage authorization", () => {
  it("returns the depth credit cost", () => {
    expect(getDepthCreditCost("fast")).toBe(5);
    expect(getDepthCreditCost("standard")).toBe(20);
  });

  it("ranks depths using the core depth order", () => {
    expect(getDepthRank("fast")).toBeLessThan(getDepthRank("standard"));
    expect(getDepthRank("thorough")).toBeLessThan(getDepthRank("deep"));
    expect(() => getDepthRank("unknown" as never)).toThrow("Unknown context depth");
  });

  it("rejects plan-restricted depths", () => {
    expect(
      authorizeUsage({
        plan: "free",
        depth: "deep",
        balance: 100,
      }),
    ).toEqual({
      allowed: false,
      requiredCredits: 100,
      reason: "plan_depth_restricted",
    });
  });

  it("rejects API-key-restricted depths", () => {
    expect(
      authorizeUsage({
        plan: "starter",
        depth: "deep",
        balance: 100,
        apiKeyMaxDepth: "thorough",
      }),
    ).toEqual({
      allowed: false,
      requiredCredits: 100,
      reason: "api_key_depth_restricted",
    });
  });

  it("rejects monthly limit overages but allows exact limits", () => {
    expect(
      authorizeUsage({
        plan: "starter",
        depth: "standard",
        balance: 100,
        monthlyCreditLimit: 19,
        monthToDateCredits: 0,
      }),
    ).toEqual({
      allowed: false,
      requiredCredits: 20,
      reason: "monthly_limit",
    });

    expect(
      authorizeUsage({
        plan: "starter",
        depth: "standard",
        balance: 100,
        monthlyCreditLimit: 50,
        monthToDateCredits: 30,
      }),
    ).toEqual({
      allowed: true,
      requiredCredits: 20,
    });
  });

  it("rejects insufficient credits", () => {
    expect(
      authorizeUsage({
        plan: "starter",
        depth: "fast",
        balance: 4,
      }),
    ).toEqual({
      allowed: false,
      requiredCredits: 5,
      reason: "credits",
    });
  });

  it("allows usage within plan, API key, monthly limit, and balance", () => {
    expect(
      authorizeUsage({
        plan: "starter",
        depth: "standard",
        balance: 20,
        apiKeyMaxDepth: "standard",
        monthlyCreditLimit: 20,
        monthToDateCredits: 0,
      }),
    ).toEqual({
      allowed: true,
      requiredCredits: 20,
    });
  });
});

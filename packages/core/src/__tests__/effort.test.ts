import { describe, expect, it } from "vitest";
import { EFFORT_PROFILES } from "../effort.js";
import { CREDIT_MICROS } from "../pricing.js";

describe("effort profiles", () => {
  it("maps resolved efforts to the requested models, reasoning, and budgets", () => {
    expect(EFFORT_PROFILES.low).toMatchObject({
      modelId: "deepseek-v4-flash",
      reasoning: "high",
      minimumCreditMicros: 3n * CREDIT_MICROS,
      maximumCreditMicros: 20n * CREDIT_MICROS,
      outputTokenCap: 2_000,
    });
    expect(EFFORT_PROFILES.medium).toMatchObject({
      modelId: "deepseek-v4-flash",
      reasoning: "max",
      minimumCreditMicros: 6n * CREDIT_MICROS,
      maximumCreditMicros: 50n * CREDIT_MICROS,
      outputTokenCap: 4_000,
    });
    expect(EFFORT_PROFILES.high).toMatchObject({
      modelId: "deepseek-v4-pro",
      reasoning: "high",
      minimumCreditMicros: 15n * CREDIT_MICROS,
      maximumCreditMicros: 120n * CREDIT_MICROS,
      outputTokenCap: 8_000,
    });
    expect(EFFORT_PROFILES.x_high).toMatchObject({
      modelId: "deepseek-v4-pro",
      reasoning: "max",
      minimumCreditMicros: 30n * CREDIT_MICROS,
      maximumCreditMicros: 250n * CREDIT_MICROS,
      outputTokenCap: 16_000,
    });
  });

  it("configures both Auto routers to choose any resolved effort", () => {
    expect(EFFORT_PROFILES.auto).toMatchObject({
      routerModelId: "qwen/qwen3.6-27b",
      routerOutputTokenCap: 256,
      fallbackRouterModelId: "deepseek-v4-flash",
      fallbackRouterOutputTokenCap: 256,
      minimumCreditMicros: 8n * CREDIT_MICROS,
      maximumCreditMicros: 250n * CREDIT_MICROS,
    });
    expect(EFFORT_PROFILES.auto.routerAllowedEfforts).toEqual(["low", "medium", "high", "x_high"]);
  });

  it("keeps behavior guidance distinct", () => {
    const behaviors = Object.values(EFFORT_PROFILES).map((profile) => profile.behavior);
    expect(new Set(behaviors)).toHaveLength(behaviors.length);
  });
});

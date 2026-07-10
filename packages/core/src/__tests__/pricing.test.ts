import { describe, expect, it } from "vitest";
import {
  CREDIT_MICROS,
  CREDIT_RETAIL_USD_NANOS,
  MODEL_TOKEN_PRICING,
  PRICING_REGISTRY,
  PRICING_VERSION,
  RETAIL_MARKUP_BPS,
  TOOL_OPERATION_PRICING,
  USD_NANOS_PER_USD,
  calculateModelUpstreamUsdNanos,
  calculateToolUpstreamUsdNanos,
  creditDecimalToMicrocredits,
  creditMicrocreditsToDisplayNumber,
  formatCreditMicrocredits,
  priceModelTokensMicrocredits,
  priceModelUsageMicrocredits,
  priceToolOperationMicrocredits,
  upstreamUsdNanosToRetailMicrocredits,
} from "../pricing.js";

describe("auditable pricing registry", () => {
  it("keeps conversion and markup constants in the versioned registry", () => {
    expect(PRICING_VERSION).toBe("2026-07-10");
    expect(CREDIT_MICROS).toBe(1_000_000n);
    expect(USD_NANOS_PER_USD).toBe(1_000_000_000n);
    expect(CREDIT_RETAIL_USD_NANOS).toBe(2_000_000n);
    expect(RETAIL_MARKUP_BPS).toBe(20_000n);
    expect(PRICING_REGISTRY.version).toBe(PRICING_VERSION);
    expect(Object.isFrozen(PRICING_REGISTRY)).toBe(true);
    expect(Object.isFrozen(TOOL_OPERATION_PRICING)).toBe(true);
    expect(Object.isFrozen(MODEL_TOKEN_PRICING)).toBe(true);
  });

  it("covers every exposed FetchLayer operation at the same call price", () => {
    const reddit = Object.entries(TOOL_OPERATION_PRICING).filter(([name]) =>
      name.startsWith("fetchlayer.reddit."),
    );
    const x = Object.entries(TOOL_OPERATION_PRICING).filter(([name]) =>
      name.startsWith("fetchlayer.x."),
    );

    expect(reddit).toHaveLength(15);
    expect(x).toHaveLength(10);
    expect(
      [...reddit, ...x].every(([, price]) => price.upstreamUsdNanosPerUnit === 1_990_000n),
    ).toBe(true);
  });

  it("exposes only the publicly verified LinkedIn search operation", () => {
    const linkedinOperations = Object.keys(TOOL_OPERATION_PRICING).filter((name) =>
      name.startsWith("api_direct.linkedin."),
    );

    expect(linkedinOperations).toEqual(["api_direct.linkedin.search-posts"]);
  });
});

describe("fixed-point operation pricing", () => {
  it("rounds every nonzero fractional microcredit charge upward", () => {
    expect(upstreamUsdNanosToRetailMicrocredits(1n)).toBe(1n);
    expect(upstreamUsdNanosToRetailMicrocredits(0n)).toBe(0n);
  });

  it("calculates upstream cost and applies the 2x retail multiplier", () => {
    expect(calculateToolUpstreamUsdNanos("exa.search")).toBe(7_000_000n);
    expect(calculateToolUpstreamUsdNanos("exa.fetch-content", 3n)).toBe(3_000_000n);
    expect(priceToolOperationMicrocredits("exa.search")).toBe(7n * CREDIT_MICROS);
    expect(priceToolOperationMicrocredits("exa.fetch-content", 3n)).toBe(3n * CREDIT_MICROS);
    expect(priceToolOperationMicrocredits("fetchlayer.reddit.search")).toBe(1_990_000n);
    expect(priceToolOperationMicrocredits("api_direct.facebook.search-locations")).toBe(
      4n * CREDIT_MICROS,
    );
  });

  it("charges the deliberate retail floor for free GitHub and Hacker News calls", () => {
    expect(calculateToolUpstreamUsdNanos("github.repository")).toBe(0n);
    expect(priceToolOperationMicrocredits("github.repository")).toBe(250_000n);
    expect(priceToolOperationMicrocredits("hacker_news_algolia.search", 2n)).toBe(500_000n);
  });

  it("prices Voyage by billable tokens and rejects negative units", () => {
    expect(TOOL_OPERATION_PRICING["supadata.youtube.transcript"].unit).toBe("credit");
    expect(calculateToolUpstreamUsdNanos("voyage.rerank", 1_000n)).toBe(50_000n);
    expect(priceToolOperationMicrocredits("voyage.rerank", 1_000n)).toBe(50_000n);
    expect(() => priceToolOperationMicrocredits("exa.search", -1n)).toThrow("non-negative");
  });
});

describe("fixed-point model pricing", () => {
  it("prices provider-reported DeepSeek input and output tokens", () => {
    expect(calculateModelUpstreamUsdNanos("deepseek-v4-flash", 1_000_000n, 1_000_000n)).toEqual({
      inputUsdNanos: 140_000_000n,
      outputUsdNanos: 280_000_000n,
      totalUsdNanos: 420_000_000n,
    });
    expect(priceModelUsageMicrocredits("deepseek-v4-flash", 1_000_000n, 1_000_000n)).toEqual({
      inputCreditMicros: 140n * CREDIT_MICROS,
      outputCreditMicros: 280n * CREDIT_MICROS,
      totalCreditMicros: 420n * CREDIT_MICROS,
    });
  });

  it("includes the Groq Auto-router token rates", () => {
    expect(priceModelUsageMicrocredits("qwen/qwen3.6-27b", 1_000n, 100n)).toEqual({
      inputCreditMicros: 600_000n,
      outputCreditMicros: 300_000n,
      totalCreditMicros: 900_000n,
    });
  });

  it("registers DeepSeek cached-input rates without assigning one to Groq", () => {
    expect(MODEL_TOKEN_PRICING["deepseek-v4-flash"].cachedInputUsdNanosPerMillionTokens).toBe(
      2_800_000n,
    );
    expect(MODEL_TOKEN_PRICING["deepseek-v4-pro"].cachedInputUsdNanosPerMillionTokens).toBe(
      3_625_000n,
    );
    expect(MODEL_TOKEN_PRICING["qwen/qwen3.6-27b"]).not.toHaveProperty(
      "cachedInputUsdNanosPerMillionTokens",
    );
  });

  it("prices cached DeepSeek input separately and returns auditable costs", () => {
    expect(
      calculateModelUpstreamUsdNanos("deepseek-v4-flash", 1_000_000n, 1_000_000n, 250_000n),
    ).toEqual({
      inputUsdNanos: 105_700_000n,
      outputUsdNanos: 280_000_000n,
      totalUsdNanos: 385_700_000n,
      uncachedInputUsdNanos: 105_000_000n,
      cachedInputUsdNanos: 700_000n,
    });
    expect(
      priceModelUsageMicrocredits("deepseek-v4-flash", 1_000_000n, 1_000_000n, 250_000n),
    ).toEqual({
      inputCreditMicros: 105_700_000n,
      outputCreditMicros: 280_000_000n,
      totalCreditMicros: 385_700_000n,
      uncachedInputCreditMicros: 105_000_000n,
      cachedInputCreditMicros: 700_000n,
    });
    expect(priceModelTokensMicrocredits("deepseek-v4-pro", 1_000_000n, 0n, 1_000_000n)).toBe(
      3_625_000n,
    );
  });

  it("keeps models without a cached rate at the normal input rate", () => {
    expect(priceModelUsageMicrocredits("qwen/qwen3.6-27b", 1_000n, 100n, 400n)).toEqual({
      inputCreditMicros: 600_000n,
      outputCreditMicros: 300_000n,
      totalCreditMicros: 900_000n,
      uncachedInputCreditMicros: 360_000n,
      cachedInputCreditMicros: 240_000n,
    });
  });

  it("validates cached input counts", () => {
    expect(() => calculateModelUpstreamUsdNanos("deepseek-v4-flash", 100n, 0n, -1n)).toThrow(
      "non-negative",
    );
    expect(() => calculateModelUpstreamUsdNanos("deepseek-v4-flash", 100n, 0n, 101n)).toThrow(
      "must not exceed input tokens",
    );
  });
});

describe("public credit conversion", () => {
  it("parses at most six decimals into bigint microcredits", () => {
    expect(creditDecimalToMicrocredits("0.000001")).toBe(1n);
    expect(creditDecimalToMicrocredits("12.345678")).toBe(12_345_678n);
    expect(creditDecimalToMicrocredits(250)).toBe(250n * CREDIT_MICROS);
    expect(() => creditDecimalToMicrocredits("1.0000001")).toThrow("at most 6");
    expect(() => creditDecimalToMicrocredits(-1)).toThrow("non-negative");
  });

  it("formats clean display values only at the public boundary", () => {
    expect(formatCreditMicrocredits(12_340_000n)).toBe("12.34");
    expect(formatCreditMicrocredits(5n * CREDIT_MICROS)).toBe("5");
    expect(creditMicrocreditsToDisplayNumber(12_340_000n)).toBe(12.34);
  });
});

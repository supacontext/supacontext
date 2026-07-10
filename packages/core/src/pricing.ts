import type { ProviderName } from "./types.js";

export const PRICING_VERSION = "2026-07-10";
export const CREDIT_MICROS = 1_000_000n;
export const USD_NANOS_PER_USD = 1_000_000_000n;
export const CREDIT_RETAIL_USD_NANOS = 2_000_000n;
export const RETAIL_MARKUP_BPS = 20_000n;

const BASIS_POINTS = 10_000n;
const TOKENS_PER_MILLION = 1_000_000n;

export type ToolPricingUnit = "call" | "page" | "token" | "credit";

export type ToolOperationPrice = Readonly<{
  provider: ProviderName;
  unit: ToolPricingUnit;
  upstreamUsdNanosPerUnit: bigint;
  retailFloorCreditMicrosPerUnit?: bigint;
}>;

function toolPrice(
  provider: ProviderName,
  unit: ToolPricingUnit,
  upstreamUsdNanosPerUnit: bigint,
  retailFloorCreditMicrosPerUnit?: bigint,
): ToolOperationPrice {
  return Object.freeze({
    provider,
    unit,
    upstreamUsdNanosPerUnit,
    ...(retailFloorCreditMicrosPerUnit === undefined ? {} : { retailFloorCreditMicrosPerUnit }),
  });
}

const fetchLayerCallPrice = 1_990_000n;
const freeApiRetailFloor = 250_000n;

export const TOOL_OPERATION_PRICING = Object.freeze({
  "exa.search": toolPrice("exa", "call", 7_000_000n),
  "exa.fetch-content": toolPrice("exa", "page", 1_000_000n),

  "fetchlayer.reddit.search": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.search-comments": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.post": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.community-posts": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.community-details": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.user-profile": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.user-posts": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.user-comments": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.search-communities": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.search-users": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.comment-permalink": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.popular": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.leaderboard": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.resolve-url-type": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.reddit.explore": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.search": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.tweet-detail": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.tweet-replies": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.user-profile-details": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.about-profile": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.user-tweets": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.user-replies": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.following": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.followers": toolPrice("fetchlayer", "call", fetchLayerCallPrice),
  "fetchlayer.x.verified-followers": toolPrice("fetchlayer", "call", fetchLayerCallPrice),

  "api_direct.youtube.search-videos": toolPrice("api_direct", "page", 5_000_000n),
  "api_direct.youtube.search-channels": toolPrice("api_direct", "page", 5_000_000n),
  "api_direct.youtube.channel-details": toolPrice("api_direct", "page", 5_000_000n),
  "api_direct.youtube.video-details": toolPrice("api_direct", "page", 5_000_000n),
  "api_direct.youtube.video-comments": toolPrice("api_direct", "page", 5_000_000n),

  "api_direct.facebook.page-details": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.page-posts": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.page-photos": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.page-videos": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.page-reels": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.page-reviews": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.group-details": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.group-posts": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.search-group-posts": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.post-comments": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.search-posts": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.search-pages": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.search-videos": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.search-events": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.facebook.search-locations": toolPrice("api_direct", "page", 4_000_000n),

  "api_direct.news.news-articles": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.forums.forum-posts": toolPrice("api_direct", "page", 8_000_000n),
  "api_direct.places.places-search": toolPrice("api_direct", "page", 10_000_000n),
  "api_direct.places.place-details": toolPrice("api_direct", "page", 3_000_000n),
  "api_direct.places.place-reviews": toolPrice("api_direct", "page", 10_000_000n),
  "api_direct.places.place-photos": toolPrice("api_direct", "page", 10_000_000n),

  "api_direct.linkedin.search-posts": toolPrice("api_direct", "page", 6_000_000n),

  "supadata.youtube.transcript": toolPrice("supadata", "credit", 10_000_000n),
  "voyage.rerank": toolPrice("voyage", "token", 50n),

  "github.search-repositories": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.search-code": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.search-issues-and-pull-requests": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.search-commits": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.search-users": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.search-topics": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.repository": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.repository-readme": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.repository-contents": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.repository-tree": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.repository-languages": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.repository-topics": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.contributors": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.issues": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.issue-comments": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.pull-requests": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.pull-request": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.pull-request-reviews": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.pull-request-review-comments": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.commits": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.releases": toolPrice("github", "call", 0n, freeApiRetailFloor),
  "github.user": toolPrice("github", "call", 0n, freeApiRetailFloor),

  "hacker_news_firebase.top-stories": toolPrice(
    "hacker_news_firebase",
    "call",
    0n,
    freeApiRetailFloor,
  ),
  "hacker_news_firebase.new-stories": toolPrice(
    "hacker_news_firebase",
    "call",
    0n,
    freeApiRetailFloor,
  ),
  "hacker_news_firebase.best-stories": toolPrice(
    "hacker_news_firebase",
    "call",
    0n,
    freeApiRetailFloor,
  ),
  "hacker_news_firebase.ask-stories": toolPrice(
    "hacker_news_firebase",
    "call",
    0n,
    freeApiRetailFloor,
  ),
  "hacker_news_firebase.show-stories": toolPrice(
    "hacker_news_firebase",
    "call",
    0n,
    freeApiRetailFloor,
  ),
  "hacker_news_firebase.job-stories": toolPrice(
    "hacker_news_firebase",
    "call",
    0n,
    freeApiRetailFloor,
  ),
  "hacker_news_firebase.item": toolPrice("hacker_news_firebase", "call", 0n, freeApiRetailFloor),
  "hacker_news_firebase.user": toolPrice("hacker_news_firebase", "call", 0n, freeApiRetailFloor),
  "hacker_news_firebase.updates": toolPrice("hacker_news_firebase", "call", 0n, freeApiRetailFloor),
  "hacker_news_algolia.search": toolPrice("hacker_news_algolia", "call", 0n, freeApiRetailFloor),
  "hacker_news_algolia.search-by-date": toolPrice(
    "hacker_news_algolia",
    "call",
    0n,
    freeApiRetailFloor,
  ),
  "hacker_news_algolia.item": toolPrice("hacker_news_algolia", "call", 0n, freeApiRetailFloor),
  "hacker_news_algolia.user": toolPrice("hacker_news_algolia", "call", 0n, freeApiRetailFloor),
});

export type ToolOperation = keyof typeof TOOL_OPERATION_PRICING;

export const MODEL_IDS = ["deepseek-v4-flash", "deepseek-v4-pro", "qwen/qwen3.6-27b"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export type ModelTokenPrice = Readonly<{
  provider: "deepseek" | "groq";
  inputUsdNanosPerMillionTokens: bigint;
  cachedInputUsdNanosPerMillionTokens?: bigint;
  outputUsdNanosPerMillionTokens: bigint;
}>;

export const MODEL_TOKEN_PRICING = Object.freeze({
  "deepseek-v4-flash": Object.freeze({
    provider: "deepseek",
    inputUsdNanosPerMillionTokens: 140_000_000n,
    cachedInputUsdNanosPerMillionTokens: 2_800_000n,
    outputUsdNanosPerMillionTokens: 280_000_000n,
  }),
  "deepseek-v4-pro": Object.freeze({
    provider: "deepseek",
    inputUsdNanosPerMillionTokens: 435_000_000n,
    cachedInputUsdNanosPerMillionTokens: 3_625_000n,
    outputUsdNanosPerMillionTokens: 870_000_000n,
  }),
  "qwen/qwen3.6-27b": Object.freeze({
    provider: "groq",
    inputUsdNanosPerMillionTokens: 600_000_000n,
    outputUsdNanosPerMillionTokens: 3_000_000_000n,
  }),
}) satisfies Readonly<Record<ModelId, ModelTokenPrice>>;

export const PRICING_REGISTRY = Object.freeze({
  version: PRICING_VERSION,
  creditMicrosPerCredit: CREDIT_MICROS,
  usdNanosPerUsd: USD_NANOS_PER_USD,
  creditRetailUsdNanos: CREDIT_RETAIL_USD_NANOS,
  retailMarkupBps: RETAIL_MARKUP_BPS,
  toolOperations: TOOL_OPERATION_PRICING,
  models: MODEL_TOKEN_PRICING,
});

function assertNonNegative(value: bigint, name: string): void {
  if (value < 0n) {
    throw new Error(`${name} must be non-negative.`);
  }
}

function divideCeiling(numerator: bigint, denominator: bigint): bigint {
  if (numerator === 0n) {
    return 0n;
  }

  return (numerator + denominator - 1n) / denominator;
}

export function upstreamUsdNanosToRetailMicrocredits(upstreamUsdNanos: bigint): bigint {
  assertNonNegative(upstreamUsdNanos, "Upstream USD nanos");

  return divideCeiling(
    upstreamUsdNanos * RETAIL_MARKUP_BPS * CREDIT_MICROS,
    BASIS_POINTS * CREDIT_RETAIL_USD_NANOS,
  );
}

export function calculateToolUpstreamUsdNanos(operation: ToolOperation, units = 1n): bigint {
  assertNonNegative(units, "Tool operation units");
  return TOOL_OPERATION_PRICING[operation].upstreamUsdNanosPerUnit * units;
}

export function priceToolOperationMicrocredits(operation: ToolOperation, units = 1n): bigint {
  assertNonNegative(units, "Tool operation units");

  const price = TOOL_OPERATION_PRICING[operation];
  const calculated = upstreamUsdNanosToRetailMicrocredits(
    calculateToolUpstreamUsdNanos(operation, units),
  );
  const floor = (price.retailFloorCreditMicrosPerUnit ?? 0n) * units;

  return calculated > floor ? calculated : floor;
}

function tokenUpstreamUsdNanos(tokenCount: bigint, usdNanosPerMillionTokens: bigint): bigint {
  assertNonNegative(tokenCount, "Token count");
  return divideCeiling(tokenCount * usdNanosPerMillionTokens, TOKENS_PER_MILLION);
}

export type ModelUpstreamCost = {
  inputUsdNanos: bigint;
  outputUsdNanos: bigint;
  totalUsdNanos: bigint;
  uncachedInputUsdNanos?: bigint;
  cachedInputUsdNanos?: bigint;
};

export function calculateModelUpstreamUsdNanos(
  model: ModelId,
  inputTokens: bigint,
  outputTokens: bigint,
  cachedInputTokens?: bigint,
): ModelUpstreamCost {
  const price: ModelTokenPrice = MODEL_TOKEN_PRICING[model];
  assertNonNegative(inputTokens, "Input tokens");
  assertNonNegative(outputTokens, "Output tokens");

  if (cachedInputTokens === undefined) {
    const inputUsdNanos = tokenUpstreamUsdNanos(inputTokens, price.inputUsdNanosPerMillionTokens);
    const outputUsdNanos = tokenUpstreamUsdNanos(
      outputTokens,
      price.outputUsdNanosPerMillionTokens,
    );

    return {
      inputUsdNanos,
      outputUsdNanos,
      totalUsdNanos: inputUsdNanos + outputUsdNanos,
    };
  }

  assertNonNegative(cachedInputTokens, "Cached input tokens");
  if (cachedInputTokens > inputTokens) {
    throw new Error("Cached input tokens must not exceed input tokens.");
  }

  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const uncachedInputUsdNanos = tokenUpstreamUsdNanos(
    uncachedInputTokens,
    price.inputUsdNanosPerMillionTokens,
  );
  const cachedInputUsdNanos = tokenUpstreamUsdNanos(
    cachedInputTokens,
    price.cachedInputUsdNanosPerMillionTokens ?? price.inputUsdNanosPerMillionTokens,
  );
  const inputUsdNanos = uncachedInputUsdNanos + cachedInputUsdNanos;
  const outputUsdNanos = tokenUpstreamUsdNanos(outputTokens, price.outputUsdNanosPerMillionTokens);

  return {
    inputUsdNanos,
    outputUsdNanos,
    totalUsdNanos: inputUsdNanos + outputUsdNanos,
    uncachedInputUsdNanos,
    cachedInputUsdNanos,
  };
}

export type ModelUsagePrice = {
  inputCreditMicros: bigint;
  outputCreditMicros: bigint;
  totalCreditMicros: bigint;
  uncachedInputCreditMicros?: bigint;
  cachedInputCreditMicros?: bigint;
};

export function priceModelUsageMicrocredits(
  model: ModelId,
  inputTokens: bigint,
  outputTokens: bigint,
  cachedInputTokens?: bigint,
): ModelUsagePrice {
  const upstream = calculateModelUpstreamUsdNanos(
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
  );

  if (upstream.uncachedInputUsdNanos !== undefined && upstream.cachedInputUsdNanos !== undefined) {
    const uncachedInputCreditMicros = upstreamUsdNanosToRetailMicrocredits(
      upstream.uncachedInputUsdNanos,
    );
    const cachedInputCreditMicros = upstreamUsdNanosToRetailMicrocredits(
      upstream.cachedInputUsdNanos,
    );
    const inputCreditMicros = uncachedInputCreditMicros + cachedInputCreditMicros;
    const outputCreditMicros = upstreamUsdNanosToRetailMicrocredits(upstream.outputUsdNanos);

    return {
      inputCreditMicros,
      outputCreditMicros,
      totalCreditMicros: inputCreditMicros + outputCreditMicros,
      uncachedInputCreditMicros,
      cachedInputCreditMicros,
    };
  }

  const inputCreditMicros = upstreamUsdNanosToRetailMicrocredits(upstream.inputUsdNanos);
  const outputCreditMicros = upstreamUsdNanosToRetailMicrocredits(upstream.outputUsdNanos);

  return {
    inputCreditMicros,
    outputCreditMicros,
    totalCreditMicros: inputCreditMicros + outputCreditMicros,
  };
}

export function priceModelTokensMicrocredits(
  model: ModelId,
  inputTokens: bigint,
  outputTokens: bigint,
  cachedInputTokens?: bigint,
): bigint {
  return priceModelUsageMicrocredits(model, inputTokens, outputTokens, cachedInputTokens)
    .totalCreditMicros;
}

function creditDecimalText(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Credits must be a finite decimal value.");
    }

    return value.toString();
  }

  return value.trim();
}

export function creditDecimalToMicrocredits(value: string | number): bigint {
  const text = creditDecimalText(value);
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(text);

  if (!match) {
    throw new Error("Credits must be a non-negative decimal with at most 6 decimal places.");
  }

  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(6, "0") || "0");

  return whole * CREDIT_MICROS + fraction;
}

export function formatCreditMicrocredits(creditMicros: bigint): string {
  assertNonNegative(creditMicros, "Credit microcredits");

  const whole = creditMicros / CREDIT_MICROS;
  const fraction = String(creditMicros % CREDIT_MICROS)
    .padStart(6, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function creditMicrocreditsToDisplayNumber(creditMicros: bigint): number {
  return Number(formatCreditMicrocredits(creditMicros));
}

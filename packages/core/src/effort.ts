import { CREDIT_MICROS, type ModelId } from "./pricing.js";
import { RESOLVED_EFFORTS, type ContextEffort, type ResolvedEffort } from "./types.js";

export type DeepSeekReasoningEffort = "high" | "max";

export type ResolvedEffortProfile = Readonly<{
  effort: ResolvedEffort;
  kind: "research";
  modelProvider: "deepseek";
  modelId: Extract<ModelId, "deepseek-v4-flash" | "deepseek-v4-pro">;
  reasoning: DeepSeekReasoningEffort;
  outputTokenCap: number;
  minimumCredits: bigint;
  maximumCredits: bigint;
  minimumCreditMicros: bigint;
  maximumCreditMicros: bigint;
  behavior: string;
}>;

export type AutoEffortProfile = Readonly<{
  effort: "auto";
  kind: "router";
  routerProvider: "groq";
  routerModelId: Extract<ModelId, "qwen/qwen3.6-27b">;
  routerOutputTokenCap: number;
  fallbackRouterProvider: "deepseek";
  fallbackRouterModelId: Extract<ModelId, "deepseek-v4-flash">;
  fallbackRouterReasoning: "high";
  fallbackRouterOutputTokenCap: number;
  routerAllowedEfforts: readonly ResolvedEffort[];
  minimumCredits: bigint;
  maximumCredits: bigint;
  minimumCreditMicros: bigint;
  maximumCreditMicros: bigint;
  behavior: string;
}>;

export type EffortProfile = ResolvedEffortProfile | AutoEffortProfile;

function researchProfile(input: {
  effort: ResolvedEffort;
  modelId: ResolvedEffortProfile["modelId"];
  reasoning: DeepSeekReasoningEffort;
  outputTokenCap: number;
  minimumCredits: bigint;
  maximumCredits: bigint;
  behavior: string;
}): ResolvedEffortProfile {
  return Object.freeze({
    ...input,
    kind: "research" as const,
    modelProvider: "deepseek" as const,
    minimumCreditMicros: input.minimumCredits * CREDIT_MICROS,
    maximumCreditMicros: input.maximumCredits * CREDIT_MICROS,
  });
}

export const EFFORT_PROFILES = Object.freeze({
  low: researchProfile({
    effort: "low",
    modelId: "deepseek-v4-flash",
    reasoning: "high",
    outputTokenCap: 2_000,
    minimumCredits: 3n,
    maximumCredits: 20n,
    behavior: "Focused research with a small, high-signal evidence set and concise synthesis.",
  }),
  medium: researchProfile({
    effort: "medium",
    modelId: "deepseek-v4-flash",
    reasoning: "max",
    outputTokenCap: 4_000,
    minimumCredits: 6n,
    maximumCredits: 50n,
    behavior: "Balanced multi-source research with deliberate verification and compact synthesis.",
  }),
  high: researchProfile({
    effort: "high",
    modelId: "deepseek-v4-pro",
    reasoning: "high",
    outputTokenCap: 8_000,
    minimumCredits: 15n,
    maximumCredits: 120n,
    behavior: "Broad research that cross-checks important claims across several strong sources.",
  }),
  x_high: researchProfile({
    effort: "x_high",
    modelId: "deepseek-v4-pro",
    reasoning: "max",
    outputTokenCap: 16_000,
    minimumCredits: 30n,
    maximumCredits: 250n,
    behavior: "Exhaustive research that resolves conflicts, pursues gaps, and maximizes coverage.",
  }),
  auto: Object.freeze({
    effort: "auto" as const,
    kind: "router" as const,
    routerProvider: "groq" as const,
    routerModelId: "qwen/qwen3.6-27b" as const,
    routerOutputTokenCap: 256,
    fallbackRouterProvider: "deepseek" as const,
    fallbackRouterModelId: "deepseek-v4-flash" as const,
    fallbackRouterReasoning: "high" as const,
    fallbackRouterOutputTokenCap: 256,
    routerAllowedEfforts: Object.freeze([...RESOLVED_EFFORTS]),
    minimumCredits: 8n,
    maximumCredits: 250n,
    minimumCreditMicros: 8n * CREDIT_MICROS,
    maximumCreditMicros: 250n * CREDIT_MICROS,
    behavior: "Classify the request into the least expensive effort that can answer it reliably.",
  }),
}) satisfies Readonly<Record<ContextEffort, EffortProfile>>;

export function getEffortProfile(effort: ContextEffort): EffortProfile {
  return EFFORT_PROFILES[effort];
}

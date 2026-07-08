import type { ContextDepth } from "@supacontext/core";
import type { AgentEvidenceInput, DeepSeekReasoningLevel } from "@supacontext/providers";

export type PromptTierConfig = {
  model: string;
  reasoning: DeepSeekReasoningLevel;
  evidenceLimit: number;
  directTokenLimit: number;
  chunkTokenLimit: number;
  prefilterLimit: number;
  rerankThreshold: number;
};

export const PROMPT_TIER_CONFIG = {
  fast: {
    model: "deepseek-v4-flash",
    reasoning: "low",
    evidenceLimit: 4,
    directTokenLimit: 900,
    chunkTokenLimit: 550,
    prefilterLimit: 14,
    rerankThreshold: 10,
  },
  standard: {
    model: "deepseek-v4-flash",
    reasoning: "high",
    evidenceLimit: 7,
    directTokenLimit: 1_200,
    chunkTokenLimit: 700,
    prefilterLimit: 24,
    rerankThreshold: 14,
  },
  thorough: {
    model: "deepseek-v4-pro",
    reasoning: "medium",
    evidenceLimit: 12,
    directTokenLimit: 1_500,
    chunkTokenLimit: 850,
    prefilterLimit: 40,
    rerankThreshold: 18,
  },
  deep: {
    model: "deepseek-v4-pro",
    reasoning: "high",
    evidenceLimit: 18,
    directTokenLimit: 1_800,
    chunkTokenLimit: 1_000,
    prefilterLimit: 64,
    rerankThreshold: 22,
  },
} as const satisfies Record<ContextDepth, PromptTierConfig>;

export type ResearchPromptInput = {
  query: string;
  depth: ContextDepth;
  evidence: AgentEvidenceInput[];
  gaps: string[];
};

export type ResearchPrompt = {
  systemPrompt: string;
  userPrompt: string;
  config: PromptTierConfig;
};

export function loadResearchPromptTemplate(): string {
  // Product prompt tuning is intentionally deferred. Keep this concise default easy to replace.
  return [
    "You are Supacontext's research compiler.",
    "Return compact JSON only.",
    "Use only the supplied normalized evidence and cite source IDs exactly.",
    "Do not include raw provider payloads, raw HTML, or long transcripts.",
  ].join("\n");
}

export function buildResearchPrompt(input: ResearchPromptInput): ResearchPrompt {
  const config = PROMPT_TIER_CONFIG[input.depth];
  const evidenceBlock = input.evidence.map(formatEvidence).join("\n\n");
  const gapBlock =
    input.gaps.length > 0 ? input.gaps.map((gap) => `- ${gap}`).join("\n") : "- none";

  return {
    systemPrompt: loadResearchPromptTemplate(),
    userPrompt: [
      `Query: ${input.query}`,
      `Depth: ${input.depth}`,
      "Required JSON shape:",
      '{"answer": string, "context_pack": [{"claim": string, "confidence": "low|medium|high", "supporting_sources": string[]}], "sources": [], "gaps": string[]}',
      "Evidence:",
      evidenceBlock || "No evidence was found.",
      "Known gaps:",
      gapBlock,
    ].join("\n\n"),
    config,
  };
}

function formatEvidence(evidence: AgentEvidenceInput): string {
  const timing =
    evidence.startSeconds === undefined
      ? ""
      : `\nTimestamp: ${evidence.startSeconds}s${evidence.endSeconds === undefined || evidence.endSeconds === null ? "" : `-${evidence.endSeconds}s`}`;

  return [
    `Source ID: ${evidence.sourceId}`,
    `Platform: ${evidence.platform}`,
    `Title: ${evidence.title}`,
    `URL: ${evidence.url}`,
    `Published: ${evidence.publishedAt ?? "unknown"}`,
    `${timing}`,
    `Excerpt: ${evidence.excerpt}`,
  ].join("\n");
}

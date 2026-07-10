import { PLATFORMS, type ContextDepth, type Platform, type PlatformMode } from "@supacontext/core";
import {
  NormalizedProviderError,
  type AgentEvidenceInput,
  type NormalizedSourceCandidate,
  type ProviderClients,
  type RerankResult,
} from "@supacontext/providers";
import { z } from "zod";
import { ResearchBudget, RESEARCH_UNIT_COST, type ResearchAction } from "./budget.js";
import {
  chunkSources,
  cleanContent,
  estimateTokens,
  normalizeCandidates,
  prefilterChunks,
  toPublicSources,
  type EvidenceChunk,
  type NormalizedEvidenceSource,
} from "./content.js";
import { buildResearchPrompt, PROMPT_TIER_CONFIG } from "./prompts.js";
import {
  buildUsage,
  cleanPublicText,
  validatePublicResult,
  type ContextPackItem,
  type PublicContextResult,
  type PublicSource,
} from "./public-result.js";

export type PipelineRequest = {
  id: string;
  workspaceId: string;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  platformMode: PlatformMode;
  creditsCharged: number;
};

export type PipelineRunResult = {
  result: PublicContextResult;
  diagnostics: {
    researchUnitsSpent: number;
    researchUnitLimit: number;
  };
};

type RetrievalLimits = {
  searchLimit: number;
  fetchLimit: number;
};

const retrievalLimits = {
  fast: {
    searchLimit: 3,
    fetchLimit: 1,
  },
  standard: {
    searchLimit: 5,
    fetchLimit: 2,
  },
  thorough: {
    searchLimit: 8,
    fetchLimit: 4,
  },
  deep: {
    searchLimit: 12,
    fetchLimit: 6,
  },
} as const satisfies Record<ContextDepth, RetrievalLimits>;

const confidenceValues = new Set(["low", "medium", "high"]);

export class ResearchPipeline {
  constructor(private readonly providers: ProviderClients) {}

  async run(request: PipelineRequest): Promise<PipelineRunResult> {
    const budget = new ResearchBudget(request.depth);
    const gaps: string[] = [];
    const candidates = await this.collectCandidates(request, budget, gaps);
    const normalizedSources = normalizeCandidates(candidates);
    const selectedChunks = await this.selectEvidenceChunks(
      request,
      normalizedSources,
      budget,
      gaps,
    );
    const usedSourceIds = new Set(selectedChunks.map((chunk) => chunk.sourceId));
    const usedSources = normalizedSources.filter((source) => usedSourceIds.has(source.sourceId));
    const publicSources = toPublicSources(usedSources);

    this.addEvidenceGaps(request, normalizedSources, usedSources, budget, gaps);

    const result = await this.synthesizeResult({
      request,
      chunks: selectedChunks,
      sources: publicSources,
      sourcesConsidered: normalizedSources.length,
      gaps,
      budget,
    });

    return {
      result,
      diagnostics: {
        researchUnitsSpent: budget.spent,
        researchUnitLimit: budget.limit,
      },
    };
  }

  private async collectCandidates(
    request: PipelineRequest,
    budget: ResearchBudget,
    gaps: string[],
  ): Promise<NormalizedSourceCandidate[]> {
    const limits = retrievalLimits[request.depth];
    const candidates: NormalizedSourceCandidate[] = [];
    const platforms = orderPlatforms(request);
    const reserve = RESEARCH_UNIT_COST.agent_synthesis;

    for (const platform of platforms) {
      if (
        request.platformMode === "auto" &&
        candidates.length >= PROMPT_TIER_CONFIG[request.depth].evidenceLimit * 2
      ) {
        break;
      }

      const beforeCount = candidates.length;

      if (platform === "web") {
        await this.collectWeb(request, budget, limits, gaps, reserve, candidates);
      } else if (platform === "reddit") {
        await this.collectReddit(request, budget, limits, gaps, reserve, candidates);
      } else if (platform === "x") {
        await this.collectX(request, budget, limits, gaps, reserve, candidates);
      } else if (platform === "youtube") {
        await this.collectYoutube(request, budget, limits, gaps, reserve, candidates);
      }

      if (candidates.length === beforeCount) {
        gaps.push(`${platform} did not return usable evidence within this request.`);
      }
    }

    return candidates;
  }

  private async collectWeb(
    request: PipelineRequest,
    budget: ResearchBudget,
    limits: RetrievalLimits,
    gaps: string[],
    reserve: number,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    if (!spendOrGap(budget, "web_search", reserve, gaps)) {
      return;
    }

    try {
      const results = await this.providers.exa.search({
        requestId: request.id,
        query: request.query,
        limit: limits.searchLimit,
        platform: "web",
      });
      candidates.push(...results);

      const shortResults = results.filter((candidate) => estimateTokens(candidate.content) < 350);

      if (shortResults.length > 0 && spendOrGap(budget, "web_fetch", reserve, gaps)) {
        const fetched = await this.providers.exa.fetchContent({
          requestId: request.id,
          candidates: shortResults,
          limit: limits.fetchLimit,
        });
        candidates.push(...fetched);
      }
    } catch (error) {
      gaps.push(providerGap("web", error));
    }
  }

  private async collectReddit(
    request: PipelineRequest,
    budget: ResearchBudget,
    limits: RetrievalLimits,
    gaps: string[],
    reserve: number,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    if (!spendOrGap(budget, "reddit_search", reserve, gaps)) {
      return;
    }

    try {
      const results = await this.providers.fetchlayer.searchReddit({
        requestId: request.id,
        query: request.query,
        limit: limits.searchLimit,
      });
      candidates.push(...results);

      for (const candidate of results.slice(0, limits.fetchLimit)) {
        if (!spendOrGap(budget, "reddit_fetch_thread", reserve, gaps)) {
          break;
        }

        candidates.push(
          await this.providers.fetchlayer.fetchRedditThread({
            requestId: request.id,
            candidate,
          }),
        );
      }
    } catch (error) {
      gaps.push(providerGap("reddit", error));
    }
  }

  private async collectX(
    request: PipelineRequest,
    budget: ResearchBudget,
    limits: RetrievalLimits,
    gaps: string[],
    reserve: number,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    if (!spendOrGap(budget, "x_search", reserve, gaps)) {
      return;
    }

    try {
      const results = await this.providers.xquik.searchX({
        requestId: request.id,
        query: request.query,
        limit: limits.searchLimit,
      });
      candidates.push(...results);

      for (const candidate of results.slice(0, limits.fetchLimit)) {
        if (!spendOrGap(budget, "x_fetch", reserve, gaps)) {
          break;
        }

        candidates.push(
          await this.providers.xquik.fetchXPost({
            requestId: request.id,
            candidate,
          }),
        );
      }
    } catch (error) {
      gaps.push(providerGap("x", error));
    }
  }

  private async collectYoutube(
    request: PipelineRequest,
    budget: ResearchBudget,
    limits: RetrievalLimits,
    gaps: string[],
    reserve: number,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    if (!spendOrGap(budget, "web_search", reserve, gaps)) {
      return;
    }

    try {
      const videos = await this.providers.exa.search({
        requestId: request.id,
        query: request.query,
        limit: limits.searchLimit,
        platform: "youtube",
      });

      for (const video of videos.slice(0, limits.fetchLimit)) {
        if (!spendOrGap(budget, "youtube_transcript_fetch", reserve, gaps)) {
          break;
        }

        candidates.push(
          await this.providers.supadata.fetchTranscript({
            requestId: request.id,
            url: video.url,
            title: video.title,
          }),
        );
      }
    } catch (error) {
      gaps.push(providerGap("youtube", error));
    }
  }

  private async selectEvidenceChunks(
    request: PipelineRequest,
    sources: NormalizedEvidenceSource[],
    budget: ResearchBudget,
    gaps: string[],
  ): Promise<EvidenceChunk[]> {
    const config = PROMPT_TIER_CONFIG[request.depth];
    const chunks = chunkSources(sources, {
      directTokenLimit: config.directTokenLimit,
      chunkTokenLimit: config.chunkTokenLimit,
    });

    if (chunks.length === 0) {
      return [];
    }

    const prefiltered = prefilterChunks(request.query, chunks, config.prefilterLimit);

    if (prefiltered.length < chunks.length) {
      gaps.push("Some large sources were keyword-prefiltered before synthesis.");
    }

    if (prefiltered.length < config.rerankThreshold) {
      return prefiltered.slice(0, config.evidenceLimit);
    }

    if (!budget.trySpend("rerank_pass", RESEARCH_UNIT_COST.agent_synthesis)) {
      gaps.push("Depth budget limited reranking; keyword-prefiltered evidence was used.");

      return prefiltered.slice(0, config.evidenceLimit);
    }

    try {
      const rankings = await this.providers.voyage.rerank({
        requestId: request.id,
        query: request.query,
        chunks: prefiltered.map((chunk) => ({
          id: chunk.id,
          text: chunk.text,
        })),
        topK: config.evidenceLimit,
      });

      return applyRerank(prefiltered, rankings, config.evidenceLimit);
    } catch (error) {
      gaps.push(providerGap("reranker", error));

      return prefiltered.slice(0, config.evidenceLimit);
    }
  }

  private addEvidenceGaps(
    request: PipelineRequest,
    consideredSources: NormalizedEvidenceSource[],
    usedSources: NormalizedEvidenceSource[],
    budget: ResearchBudget,
    gaps: string[],
  ): void {
    if (consideredSources.length === 0) {
      gaps.push("No useful public evidence was found within the selected platforms and depth.");
    }

    if (request.platformMode === "manual" && request.platforms.length < PLATFORMS.length) {
      gaps.push(`Evidence was restricted to requested platforms: ${request.platforms.join(", ")}.`);
    }

    if (
      usedSources.length > 0 &&
      usedSources.every((source) => source.candidate.publishedAt === null)
    ) {
      gaps.push("Selected sources did not expose publication dates.");
    }

    if (needsFreshEvidence(request.query) && !hasFreshSource(usedSources)) {
      gaps.push("The query appears freshness-sensitive, but no recent dated source was selected.");
    }

    if (budget.remaining < RESEARCH_UNIT_COST.rerank_pass) {
      gaps.push("Depth budget limited additional retrieval.");
    }
  }

  private async synthesizeResult(input: {
    request: PipelineRequest;
    chunks: EvidenceChunk[];
    sources: PublicSource[];
    sourcesConsidered: number;
    gaps: string[];
    budget: ResearchBudget;
  }): Promise<PublicContextResult> {
    if (!input.budget.trySpend("agent_synthesis")) {
      throw new Error("Research unit budget did not leave room for synthesis.");
    }

    const evidence = input.chunks.map(toAgentEvidence);
    const prompt = buildResearchPrompt({
      query: input.request.query,
      depth: input.request.depth,
      evidence,
      gaps: uniqueStrings(input.gaps),
    });
    const first = await this.providers.deepseek.research({
      requestId: input.request.id,
      query: input.request.query,
      depth: input.request.depth,
      model: prompt.config.model,
      reasoning: prompt.config.reasoning,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      evidence,
    });
    const firstParse = parseAndBuildResult(first.content, input);

    if (firstParse.success) {
      return firstParse.result;
    }

    const repaired = await this.providers.deepseek.repairJson({
      requestId: input.request.id,
      query: input.request.query,
      depth: input.request.depth,
      model: prompt.config.model,
      reasoning: prompt.config.reasoning,
      systemPrompt: prompt.systemPrompt,
      evidence,
      invalidJson: first.content,
      validationError: firstParse.error,
    });
    const repairedParse = parseAndBuildResult(repaired.content, input);

    if (!repairedParse.success) {
      throw new Error(`Model returned invalid JSON after repair: ${repairedParse.error}`);
    }

    return repairedParse.result;
  }
}

function orderPlatforms(request: PipelineRequest): Platform[] {
  if (request.platformMode === "manual") {
    return request.platforms;
  }

  const defaultOrder: Platform[] = ["web", "reddit", "x", "youtube"];
  const lowerQuery = request.query.toLowerCase();

  if (lowerQuery.includes("youtube") || lowerQuery.includes("video")) {
    const youtubeOrder: Platform[] = ["youtube", "web", "reddit", "x"];

    return youtubeOrder.filter((platform) => request.platforms.includes(platform));
  }

  if (lowerQuery.includes("reddit")) {
    const redditOrder: Platform[] = ["reddit", "web", "x", "youtube"];

    return redditOrder.filter((platform) => request.platforms.includes(platform));
  }

  return defaultOrder.filter((platform) => request.platforms.includes(platform));
}

function spendOrGap(
  budget: ResearchBudget,
  action: ResearchAction,
  reserve: number,
  gaps: string[],
): boolean {
  if (budget.trySpend(action, reserve)) {
    return true;
  }

  gaps.push("Depth budget limited additional retrieval.");

  return false;
}

function providerGap(platform: string, error: unknown): string {
  if (error instanceof NormalizedProviderError) {
    return `${platform} provider was unavailable or returned no normalized evidence.`;
  }

  return `${platform} retrieval failed before evidence could be normalized.`;
}

function applyRerank(
  chunks: EvidenceChunk[],
  rankings: RerankResult[],
  limit: number,
): EvidenceChunk[] {
  if (rankings.length === 0) {
    return chunks.slice(0, limit);
  }

  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  return rankings
    .sort((left, right) => right.score - left.score)
    .map((ranking) => chunkById.get(ranking.id))
    .filter((chunk): chunk is EvidenceChunk => Boolean(chunk))
    .slice(0, limit);
}

function toAgentEvidence(chunk: EvidenceChunk): AgentEvidenceInput {
  return {
    sourceId: chunk.sourceId,
    platform: chunk.platform,
    title: chunk.title,
    url: chunk.url,
    publishedAt: chunk.publishedAt,
    excerpt: cleanContent(chunk.text).slice(0, 2_200),
    ...(chunk.startSeconds === undefined ? {} : { startSeconds: chunk.startSeconds }),
    ...(chunk.endSeconds === undefined ? {} : { endSeconds: chunk.endSeconds }),
  };
}

type ParseResult =
  | {
      success: true;
      result: PublicContextResult;
    }
  | {
      success: false;
      error: string;
    };

function parseAndBuildResult(
  content: string,
  input: {
    request: PipelineRequest;
    chunks: EvidenceChunk[];
    sources: PublicSource[];
    sourcesConsidered: number;
    gaps: string[];
  },
): ParseResult {
  const parsed = parseJsonObject(content);

  if (!parsed.success) {
    return parsed;
  }

  try {
    const result = buildFinalResult(parsed.value, input);

    return {
      success: true,
      result: validatePublicResult(result),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown validation error.",
    };
  }
}

function parseJsonObject(content: string):
  | {
      success: true;
      value: unknown;
    }
  | {
      success: false;
      error: string;
    } {
  try {
    return {
      success: true,
      value: JSON.parse(content) as unknown,
    };
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");

    if (start === -1 || end <= start) {
      return {
        success: false,
        error: "Model output did not contain a JSON object.",
      };
    }

    try {
      return {
        success: true,
        value: JSON.parse(content.slice(start, end + 1)) as unknown,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Model output was invalid JSON.",
      };
    }
  }
}

function buildFinalResult(
  modelValue: unknown,
  input: {
    request: PipelineRequest;
    chunks: EvidenceChunk[];
    sources: PublicSource[];
    sourcesConsidered: number;
    gaps: string[];
  },
): PublicContextResult {
  const record =
    modelValue && typeof modelValue === "object" && !Array.isArray(modelValue)
      ? (modelValue as Record<string, unknown>)
      : {};
  const sourceIds = new Set(input.sources.map((source) => source.id));
  const contextPack = coerceContextPack(record.context_pack, sourceIds, input.chunks);
  const modelGaps = Array.isArray(record.gaps)
    ? record.gaps.map((gap) => cleanPublicText(gap, 500)).filter(Boolean)
    : [];
  const answer =
    cleanPublicText(record.answer, 8_000) || fallbackAnswer(input.request.query, input.sources);
  const platformsUsed = uniquePlatforms(
    input.sources.map((source) => source.platform),
    input.request.platforms,
  );

  return {
    answer,
    context_pack: contextPack,
    sources: input.sources,
    gaps: uniqueStrings([...input.gaps, ...modelGaps])
      .map((gap) => cleanPublicText(gap, 500))
      .filter(Boolean),
    usage: buildUsage({
      creditsCharged: input.request.creditsCharged,
      depth: input.request.depth,
      platformsUsed,
      sourcesConsidered: input.sourcesConsidered,
      sourcesUsed: input.sources.length,
    }),
  };
}

function coerceContextPack(
  value: unknown,
  sourceIds: Set<string>,
  chunks: EvidenceChunk[],
): ContextPackItem[] {
  const fallbackSourceId = chunks[0]?.sourceId;
  const items = Array.isArray(value) ? value : [];
  const packed = items
    .map((item) => {
      const record =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {};
      const supportingSources = Array.isArray(record.supporting_sources)
        ? record.supporting_sources.filter(
            (sourceId): sourceId is string =>
              typeof sourceId === "string" && sourceIds.has(sourceId),
          )
        : [];
      const confidence =
        typeof record.confidence === "string" && confidenceValues.has(record.confidence)
          ? record.confidence
          : "medium";
      const claim = cleanPublicText(record.claim, 1_200);
      const finalSources =
        supportingSources.length > 0
          ? supportingSources
          : fallbackSourceId && sourceIds.has(fallbackSourceId)
            ? [fallbackSourceId]
            : [];

      if (!claim || finalSources.length === 0) {
        return null;
      }

      return {
        claim,
        confidence: confidence as ContextPackItem["confidence"],
        supporting_sources: finalSources,
      };
    })
    .filter((item): item is ContextPackItem => Boolean(item));

  if (packed.length > 0) {
    return packed;
  }

  return chunks.slice(0, 3).map((chunk) => ({
    claim: cleanPublicText(`Relevant evidence from ${chunk.title}.`, 1_200),
    confidence: "medium",
    supporting_sources: [chunk.sourceId],
  }));
}

function fallbackAnswer(query: string, sources: PublicSource[]): string {
  if (sources.length === 0) {
    return `No supported answer could be generated for "${query}" from the selected public sources.`;
  }

  return `Compiled context for "${query}" from ${sources.length} normalized public source${sources.length === 1 ? "" : "s"}.`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniquePlatforms(values: Platform[], fallback: Platform[]): Platform[] {
  const unique = [...new Set(values)];

  return unique.length > 0 ? unique : fallback;
}

function needsFreshEvidence(query: string): boolean {
  return /\b(latest|recent|today|current|now|new|2026)\b/i.test(query);
}

function hasFreshSource(sources: NormalizedEvidenceSource[]): boolean {
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ninetyDaysMs;

  return sources.some((source) => {
    if (!source.candidate.publishedAt) {
      return false;
    }

    const time = Date.parse(source.candidate.publishedAt);

    return Number.isFinite(time) && time >= cutoff;
  });
}

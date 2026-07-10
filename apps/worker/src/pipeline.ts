import { loadPlatformSkill, selectPlatformsForQuery } from "@supacontext/agent";
import {
  EFFORT_PROFILES,
  TOOL_OPERATION_PRICING,
  creditMicrocreditsToDisplayNumber,
  formatCreditMicrocredits,
  priceToolOperationMicrocredits,
  type ContextEffort,
  type ModelId,
  type Platform,
  type PlatformMode,
  type ProviderName,
  type ResolvedEffort,
  type ToolOperation,
} from "@supacontext/core";
import {
  NormalizedProviderError,
  type AgentEvidenceInput,
  type NormalizedSourceCandidate,
  type ProviderClients,
  type ProviderResult,
  type RerankResult,
} from "@supacontext/providers";
import { z } from "zod";
import {
  BudgetExhaustedError,
  type CostAuthorization,
  ResearchBudget,
  affordableOutputTokens,
  estimateMaximumInputTokens,
} from "./budget.js";
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
import type { WorkerStore } from "./store.js";

export type PipelineRequest = {
  id: string;
  workspaceId: string;
  query: string;
  effort: ContextEffort;
  maxResolvedEffort: ResolvedEffort;
  platforms: Platform[];
  platformMode: PlatformMode;
  effectiveCapMicrocredits: bigint;
  committedMicrocredits: bigint;
  claimAttempt: number;
};

export type PipelineRunResult = {
  result: PublicContextResult;
  resolvedEffort: ResolvedEffort;
  diagnostics: {
    creditMicrocreditsSpent: bigint;
    executionCreditMicrocredits: bigint;
    loadedPlatforms: Platform[];
  };
};

type RetrievalLimits = {
  searchLimit: number;
  fetchLimit: number;
};

const retrievalLimits = {
  low: { searchLimit: 3, fetchLimit: 1 },
  medium: { searchLimit: 5, fetchLimit: 2 },
  high: { searchLimit: 8, fetchLimit: 3 },
  x_high: { searchLimit: 10, fetchLimit: 5 },
} as const satisfies Record<ResolvedEffort, RetrievalLimits>;

const synthesisReserve = {
  low: 1_500_000n,
  medium: 3_000_000n,
  high: 10_000_000n,
  x_high: 18_000_000n,
} as const satisfies Record<ResolvedEffort, bigint>;

const confidenceValues = new Set(["low", "medium", "high"]);

export class ResearchPipeline {
  constructor(
    private readonly providers: ProviderClients,
    private readonly store: WorkerStore,
  ) {}

  async run(request: PipelineRequest): Promise<PipelineRunResult> {
    const budget = new ResearchBudget(
      request.id,
      request.claimAttempt,
      request.effectiveCapMicrocredits,
      request.committedMicrocredits,
      this.store,
    );
    const resolvedEffort = await this.resolveEffort(request, budget);
    const effortCap = EFFORT_PROFILES[resolvedEffort].maximumCreditMicros;
    budget.narrowLimit(
      effortCap < request.effectiveCapMicrocredits ? effortCap : request.effectiveCapMicrocredits,
    );
    await this.store.setResolvedEffort(request.id, resolvedEffort);

    const selectedPlatforms = selectPlatformsForQuery(
      request.query,
      request.platforms,
      request.platformMode,
    ) as Platform[];
    const loadedSkills = selectedPlatforms.map((platform) => loadPlatformSkill(platform));
    const platformGuidance = loadedSkills.map((skill) =>
      [
        `${skill.loader}: ${skill.whenToUse}`,
        ...skill.operations.map(
          (operation) => `- ${operation.name} (${operation.provider}): ${operation.whenToUse}`,
        ),
      ].join("\n"),
    );
    const gaps: string[] = [];
    const candidates = await this.collectCandidates(
      request,
      resolvedEffort,
      selectedPlatforms,
      budget,
      gaps,
    );
    const normalizedSources = normalizeCandidates(candidates);
    const selectedChunks = await this.selectEvidenceChunks(
      request,
      resolvedEffort,
      normalizedSources,
      budget,
      gaps,
    );
    const usedSourceIds = new Set(selectedChunks.map((chunk) => chunk.sourceId));
    const usedSources = normalizedSources.filter((source) => usedSourceIds.has(source.sourceId));
    const publicSources = toPublicSources(usedSources);

    this.addEvidenceGaps(
      request,
      resolvedEffort,
      selectedPlatforms,
      normalizedSources,
      usedSources,
      budget,
      gaps,
    );
    const result = await this.synthesizeResult({
      request,
      resolvedEffort,
      platformGuidance,
      chunks: selectedChunks,
      sources: publicSources,
      sourcesConsidered: normalizedSources.length,
      gaps,
      budget,
    });

    return {
      result,
      resolvedEffort,
      diagnostics: {
        creditMicrocreditsSpent: budget.spent,
        executionCreditMicrocredits: budget.limit,
        loadedPlatforms: selectedPlatforms,
      },
    };
  }

  private async resolveEffort(
    request: PipelineRequest,
    budget: ResearchBudget,
  ): Promise<ResolvedEffort> {
    if (request.effort !== "auto") {
      return request.effort;
    }

    const profile = EFFORT_PROFILES.auto;
    const buildSystemPrompt = () =>
      [
        "Choose one Supacontext effort for the query.",
        'Return JSON only: {"effort":"low|medium|high|x_high"}.',
        "Use low for narrow lookups, medium for routine verification, high for broad or important research, and x_high only for exhaustive conflict resolution.",
        `The API key permits at most ${request.maxResolvedEffort}.`,
        `The request has ${formatCreditMicrocredits(budget.remaining)} credits remaining. Choose an effort whose minimum budget fits.`,
      ].join("\n");

    try {
      const systemPrompt = buildSystemPrompt();
      const routed = await this.callRouter({
        request,
        budget,
        provider: "groq",
        model: profile.routerModelId,
        maxTokens: profile.routerOutputTokenCap,
        systemPrompt,
        call: (maxTokens) =>
          this.providers.groq.routeEffort({
            requestId: request.id,
            query: request.query,
            maxTokens,
            systemPrompt,
          }),
      });

      return clampEffortToBudget(routed, request.maxResolvedEffort, budget.remaining);
    } catch (error) {
      if (error instanceof BudgetExhaustedError) {
        throw error;
      }
    }

    const fallbackSystemPrompt = buildSystemPrompt();
    const fallback = await this.callRouter({
      request,
      budget,
      provider: "deepseek",
      model: profile.fallbackRouterModelId,
      maxTokens: profile.fallbackRouterOutputTokenCap,
      systemPrompt: fallbackSystemPrompt,
      call: (maxTokens) =>
        this.providers.deepseek.routeEffort({
          requestId: request.id,
          query: request.query,
          maxTokens,
          systemPrompt: fallbackSystemPrompt,
        }),
    });

    return clampEffortToBudget(fallback, request.maxResolvedEffort, budget.remaining);
  }

  private async callRouter(input: {
    request: PipelineRequest;
    budget: ResearchBudget;
    provider: "groq" | "deepseek";
    model: ModelId;
    maxTokens: number;
    systemPrompt: string;
    call: (maxTokens: number) => Promise<ProviderResult<{ effort: ResolvedEffort }>>;
  }): Promise<ResolvedEffort> {
    const maximumInputTokens = estimateMaximumInputTokens(input.systemPrompt, input.request.query);
    const maxTokens = affordableOutputTokens({
      model: input.model,
      maximumInputTokens,
      desiredOutputTokens: input.maxTokens,
      remainingMicrocredits: input.budget.remaining,
    });

    if (maxTokens < 16) {
      throw new BudgetExhaustedError("The Auto router could not fit in the request reservation.");
    }

    const authorization = await input.budget.authorizeModel({
      provider: input.provider,
      model: input.model,
      maximumInputTokens,
      maximumOutputTokens: maxTokens,
      operation: "effort-router",
    });

    if (!authorization) {
      throw new BudgetExhaustedError("The Auto router could not be preauthorized.");
    }

    try {
      const result = await input.call(maxTokens);
      await input.budget.settleModel(
        authorization,
        input.model,
        result.usage.inputTokens,
        result.usage.outputTokens,
        result.usage.cachedInputTokens,
      );
      return result.data.effort;
    } catch (error) {
      await this.settleFailedModelAttempt(input.budget, authorization, input.model, error);
      throw error;
    }
  }

  private async collectCandidates(
    request: PipelineRequest,
    effort: ResolvedEffort,
    platforms: Platform[],
    budget: ResearchBudget,
    gaps: string[],
  ): Promise<NormalizedSourceCandidate[]> {
    const limits = retrievalLimits[effort];
    const candidates: NormalizedSourceCandidate[] = [];

    for (const platform of platforms) {
      const before = candidates.length;

      try {
        if (platform === "web") {
          await this.collectWeb(request, effort, limits, budget, candidates);
        } else if (platform === "reddit") {
          await this.collectReddit(request, effort, limits, budget, candidates);
        } else if (platform === "x") {
          await this.collectX(request, effort, limits, budget, candidates);
        } else if (platform === "youtube") {
          await this.collectYoutube(request, effort, limits, budget, candidates);
        } else if (platform === "facebook") {
          candidates.push(
            ...(await this.callApiDirect(
              request,
              effort,
              budget,
              "facebook.search-posts",
              "facebook.search_posts",
              { query: request.query, pages: 1 },
            )),
          );
        } else if (platform === "news") {
          candidates.push(
            ...(await this.callApiDirect(
              request,
              effort,
              budget,
              "news.news-articles",
              "news.search",
              {
                query: request.query,
                limit: limits.searchLimit,
              },
            )),
          );
        } else if (platform === "forums") {
          candidates.push(
            ...(await this.callApiDirect(
              request,
              effort,
              budget,
              "forums.forum-posts",
              "forums.search",
              {
                query: request.query,
                page: 1,
              },
            )),
          );
        } else if (platform === "places") {
          candidates.push(
            ...(await this.callApiDirect(
              request,
              effort,
              budget,
              "places.places-search",
              "places.search",
              {
                query: request.query,
                pages: 1,
              },
            )),
          );
        } else if (platform === "linkedin") {
          candidates.push(
            ...(await this.callApiDirect(
              request,
              effort,
              budget,
              "linkedin.search-posts",
              "linkedin.search_posts",
              { query: request.query, page: 1 },
            )),
          );
        } else if (platform === "hackernews") {
          await this.collectHackerNews(request, effort, limits, budget, candidates);
        } else if (platform === "github") {
          await this.collectGitHub(request, effort, limits, budget, candidates);
        }
      } catch (error) {
        if (error instanceof BudgetExhaustedError) {
          gaps.push(
            `${platform} was skipped because the remaining credits are reserved for synthesis.`,
          );
        } else {
          gaps.push(providerGap(platform, error));
        }
      }

      if (candidates.length === before) {
        gaps.push(`${platform} returned no usable normalized evidence.`);
      }
    }

    return candidates;
  }

  private async collectWeb(
    request: PipelineRequest,
    effort: ResolvedEffort,
    limits: RetrievalLimits,
    budget: ResearchBudget,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    const results = await this.callTool(budget, effort, "exa.search", "exa", "web", 1n, () =>
      this.providers.exa.search({
        requestId: request.id,
        query: request.query,
        limit: limits.searchLimit,
        platform: "web",
      }),
    );
    candidates.push(...results);
    const short = results
      .filter((candidate) => estimateTokens(candidate.content) < 350)
      .slice(0, limits.fetchLimit);

    if (short.length === 0) {
      return;
    }

    candidates.push(
      ...(await this.callTool(
        budget,
        effort,
        "exa.fetch-content",
        "exa",
        "web",
        BigInt(short.length),
        () =>
          this.providers.exa.fetchContent({
            requestId: request.id,
            candidates: short,
            limit: short.length,
          }),
      )),
    );
  }

  private async collectReddit(
    request: PipelineRequest,
    effort: ResolvedEffort,
    limits: RetrievalLimits,
    budget: ResearchBudget,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    const results = await this.callTool(
      budget,
      effort,
      "fetchlayer.reddit.search",
      "fetchlayer",
      "reddit",
      1n,
      () =>
        this.providers.fetchlayer.execute({
          requestId: request.id,
          platform: "reddit",
          operation: "search",
          params: { query: request.query, limit: limits.searchLimit },
        }),
    );
    candidates.push(...results);
    const top = results[0];

    if (top) {
      candidates.push(
        ...(await this.callTool(
          budget,
          effort,
          "fetchlayer.reddit.post",
          "fetchlayer",
          "reddit",
          1n,
          () =>
            this.providers.fetchlayer.execute({
              requestId: request.id,
              platform: "reddit",
              operation: "post",
              params: { url: top.url, pages: 1 },
            }),
        )),
      );
    }
  }

  private async collectX(
    request: PipelineRequest,
    effort: ResolvedEffort,
    limits: RetrievalLimits,
    budget: ResearchBudget,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    const results = await this.callTool(
      budget,
      effort,
      "fetchlayer.x.search",
      "fetchlayer",
      "x",
      1n,
      () =>
        this.providers.fetchlayer.execute({
          requestId: request.id,
          platform: "x",
          operation: "search",
          params: { query: request.query, product: "Latest", count: limits.searchLimit },
        }),
    );
    candidates.push(...results);
    const top = results[0];

    if (top?.metadata?.externalId) {
      candidates.push(
        ...(await this.callTool(
          budget,
          effort,
          "fetchlayer.x.tweet-detail",
          "fetchlayer",
          "x",
          1n,
          () =>
            this.providers.fetchlayer.execute({
              requestId: request.id,
              platform: "x",
              operation: "tweet-detail",
              params: { tweetId: top.metadata?.externalId },
            }),
        )),
      );
    }
  }

  private async collectYoutube(
    request: PipelineRequest,
    effort: ResolvedEffort,
    limits: RetrievalLimits,
    budget: ResearchBudget,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    const videos = await this.callApiDirect(
      request,
      effort,
      budget,
      "youtube.search-videos",
      "youtube.search_videos",
      { query: request.query, pages: 1 },
    );
    candidates.push(...videos);
    const video = videos[0];

    if (!video) {
      return;
    }

    const transcript = await this.callTool(
      budget,
      effort,
      "supadata.youtube.transcript",
      "supadata",
      "youtube",
      1n,
      () =>
        this.providers.supadata.fetchTranscript({
          requestId: request.id,
          url: video.url,
          title: video.title,
        }),
    );
    candidates.push(transcript);
  }

  private async collectHackerNews(
    request: PipelineRequest,
    effort: ResolvedEffort,
    limits: RetrievalLimits,
    budget: ResearchBudget,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    const results = await this.callTool(
      budget,
      effort,
      "hacker_news_algolia.search",
      "hacker_news_algolia",
      "hackernews",
      1n,
      () =>
        this.providers.hackerNews.execute({
          requestId: request.id,
          operation: "algolia.search",
          params: { query: request.query, hitsPerPage: limits.searchLimit },
        }),
    );
    candidates.push(...results);
    const itemId = results[0]?.metadata?.externalId;

    if (itemId) {
      candidates.push(
        ...(await this.callTool(
          budget,
          effort,
          "hacker_news_firebase.item",
          "hacker_news_firebase",
          "hackernews",
          1n,
          () =>
            this.providers.hackerNews.execute({
              requestId: request.id,
              operation: "firebase.item",
              params: { id: itemId },
            }),
        )),
      );
    }
  }

  private async collectGitHub(
    request: PipelineRequest,
    effort: ResolvedEffort,
    limits: RetrievalLimits,
    budget: ResearchBudget,
    candidates: NormalizedSourceCandidate[],
  ): Promise<void> {
    candidates.push(
      ...(await this.callTool(
        budget,
        effort,
        "github.search-repositories",
        "github",
        "github",
        1n,
        () =>
          this.providers.github.execute({
            requestId: request.id,
            operation: "search.repositories",
            params: { q: request.query, per_page: limits.searchLimit },
          }),
      )),
    );
  }

  private async callApiDirect(
    request: PipelineRequest,
    effort: ResolvedEffort,
    budget: ResearchBudget,
    pricingSuffix: string,
    operation: Parameters<ProviderClients["apiDirect"]["execute"]>[0]["operation"],
    params: NonNullable<Parameters<ProviderClients["apiDirect"]["execute"]>[0]["params"]>,
  ): Promise<NormalizedSourceCandidate[]> {
    return this.callTool(
      budget,
      effort,
      assertToolOperation(`api_direct.${pricingSuffix}`),
      "api_direct",
      pricingSuffix.split(".")[0] as Platform,
      BigInt(typeof params.pages === "number" ? params.pages : 1),
      () => this.providers.apiDirect.execute({ requestId: request.id, operation, params }),
    );
  }

  private async callTool<T>(
    budget: ResearchBudget,
    effort: ResolvedEffort,
    operation: ToolOperation,
    provider: ProviderName,
    platform: Platform | null,
    maximumUnits: bigint,
    call: () => Promise<ProviderResult<T>>,
  ): Promise<T> {
    const quote = priceToolOperationMicrocredits(operation, maximumUnits);

    if (quote + synthesisReserve[effort] > budget.remaining) {
      throw new BudgetExhaustedError();
    }

    const authorization = await budget.authorizeTool({
      operation,
      provider,
      platform,
      maximumUnits,
    });

    if (!authorization) {
      throw new BudgetExhaustedError();
    }

    try {
      const result = await call();
      const actualOperation = assertToolOperation(
        `${result.usage.provider}.${result.usage.operation}`,
      );
      await budget.settleTool(authorization, actualOperation, result.usage.billableUnits);
      return result.data;
    } catch (error) {
      await this.settleFailedToolAttempt(budget, authorization, operation, error);
      throw error;
    }
  }

  private async settleFailedToolAttempt(
    budget: ResearchBudget,
    authorization: CostAuthorization,
    operation: ToolOperation,
    error: unknown,
  ): Promise<void> {
    if (error instanceof NormalizedProviderError && error.billableUnits > 0) {
      await budget.settleTool(authorization, operation, error.billableUnits);
      return;
    }

    if (error instanceof NormalizedProviderError && isSuccessfulStatus(error.statusCode)) {
      await budget.markUncertain(authorization);
      return;
    }

    if (error instanceof NormalizedProviderError && isPreflightProviderError(error)) {
      await budget.release(authorization);
      return;
    }

    if (error instanceof NormalizedProviderError && error.statusCode !== null) {
      if (error.provider === "fetchlayer") {
        await budget.markUncertain(authorization);
        return;
      }

      await budget.release(authorization);
      return;
    }

    await budget.markUncertain(authorization);
  }

  private async settleFailedModelAttempt(
    budget: ResearchBudget,
    authorization: CostAuthorization,
    model: ModelId,
    error: unknown,
  ): Promise<void> {
    if (
      error instanceof NormalizedProviderError &&
      error.inputTokens !== undefined &&
      error.outputTokens !== undefined
    ) {
      await budget.settleModel(
        authorization,
        model,
        error.inputTokens,
        error.outputTokens,
        error.cachedInputTokens,
      );
      return;
    }

    if (
      error instanceof NormalizedProviderError &&
      (error.billableUnits > 0 || isSuccessfulStatus(error.statusCode))
    ) {
      await budget.markUncertain(authorization);
      return;
    }

    if (error instanceof NormalizedProviderError && isPreflightProviderError(error)) {
      await budget.release(authorization);
      return;
    }

    if (error instanceof NormalizedProviderError && error.statusCode !== null) {
      await budget.release(authorization);
      return;
    }

    await budget.markUncertain(authorization);
  }

  private async selectEvidenceChunks(
    request: PipelineRequest,
    effort: ResolvedEffort,
    sources: NormalizedEvidenceSource[],
    budget: ResearchBudget,
    gaps: string[],
  ): Promise<EvidenceChunk[]> {
    const config = PROMPT_TIER_CONFIG[effort];
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

    const maximumTokens = estimateRerankTokens(request.query, prefiltered);

    try {
      const data = await this.callTool(
        budget,
        effort,
        "voyage.rerank",
        "voyage",
        null,
        BigInt(maximumTokens),
        () =>
          this.providers.voyage.rerank({
            requestId: request.id,
            query: request.query,
            chunks: prefiltered.map((chunk) => ({ id: chunk.id, text: chunk.text })),
            topK: config.evidenceLimit,
          }),
      );

      return applyRerank(prefiltered, data.results, config.evidenceLimit);
    } catch (error) {
      gaps.push(
        error instanceof BudgetExhaustedError
          ? "The remaining credits did not fund reranking; keyword order was used."
          : providerGap("reranker", error),
      );
      return prefiltered.slice(0, config.evidenceLimit);
    }
  }

  private addEvidenceGaps(
    request: PipelineRequest,
    resolvedEffort: ResolvedEffort,
    selectedPlatforms: Platform[],
    consideredSources: NormalizedEvidenceSource[],
    usedSources: NormalizedEvidenceSource[],
    budget: ResearchBudget,
    gaps: string[],
  ): void {
    if (consideredSources.length === 0) {
      gaps.push(
        "No useful public evidence was found within the selected platforms and credit cap.",
      );
    }

    if (request.platformMode === "manual") {
      gaps.push(`Evidence was restricted to requested platforms: ${selectedPlatforms.join(", ")}.`);
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

    if (budget.remaining <= synthesisReserve[resolvedEffort]) {
      gaps.push("The request credit cap prevented more retrieval.");
    }
  }

  private async synthesizeResult(input: {
    request: PipelineRequest;
    resolvedEffort: ResolvedEffort;
    platformGuidance: string[];
    chunks: EvidenceChunk[];
    sources: PublicSource[];
    sourcesConsidered: number;
    gaps: string[];
    budget: ResearchBudget;
  }): Promise<PublicContextResult> {
    const evidence = input.chunks.map(toAgentEvidence);
    const prompt = buildResearchPrompt({
      query: input.request.query,
      effort: input.resolvedEffort,
      remainingCredits: formatCreditMicrocredits(input.budget.remaining),
      platformGuidance: input.platformGuidance,
      evidence,
      gaps: uniqueStrings(input.gaps),
    });
    const first = await this.callResearchModel({
      request: input.request,
      budget: input.budget,
      model: prompt.config.model,
      desiredOutputTokens: prompt.config.maxOutputTokens,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      call: (maxTokens) =>
        this.providers.deepseek.research({
          requestId: input.request.id,
          query: input.request.query,
          model: prompt.config.model,
          reasoning: prompt.config.reasoning,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          evidence,
          maxTokens,
        }),
    });
    const firstParse = parseAndBuildResult(first, input);

    if (firstParse.success) {
      return firstParse.result;
    }

    const repairUserPrompt = `${first}\n${firstParse.error}`;
    const repaired = await this.callResearchModel({
      request: input.request,
      budget: input.budget,
      model: prompt.config.model,
      desiredOutputTokens: prompt.config.maxOutputTokens,
      systemPrompt: prompt.systemPrompt,
      userPrompt: repairUserPrompt,
      call: (maxTokens) =>
        this.providers.deepseek.repairJson({
          requestId: input.request.id,
          query: input.request.query,
          model: prompt.config.model,
          reasoning: prompt.config.reasoning,
          systemPrompt: prompt.systemPrompt,
          evidence,
          invalidJson: first,
          validationError: firstParse.error,
          maxTokens,
        }),
    });
    const repairedParse = parseAndBuildResult(repaired, input);

    if (!repairedParse.success) {
      throw new Error(`Model returned invalid JSON after repair: ${repairedParse.error}`);
    }

    return repairedParse.result;
  }

  private async callResearchModel(input: {
    request: PipelineRequest;
    budget: ResearchBudget;
    model: ModelId;
    desiredOutputTokens: number;
    systemPrompt: string;
    userPrompt: string;
    call: (maxTokens: number) => Promise<ProviderResult<{ content: string }>>;
  }): Promise<string> {
    const maximumInputTokens = estimateMaximumInputTokens(input.systemPrompt, input.userPrompt);
    const maxTokens = affordableOutputTokens({
      model: input.model,
      maximumInputTokens,
      desiredOutputTokens: input.desiredOutputTokens,
      remainingMicrocredits: input.budget.remaining,
    });

    if (maxTokens < 256) {
      throw new BudgetExhaustedError("The remaining credits cannot fund a safe synthesis call.");
    }

    const authorization = await input.budget.authorizeModel({
      provider: "deepseek",
      model: input.model,
      maximumInputTokens,
      maximumOutputTokens: maxTokens,
      operation: "research-synthesis",
    });

    if (!authorization) {
      throw new BudgetExhaustedError("The synthesis call could not be preauthorized.");
    }

    try {
      const result = await input.call(maxTokens);
      await input.budget.settleModel(
        authorization,
        input.model,
        result.usage.inputTokens,
        result.usage.outputTokens,
        result.usage.cachedInputTokens,
      );
      return result.data.content;
    } catch (error) {
      await this.settleFailedModelAttempt(input.budget, authorization, input.model, error);
      throw error;
    }
  }
}

function isSuccessfulStatus(statusCode: number | null): boolean {
  return statusCode !== null && statusCode >= 200 && statusCode < 300;
}

function isPreflightProviderError(error: NormalizedProviderError): boolean {
  return (
    error.statusCode === null &&
    error.billableUnits === 0 &&
    (error.errorCode === "INVALID_PROVIDER_INPUT" ||
      error.errorCode === "INVALID_PROVIDER_OPERATION")
  );
}

function assertToolOperation(value: string): ToolOperation {
  if (!(value in TOOL_OPERATION_PRICING)) {
    throw new Error(`No audited price exists for provider operation ${value}.`);
  }

  return value as ToolOperation;
}

function clampEffort(effort: ResolvedEffort, maximum: ResolvedEffort): ResolvedEffort {
  const ranks = { low: 0, medium: 1, high: 2, x_high: 3 } as const;
  return ranks[effort] > ranks[maximum] ? maximum : effort;
}

function clampEffortToBudget(
  effort: ResolvedEffort,
  maximum: ResolvedEffort,
  remainingMicrocredits: bigint,
): ResolvedEffort {
  const allowed = clampEffort(effort, maximum);
  const efforts = ["low", "medium", "high", "x_high"] as const;
  const allowedIndex = efforts.indexOf(allowed);

  for (let index = allowedIndex; index >= 0; index -= 1) {
    const candidate = efforts[index];
    if (candidate && EFFORT_PROFILES[candidate].minimumCreditMicros <= remainingMicrocredits) {
      return candidate;
    }
  }

  throw new BudgetExhaustedError("The Auto router left too few credits for Low effort.");
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

function estimateRerankTokens(query: string, chunks: EvidenceChunk[]): number {
  const queryBytes = Buffer.byteLength(query, "utf8");
  const documentBytes = chunks.reduce(
    (sum, chunk) => sum + Buffer.byteLength(chunk.text, "utf8"),
    0,
  );

  return queryBytes * chunks.length + documentBytes + 512;
}

type ParseResult =
  { success: true; result: PublicContextResult } | { success: false; error: string };

function parseAndBuildResult(
  content: string,
  input: {
    request: PipelineRequest;
    resolvedEffort: ResolvedEffort;
    chunks: EvidenceChunk[];
    sources: PublicSource[];
    sourcesConsidered: number;
    gaps: string[];
    budget: ResearchBudget;
  },
): ParseResult {
  const parsed = parseJsonObject(content);

  if (!parsed.success) {
    return parsed;
  }

  try {
    return { success: true, result: validatePublicResult(buildFinalResult(parsed.value, input)) };
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

function parseJsonObject(
  content: string,
): { success: true; value: unknown } | { success: false; error: string } {
  try {
    return { success: true, value: JSON.parse(content) as unknown };
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");

    if (start === -1 || end <= start) {
      return { success: false, error: "Model output did not contain a JSON object." };
    }

    try {
      return { success: true, value: JSON.parse(content.slice(start, end + 1)) as unknown };
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
    resolvedEffort: ResolvedEffort;
    chunks: EvidenceChunk[];
    sources: PublicSource[];
    sourcesConsidered: number;
    gaps: string[];
    budget: ResearchBudget;
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
      creditsCharged: creditMicrocreditsToDisplayNumber(input.budget.spent),
      effort: input.request.effort,
      resolvedEffort: input.resolvedEffort,
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
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1_000;

  return sources.some((source) => {
    if (!source.candidate.publishedAt) {
      return false;
    }

    const time = Date.parse(source.candidate.publishedAt);
    return Number.isFinite(time) && time >= cutoff;
  });
}

import { describe, expect, it } from "vitest";
import type { ContextDepth, Platform, PlatformMode } from "@supacontext/core";
import {
  createMockProviderClients,
  type DeepSeekClient,
  type DeepSeekRepairInput,
  type DeepSeekResearchInput,
  type DeepSeekResult,
  type ExaClient,
  type FetchContentInput,
  type FetchLayerClient,
  type NormalizedSourceCandidate,
  type ProviderCallLogInput,
  type ProviderClients,
  type RerankInput,
  type RerankResult,
  type SearchInput,
  type SupadataClient,
  type TranscriptFetchInput,
  type VoyageClient,
  type WebSearchInput,
  type XFetchInput,
  type XquikClient,
} from "@supacontext/providers";
import { RESEARCH_UNIT_BUDGET } from "../budget.js";
import { chunkSources, normalizeCandidates } from "../content.js";
import { ResearchPipeline } from "../pipeline.js";
import type { PublicContextResult } from "../public-result.js";
import { ContextJobProcessor } from "../server.js";
import type { WorkerContextRequest, WorkerStore } from "../store.js";
import type { WebhookPayload, WebhookSender } from "../webhook.js";

const requestId = "ctx_test_worker";

type InternalRequest = WorkerContextRequest & {
  result: PublicContextResult | null;
  errorCode: string | null;
  errorMessage: string | null;
};

class InMemoryWorkerStore implements WorkerStore {
  readonly providerLogs: ProviderCallLogInput[] = [];
  private readonly requests = new Map<string, InternalRequest>();

  constructor(request: Partial<WorkerContextRequest> = {}) {
    const stored: InternalRequest = {
      id: request.id ?? requestId,
      workspaceId: request.workspaceId ?? "workspace_1",
      query: request.query ?? "context API market",
      depth: request.depth ?? "standard",
      platforms: request.platforms ?? ["web", "reddit", "x", "youtube"],
      platformMode: request.platformMode ?? "auto",
      status: request.status ?? "queued",
      spentCredits: request.spentCredits ?? 20,
      webhookUrl: request.webhookUrl ?? null,
      result: null,
      errorCode: null,
      errorMessage: null,
    };

    this.requests.set(stored.id, stored);
  }

  read(requestIdToRead = requestId): InternalRequest {
    const request = this.requests.get(requestIdToRead);

    if (!request) {
      throw new Error("Missing request.");
    }

    return request;
  }

  async findRequest(requestIdToFind: string): Promise<WorkerContextRequest | null> {
    return this.requests.get(requestIdToFind) ?? null;
  }

  async markRequestRunning(requestIdToRun: string): Promise<WorkerContextRequest | null> {
    const request = this.requests.get(requestIdToRun);

    if (!request) {
      return null;
    }

    if (request.status === "queued" || request.status === "running") {
      request.status = "running";
    }

    return request;
  }

  async completeRequest(
    requestIdToComplete: string,
    result: PublicContextResult,
  ): Promise<WorkerContextRequest | null> {
    const request = this.requests.get(requestIdToComplete);

    if (!request) {
      return null;
    }

    request.status = "completed";
    request.result = result;

    return request;
  }

  async failRequest(
    requestIdToFail: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<WorkerContextRequest | null> {
    const request = this.requests.get(requestIdToFail);

    if (!request) {
      return null;
    }

    request.status = "failed";
    request.errorCode = errorCode;
    request.errorMessage = errorMessage;

    return request;
  }

  async saveProviderCallLog(input: ProviderCallLogInput): Promise<void> {
    this.providerLogs.push(input);
  }

  async close(): Promise<void> {}
}

class CapturingWebhookSender implements WebhookSender {
  readonly payloads: Array<{ url: string; payload: WebhookPayload }> = [];

  async send(url: string, payload: WebhookPayload): Promise<void> {
    this.payloads.push({
      url,
      payload,
    });
  }
}

class ScriptedDeepSeek implements DeepSeekClient {
  readonly evidenceCalls: DeepSeekResearchInput["evidence"][] = [];

  constructor(
    private readonly researchOutput: string | ((input: DeepSeekResearchInput) => string) = "",
    private readonly repairOutput: string | ((input: DeepSeekRepairInput) => string) = "",
  ) {}

  async research(input: DeepSeekResearchInput): Promise<DeepSeekResult> {
    this.evidenceCalls.push(input.evidence);

    return {
      content: typeof this.researchOutput === "function"
        ? this.researchOutput(input)
        : this.researchOutput || validModelJson(input.evidence),
    };
  }

  async repairJson(input: DeepSeekRepairInput): Promise<DeepSeekResult> {
    return {
      content: typeof this.repairOutput === "function"
        ? this.repairOutput(input)
        : this.repairOutput || validModelJson(input.evidence, "Repaired answer"),
    };
  }
}

class ScriptedVoyage implements VoyageClient {
  calls = 0;

  constructor(private readonly results: RerankResult[] = []) {}

  async rerank(_input: RerankInput): Promise<RerankResult[]> {
    this.calls += 1;

    return this.results;
  }
}

class CountingFetchLayer implements FetchLayerClient {
  searchCalls = 0;
  fetchCalls = 0;

  async searchReddit(input: SearchInput): Promise<NormalizedSourceCandidate[]> {
    this.searchCalls += 1;

    return [candidate("reddit", `Reddit evidence about ${input.query}`)];
  }

  async fetchRedditThread(input: { candidate: NormalizedSourceCandidate }): Promise<NormalizedSourceCandidate> {
    this.fetchCalls += 1;

    return {
      ...input.candidate,
      content: `${input.candidate.content} with fetched thread comments.`,
    };
  }
}

class CountingExa implements ExaClient {
  searchCalls: WebSearchInput[] = [];
  fetchCalls = 0;

  constructor(private readonly results: NormalizedSourceCandidate[] = []) {}

  async search(input: WebSearchInput): Promise<NormalizedSourceCandidate[]> {
    this.searchCalls.push(input);

    if (this.results.length > 0) {
      return this.results;
    }

    return Array.from({ length: input.limit }, (_, index) =>
      candidate(input.platform, `${input.query} ${input.platform} evidence ${index + 1}`),
    );
  }

  async fetchContent(input: FetchContentInput): Promise<NormalizedSourceCandidate[]> {
    this.fetchCalls += 1;

    return input.candidates.slice(0, input.limit);
  }
}

class CountingXquik implements XquikClient {
  searchCalls = 0;
  fetchCalls = 0;

  async searchX(input: SearchInput): Promise<NormalizedSourceCandidate[]> {
    this.searchCalls += 1;

    return [candidate("x", `X evidence about ${input.query}`)];
  }

  async fetchXPost(input: XFetchInput): Promise<NormalizedSourceCandidate> {
    this.fetchCalls += 1;

    return {
      ...input.candidate,
      content: `${input.candidate.content} with fetched thread context.`,
    };
  }
}

class CountingSupadata implements SupadataClient {
  transcriptCalls = 0;

  async fetchTranscript(input: TranscriptFetchInput): Promise<NormalizedSourceCandidate> {
    this.transcriptCalls += 1;

    return candidate("youtube", `${input.title ?? "Video"} transcript evidence`, input.url);
  }
}

function createProviders(input: {
  exa?: ExaClient;
  fetchlayer?: FetchLayerClient;
  xquik?: XquikClient;
  supadata?: SupadataClient;
  voyage?: VoyageClient;
  deepseek?: DeepSeekClient;
} = {}): ProviderClients {
  return {
    exa: input.exa ?? new CountingExa(),
    fetchlayer: input.fetchlayer ?? new CountingFetchLayer(),
    xquik: input.xquik ?? new CountingXquik(),
    supadata: input.supadata ?? new CountingSupadata(),
    voyage: input.voyage ?? new ScriptedVoyage(),
    deepseek: input.deepseek ?? new ScriptedDeepSeek(),
  };
}

function candidate(platform: Platform, content: string, url?: string): NormalizedSourceCandidate {
  return {
    provider: platform === "reddit" ? "fetchlayer" : platform === "x" ? "xquik" : platform === "youtube" ? "supadata" : "exa",
    platform,
    title: `${platform} source`,
    url: url ?? `https://example.com/${platform}/${encodeURIComponent(content.slice(0, 16))}`,
    publishedAt: "2026-06-01T00:00:00.000Z",
    content,
    summary: content.slice(0, 120),
  };
}

function validModelJson(evidence: DeepSeekResearchInput["evidence"], answer = "Compiled answer"): string {
  return JSON.stringify({
    answer,
    context_pack: evidence.slice(0, 2).map((item) => ({
      claim: `Claim from ${item.title}`,
      confidence: "high",
      supporting_sources: [item.sourceId],
    })),
    sources: [],
    gaps: [],
  });
}

function pipelineRequest(input: {
  depth?: ContextDepth;
  platforms?: Platform[];
  platformMode?: PlatformMode;
  query?: string;
} = {}) {
  return {
    id: requestId,
    workspaceId: "workspace_1",
    query: input.query ?? "context API market",
    depth: input.depth ?? "standard",
    platforms: input.platforms ?? ["web", "reddit", "x", "youtube"],
    platformMode: input.platformMode ?? "auto",
    creditsCharged: input.depth === "fast" ? 5 : 20,
  };
}

describe("research worker pipeline", () => {
  it("obeys manual platform restrictions", async () => {
    const exa = new CountingExa();
    const fetchlayer = new CountingFetchLayer();
    const xquik = new CountingXquik();
    const supadata = new CountingSupadata();
    const pipeline = new ResearchPipeline(createProviders({ exa, fetchlayer, xquik, supadata }));

    const run = await pipeline.run(
      pipelineRequest({
        platforms: ["reddit"],
        platformMode: "manual",
      }),
    );

    expect(fetchlayer.searchCalls).toBe(1);
    expect(exa.searchCalls).toHaveLength(0);
    expect(xquik.searchCalls).toBe(0);
    expect(supadata.transcriptCalls).toBe(0);
    expect(run.result.sources.every((source) => source.platform === "reddit")).toBe(true);
  });

  it("keeps internal research unit spending within the depth budget", async () => {
    const pipeline = new ResearchPipeline(createProviders());
    const run = await pipeline.run(
      pipelineRequest({
        depth: "fast",
      }),
    );

    expect(run.diagnostics.researchUnitsSpent).toBeLessThanOrEqual(RESEARCH_UNIT_BUDGET.fast);
  });

  it("chunks large YouTube transcripts while preserving timestamps", () => {
    const source = normalizeCandidates([
      {
        provider: "supadata",
        platform: "youtube",
        title: "Long video",
        url: "https://www.youtube.com/watch?v=long",
        publishedAt: "2026-06-01T00:00:00.000Z",
        content: Array.from({ length: 20 }, (_, index) => `segment ${index} transcript text repeated repeated repeated`).join("\n"),
        summary: "Long transcript",
        metadata: {
          transcriptSegments: Array.from({ length: 20 }, (_, index) => ({
            text: `segment ${index} transcript text repeated repeated repeated`,
            startSeconds: index * 10,
            endSeconds: index * 10 + 8,
          })),
        },
      },
    ]);

    const chunks = chunkSources(source, {
      directTokenLimit: 10,
      chunkTokenLimit: 35,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.startSeconds).toBe(0);
    expect(chunks.at(-1)?.endSeconds).toBe(198);
  });

  it("uses Voyage reranking for large chunk sets and sends selected chunks to synthesis", async () => {
    const largeContent = Array.from({ length: 28 }, (_, index) =>
      index === 16
        ? "target-ranked paragraph with context API buyer evidence and strong relevance. ".repeat(18)
        : `ordinary paragraph ${index} with context API background and filler details. `.repeat(18),
    ).join("\n\n");
    const deepseek = new ScriptedDeepSeek((input) => validModelJson(input.evidence));
    const voyage = new ScriptedVoyage([{ id: "chunk_src_1_17", score: 1 }]);
    const pipeline = new ResearchPipeline(
      createProviders({
        exa: new CountingExa([candidate("web", largeContent)]),
        voyage,
        deepseek,
      }),
    );

    await pipeline.run(pipelineRequest({ platforms: ["web"], platformMode: "manual" }));

    expect(voyage.calls).toBe(1);
    expect(deepseek.evidenceCalls[0]?.[0]?.excerpt).toContain("target-ranked");
  });

  it("repairs invalid model JSON once before saving the result", async () => {
    const deepseek = new ScriptedDeepSeek("not json", (_input) =>
      JSON.stringify({
        answer: "Repaired answer",
        context_pack: [
          {
            claim: "Repaired claim",
            confidence: "medium",
            supporting_sources: ["src_1"],
          },
        ],
        sources: [],
        gaps: [],
      }),
    );
    const pipeline = new ResearchPipeline(createProviders({ deepseek }));

    const run = await pipeline.run(pipelineRequest({ platforms: ["web"], platformMode: "manual" }));

    expect(run.result.answer).toBe("Repaired answer");
    expect(run.result.context_pack[0]?.claim).toBe("Repaired claim");
  });

  it("marks a job failed when model JSON remains invalid", async () => {
    const store = new InMemoryWorkerStore({
      platforms: ["web"],
      platformMode: "manual",
    });
    const processor = new ContextJobProcessor(
      store,
      new ResearchPipeline(
        createProviders({
          deepseek: new ScriptedDeepSeek("not json", "still not json"),
        }),
      ),
      new CapturingWebhookSender(),
    );

    const response = await processor.process(requestId);

    expect(response.status).toBe("failed");
    expect(store.read().status).toBe("failed");
    expect(store.read().errorCode).toBe("MODEL_INVALID_JSON");
  });

  it("sends completed webhook payloads with id, status, and final result", async () => {
    const store = new InMemoryWorkerStore({
      webhookUrl: "https://example.com/webhook",
      platforms: ["web"],
      platformMode: "manual",
    });
    const webhooks = new CapturingWebhookSender();
    const processor = new ContextJobProcessor(
      store,
      new ResearchPipeline(createProviders()),
      webhooks,
    );

    const response = await processor.process(requestId);

    expect(response.status).toBe("completed");
    expect(webhooks.payloads).toHaveLength(1);
    expect(webhooks.payloads[0]).toMatchObject({
      url: "https://example.com/webhook",
      payload: {
        id: requestId,
        status: "completed",
        result: {
          usage: {
            credits_charged: 20,
          },
        },
      },
    });
  });

  it("provider mocks emit provider call logs without raw payloads", async () => {
    const logs: ProviderCallLogInput[] = [];
    const pipeline = new ResearchPipeline(createMockProviderClients((input) => {
      logs.push(input);
    }));

    await pipeline.run(pipelineRequest({ platforms: ["web"], platformMode: "manual" }));

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((log) => "provider" in log && !("response" in log))).toBe(true);
  });
});

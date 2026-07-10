import { describe, expect, it } from "vitest";
import {
  CREDIT_MICROS,
  priceModelTokensMicrocredits,
  priceToolOperationMicrocredits,
  type ResolvedEffort,
} from "@supacontext/core";
import {
  createMockProviderClients,
  NormalizedProviderError,
  type DeepSeekClient,
  type DeepSeekRepairInput,
  type DeepSeekResearchInput,
  type DeepSeekResult,
  type ExaClient,
  type FetchContentInput,
  type NormalizedSourceCandidate,
  type ProviderCallLogInput,
  type ProviderClients,
  type ProviderResult,
  type WebSearchInput,
} from "@supacontext/providers";
import { BudgetExhaustedError, ResearchBudget } from "../budget.js";
import { ResearchPipeline, type PipelineRequest } from "../pipeline.js";
import type { PublicContextResult } from "../public-result.js";
import { ContextJobProcessor } from "../server.js";
import type {
  BeginCostEventInput,
  SettleCostEventInput,
  WorkerClaimResult,
  WorkerContextRequest,
  WorkerStore,
} from "../store.js";
import type { WebhookPayload, WebhookSender } from "../webhook.js";

const requestId = "ctx_test_worker";

type CostEvent = BeginCostEventInput & {
  status: "pending" | "settled" | "released" | "uncertain";
  actualMicrocredits: bigint | null;
};

type InternalRequest = WorkerContextRequest & {
  result: PublicContextResult | null;
  errorCode: string | null;
  errorMessage: string | null;
};

class InMemoryWorkerStore implements WorkerStore {
  readonly providerLogs: ProviderCallLogInput[] = [];
  readonly costEvents = new Map<string, CostEvent>();
  readonly request: InternalRequest;

  constructor(input: Partial<WorkerContextRequest> = {}) {
    this.request = {
      id: input.id ?? requestId,
      workspaceId: input.workspaceId ?? "workspace_1",
      apiKeyId: input.apiKeyId ?? "key_1",
      query: input.query ?? "Supacontext context API",
      effort: input.effort ?? "low",
      resolvedEffort: input.resolvedEffort ?? null,
      maxResolvedEffort: input.maxResolvedEffort ?? "x_high",
      platforms: input.platforms ?? ["web"],
      platformMode: input.platformMode ?? "manual",
      status: input.status ?? "queued",
      effectiveCapMicrocredits: input.effectiveCapMicrocredits ?? 20n * CREDIT_MICROS,
      committedMicrocredits: input.committedMicrocredits ?? 0n,
      claimAttempt: input.claimAttempt ?? 0,
      webhookUrl: input.webhookUrl ?? null,
      result: null,
      errorCode: null,
      errorMessage: null,
    };
  }

  get committed(): bigint {
    return [...this.costEvents.values()].reduce((sum, event) => {
      if (event.status === "released") {
        return sum;
      }
      return sum + (event.actualMicrocredits ?? event.reservedMicrocredits);
    }, 0n);
  }

  async findRequest(id: string): Promise<WorkerContextRequest | null> {
    return id === this.request.id ? this.withCommitted() : null;
  }

  async claimRequest(id: string): Promise<WorkerClaimResult> {
    if (id !== this.request.id) {
      return { request: null, claimed: false };
    }
    if (this.request.status !== "queued") {
      return { request: this.withCommitted(), claimed: false };
    }
    this.request.status = "running";
    this.request.claimAttempt += 1;
    return { request: this.withCommitted(), claimed: true };
  }

  async setResolvedEffort(id: string, effort: ResolvedEffort): Promise<void> {
    if (id === this.request.id) {
      this.request.resolvedEffort = effort;
    }
  }

  async beginCostEvent(input: BeginCostEventInput): Promise<boolean> {
    if (
      input.requestId !== this.request.id ||
      this.request.status !== "running" ||
      this.costEvents.has(input.id) ||
      this.committed + input.reservedMicrocredits > this.request.effectiveCapMicrocredits
    ) {
      return false;
    }
    this.costEvents.set(input.id, {
      ...input,
      status: "pending",
      actualMicrocredits: null,
    });
    return true;
  }

  async settleCostEvent(input: SettleCostEventInput): Promise<void> {
    const event = this.requireEvent(input.id);
    if (event.status !== "pending") {
      return;
    }
    if (input.actualMicrocredits > event.reservedMicrocredits) {
      throw new Error("Actual cost exceeded authorization.");
    }
    event.status = "settled";
    event.actualMicrocredits = input.actualMicrocredits;
  }

  async releaseCostEvent(id: string, _requestId: string): Promise<void> {
    const event = this.requireEvent(id);
    if (event.status === "pending") {
      event.status = "released";
      event.actualMicrocredits = 0n;
    }
  }

  async markCostEventUncertain(id: string, _requestId: string): Promise<void> {
    const event = this.requireEvent(id);
    if (event.status === "pending") {
      event.status = "uncertain";
      event.actualMicrocredits = event.reservedMicrocredits;
    }
  }

  async completeRequest(
    id: string,
    resolvedEffort: ResolvedEffort,
    result: PublicContextResult,
  ): Promise<WorkerContextRequest | null> {
    if (id !== this.request.id) {
      return null;
    }
    this.request.status = "completed";
    this.request.resolvedEffort = resolvedEffort;
    this.request.result = result;
    return this.withCommitted();
  }

  async failRequest(
    id: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<WorkerContextRequest | null> {
    if (id !== this.request.id) {
      return null;
    }
    this.request.status = "failed";
    this.request.errorCode = errorCode;
    this.request.errorMessage = errorMessage;
    return this.withCommitted();
  }

  async saveProviderCallLog(input: ProviderCallLogInput): Promise<void> {
    this.providerLogs.push(input);
  }

  async close(): Promise<void> {}

  private requireEvent(id: string): CostEvent {
    const event = this.costEvents.get(id);
    if (!event) {
      throw new Error(`Missing cost event ${id}.`);
    }
    return event;
  }

  private withCommitted(): WorkerContextRequest {
    return { ...this.request, committedMicrocredits: this.committed };
  }
}

class CapturingWebhookSender implements WebhookSender {
  readonly payloads: Array<{ url: string; payload: WebhookPayload }> = [];

  async send(url: string, payload: WebhookPayload): Promise<void> {
    this.payloads.push({ url, payload });
  }
}

class InvalidDeepSeek implements DeepSeekClient {
  async research(input: DeepSeekResearchInput): Promise<ProviderResult<DeepSeekResult>> {
    return invalidModelResult(input.requestId, "research");
  }

  async repairJson(input: DeepSeekRepairInput): Promise<ProviderResult<DeepSeekResult>> {
    return invalidModelResult(input.requestId, "repair_json");
  }

  async routeEffort(): Promise<ProviderResult<{ effort: ResolvedEffort }>> {
    return {
      data: { effort: "low" },
      usage: {
        provider: "deepseek",
        operation: "route_effort",
        billableUnits: 1,
        inputTokens: 10,
        outputTokens: 5,
      },
    };
  }
}

class MissingUsageDeepSeek implements DeepSeekClient {
  constructor(private readonly delegate: DeepSeekClient) {}

  async research(input: DeepSeekResearchInput): Promise<ProviderResult<DeepSeekResult>> {
    const result = await this.delegate.research(input);
    return {
      data: result.data,
      usage: { provider: "deepseek", operation: "research", billableUnits: 1 },
    };
  }

  repairJson(input: DeepSeekRepairInput): Promise<ProviderResult<DeepSeekResult>> {
    return this.delegate.repairJson(input);
  }

  routeEffort(input: Parameters<DeepSeekClient["routeEffort"]>[0]) {
    return this.delegate.routeEffort(input);
  }
}

class BillableFailureDeepSeek implements DeepSeekClient {
  async research(_input: DeepSeekResearchInput): Promise<ProviderResult<DeepSeekResult>> {
    throw new NormalizedProviderError(
      "deepseek",
      "EMPTY_MODEL_OUTPUT",
      "DeepSeek returned empty output.",
      200,
      1,
      120,
      30,
      150,
    );
  }

  async repairJson(input: DeepSeekRepairInput): Promise<ProviderResult<DeepSeekResult>> {
    return invalidModelResult(input.requestId, "repair_json");
  }

  async routeEffort(): Promise<ProviderResult<{ effort: ResolvedEffort }>> {
    return {
      data: { effort: "low" },
      usage: {
        provider: "deepseek",
        operation: "route_effort",
        billableUnits: 1,
        inputTokens: 10,
        outputTokens: 5,
      },
    };
  }
}

class BillableFailureExa implements ExaClient {
  async search(_input: WebSearchInput): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    throw new NormalizedProviderError(
      "exa",
      "UNUSABLE_RESPONSE",
      "Exa returned unusable output.",
      200,
      1,
    );
  }

  async fetchContent(
    _input: FetchContentInput,
  ): Promise<ProviderResult<NormalizedSourceCandidate[]>> {
    return {
      data: [],
      usage: { provider: "exa", operation: "fetch-content", billableUnits: 0 },
    };
  }
}

function invalidModelResult(_requestId: string, operation: string): ProviderResult<DeepSeekResult> {
  return {
    data: { content: "not valid json" },
    usage: {
      provider: "deepseek",
      operation,
      billableUnits: 1,
      inputTokens: 100,
      outputTokens: 20,
    },
  };
}

function providersFor(store: InMemoryWorkerStore, deepseek?: DeepSeekClient): ProviderClients {
  const clients = createMockProviderClients((input) => store.saveProviderCallLog(input));
  return deepseek ? { ...clients, deepseek } : clients;
}

function pipelineRequest(input: Partial<PipelineRequest> = {}): PipelineRequest {
  return {
    id: input.id ?? requestId,
    workspaceId: input.workspaceId ?? "workspace_1",
    query: input.query ?? "Supacontext context API",
    effort: input.effort ?? "low",
    maxResolvedEffort: input.maxResolvedEffort ?? "x_high",
    platforms: input.platforms ?? ["web"],
    platformMode: input.platformMode ?? "manual",
    effectiveCapMicrocredits: input.effectiveCapMicrocredits ?? 20n * CREDIT_MICROS,
    committedMicrocredits: input.committedMicrocredits ?? 0n,
    claimAttempt: input.claimAttempt ?? 1,
  };
}

async function runningStore(input: Partial<WorkerContextRequest> = {}) {
  const store = new InMemoryWorkerStore(input);
  await store.claimRequest(store.request.id);
  return store;
}

describe("durable research budget", () => {
  it("preauthorizes maximum cost and settles to actual tool units", async () => {
    const store = await runningStore({ effectiveCapMicrocredits: 10n * CREDIT_MICROS });
    const budget = new ResearchBudget(requestId, 1, 10n * CREDIT_MICROS, 0n, store);
    const authorization = await budget.authorizeTool({
      operation: "exa.fetch-content",
      provider: "exa",
      platform: "web",
      maximumUnits: 5n,
    });

    expect(authorization?.reservedMicrocredits).toBe(5n * CREDIT_MICROS);
    expect(budget.remaining).toBe(5n * CREDIT_MICROS);
    await budget.settleTool(authorization!, "exa.fetch-content", 2);
    expect(budget.spent).toBe(2n * CREDIT_MICROS);
    expect(store.committed).toBe(2n * CREDIT_MICROS);
  });

  it("refuses work that cannot fit and charges the maximum when token usage is delayed", async () => {
    const store = await runningStore({ effectiveCapMicrocredits: 2n * CREDIT_MICROS });
    const budget = new ResearchBudget(requestId, 1, 2n * CREDIT_MICROS, 0n, store);
    expect(
      await budget.authorizeTool({
        operation: "exa.search",
        provider: "exa",
        platform: "web",
      }),
    ).toBeNull();

    const maximumInputTokens = 1_000;
    const maximumOutputTokens = 500;
    const modelMaximum = priceModelTokensMicrocredits(
      "deepseek-v4-flash",
      BigInt(maximumInputTokens),
      BigInt(maximumOutputTokens),
    );
    const modelAuthorization = await budget.authorizeModel({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      maximumInputTokens,
      maximumOutputTokens,
      operation: "research-synthesis",
    });
    expect(modelAuthorization).not.toBeNull();
    await budget.settleModel(modelAuthorization!, "deepseek-v4-flash", undefined, undefined);
    expect(store.committed).toBe(modelMaximum);
    expect([...store.costEvents.values()][0]?.status).toBe("uncertain");
  });

  it("never allows settlement above the preauthorized amount", async () => {
    const store = await runningStore({ effectiveCapMicrocredits: CREDIT_MICROS });
    const budget = new ResearchBudget(requestId, 1, CREDIT_MICROS, 0n, store);
    const authorization = await budget.authorizeTool({
      operation: "github.repository",
      provider: "github",
      platform: "github",
    });

    await expect(budget.settleTool(authorization!, "github.repository", 5)).rejects.toThrow(
      "preauthorized",
    );
    expect([...store.costEvents.values()][0]?.status).toBe("uncertain");
  });
});

describe("lazy, effort-aware research pipeline", () => {
  it("loads and calls only manually selected platform operations", async () => {
    const store = await runningStore({
      platforms: ["github"],
      effectiveCapMicrocredits: 20n * CREDIT_MICROS,
    });
    const pipeline = new ResearchPipeline(providersFor(store), store);
    const run = await pipeline.run(
      pipelineRequest({ platforms: ["github"], effectiveCapMicrocredits: 20n * CREDIT_MICROS }),
    );

    expect(run.diagnostics.loadedPlatforms).toEqual(["github"]);
    expect(store.providerLogs.some((log) => log.provider === "github")).toBe(true);
    expect(store.providerLogs.some((log) => log.provider === "exa")).toBe(false);
    expect(run.result.sources.every((source) => source.platform === "github")).toBe(true);
  });

  it("charges the Groq Auto router and clamps its choice to the API key maximum", async () => {
    const store = await runningStore({
      effort: "auto",
      maxResolvedEffort: "medium",
      effectiveCapMicrocredits: 50n * CREDIT_MICROS,
      query: "Exhaustive research across everything",
    });
    const pipeline = new ResearchPipeline(providersFor(store), store);
    const run = await pipeline.run(
      pipelineRequest({
        effort: "auto",
        maxResolvedEffort: "medium",
        query: "Exhaustive research across everything",
        platforms: ["web"],
        platformMode: "auto",
        effectiveCapMicrocredits: 50n * CREDIT_MICROS,
      }),
    );

    expect(run.resolvedEffort).toBe("medium");
    expect(store.providerLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "groq", operation: "route_effort" }),
      ]),
    );
    expect(
      [...store.costEvents.values()].some(
        (event) => event.provider === "groq" && event.operation === "effort-router",
      ),
    ).toBe(true);
  });

  it("downgrades Auto when the routed effort cannot fit the remaining reservation", async () => {
    const store = await runningStore({
      effort: "auto",
      maxResolvedEffort: "x_high",
      effectiveCapMicrocredits: 12n * CREDIT_MICROS,
      query: "Exhaustive research across everything",
    });
    const run = await new ResearchPipeline(providersFor(store), store).run(
      pipelineRequest({
        effort: "auto",
        maxResolvedEffort: "x_high",
        query: "Exhaustive research across everything",
        platforms: ["web"],
        platformMode: "auto",
        effectiveCapMicrocredits: 12n * CREDIT_MICROS,
      }),
    );

    expect(run.resolvedEffort).toBe("medium");
    expect(run.diagnostics.creditMicrocreditsSpent).toBeLessThanOrEqual(12n * CREDIT_MICROS);
  });

  it("settles model calls from provider-reported token counts", async () => {
    const store = await runningStore({ effectiveCapMicrocredits: 20n * CREDIT_MICROS });
    const pipeline = new ResearchPipeline(providersFor(store), store);
    const run = await pipeline.run(pipelineRequest());
    const modelEvents = [...store.costEvents.values()].filter(
      (event) => event.provider === "deepseek",
    );

    expect(modelEvents).not.toHaveLength(0);
    expect(modelEvents.every((event) => event.status === "settled")).toBe(true);
    expect(run.diagnostics.creditMicrocreditsSpent).toBe(store.committed);
    expect(run.result.usage.credits_charged).toBe(Number(store.committed) / Number(CREDIT_MICROS));
  });

  it("keeps the model maximum charged when usage reporting is missing", async () => {
    const store = await runningStore({ effectiveCapMicrocredits: 20n * CREDIT_MICROS });
    const base = createMockProviderClients();
    const providers = providersFor(store, new MissingUsageDeepSeek(base.deepseek));
    const run = await new ResearchPipeline(providers, store).run(pipelineRequest());
    const modelEvent = [...store.costEvents.values()].find(
      (event) => event.provider === "deepseek",
    );

    expect(modelEvent?.status).toBe("uncertain");
    expect(modelEvent?.actualMicrocredits).toBe(modelEvent?.reservedMicrocredits);
    expect(run.diagnostics.creditMicrocreditsSpent).toBeLessThanOrEqual(20n * CREDIT_MICROS);
  });

  it("charges preserved units for a paid 2xx tool response that cannot be normalized", async () => {
    const store = await runningStore({ effectiveCapMicrocredits: 20n * CREDIT_MICROS });
    const providers = providersFor(store);
    providers.exa = new BillableFailureExa();
    await new ResearchPipeline(providers, store).run(pipelineRequest());
    const exaEvent = [...store.costEvents.values()].find(
      (event) => event.operation === "exa.search",
    );

    expect(exaEvent?.status).toBe("settled");
    expect(exaEvent?.actualMicrocredits).toBe(7n * CREDIT_MICROS);
  });

  it("fails before provider work when the reservation cannot fund synthesis", async () => {
    const store = await runningStore({ effectiveCapMicrocredits: 100_000n });
    const pipeline = new ResearchPipeline(providersFor(store), store);

    await expect(
      pipeline.run(pipelineRequest({ effectiveCapMicrocredits: 100_000n })),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(store.providerLogs).toHaveLength(0);
    expect(store.committed).toBe(0n);
  });
});

describe("worker job lifecycle", () => {
  it("persists a completed result and sends the public webhook payload", async () => {
    const store = new InMemoryWorkerStore({
      webhookUrl: "https://example.com/webhook",
      platforms: ["github"],
    });
    const webhooks = new CapturingWebhookSender();
    const processor = new ContextJobProcessor(
      store,
      new ResearchPipeline(providersFor(store), store),
      webhooks,
    );
    const response = await processor.process(requestId);

    expect(response.status).toBe("completed");
    expect(store.request.status).toBe("completed");
    expect(store.request.result?.sources[0]?.platform).toBe("github");
    expect(webhooks.payloads).toEqual([
      expect.objectContaining({
        url: "https://example.com/webhook",
        payload: expect.objectContaining({ id: requestId, status: "completed" }),
      }),
    ]);
  });

  it("settles consumed work and reports invalid model output after one repair", async () => {
    const store = new InMemoryWorkerStore();
    const processor = new ContextJobProcessor(
      store,
      new ResearchPipeline(providersFor(store, new InvalidDeepSeek()), store),
      new CapturingWebhookSender(),
    );
    const response = await processor.process(requestId);

    expect(response.status).toBe("failed");
    expect(response).toMatchObject({ error: { code: "invalid_model_output" } });
    expect(store.request.status).toBe("failed");
    expect(store.committed).toBeGreaterThan(0n);
    expect(store.committed).toBeLessThanOrEqual(store.request.effectiveCapMicrocredits);
  });

  it("logs unexpected compilation errors while returning a fixed public message", async () => {
    const store = new InMemoryWorkerStore();
    const pipeline = new ResearchPipeline(providersFor(store), store);
    const unexpectedError = new Error("Unexpected internal details.");
    const logged: Array<{ error: unknown; requestId: string }> = [];
    pipeline.run = async () => {
      throw unexpectedError;
    };
    const processor = new ContextJobProcessor(
      store,
      pipeline,
      new CapturingWebhookSender(),
      (error, id) => logged.push({ error, requestId: id }),
    );

    const response = await processor.process(requestId);

    expect(response).toMatchObject({
      status: "failed",
      error: { code: "model_error", message: "Context compilation failed." },
    });
    expect(logged).toEqual([{ error: unexpectedError, requestId }]);
  });

  it("charges preserved token usage when a paid 2xx model response is unusable", async () => {
    const store = new InMemoryWorkerStore();
    const processor = new ContextJobProcessor(
      store,
      new ResearchPipeline(providersFor(store, new BillableFailureDeepSeek()), store),
      new CapturingWebhookSender(),
    );
    const response = await processor.process(requestId);
    const modelEvent = [...store.costEvents.values()].find(
      (event) => event.provider === "deepseek",
    );

    expect(response).toMatchObject({ status: "failed", error: { code: "provider_error" } });
    expect(modelEvent?.status).toBe("settled");
    expect(modelEvent?.actualMicrocredits).toBe(
      priceModelTokensMicrocredits("deepseek-v4-flash", 120n, 30n),
    );
  });

  it("skips a duplicate delivery while the first claim is running", async () => {
    const store = new InMemoryWorkerStore({ status: "running", claimAttempt: 1 });
    const processor = new ContextJobProcessor(
      store,
      new ResearchPipeline(providersFor(store), store),
      new CapturingWebhookSender(),
    );
    const response = await processor.process(requestId);

    expect(response).toEqual({
      id: requestId,
      status: "skipped",
      reason: "Context request is already running.",
    });
    expect(store.providerLogs).toHaveLength(0);
  });
});

describe("free upstream operation floors", () => {
  it("keeps GitHub and Hacker News calls deliberately nonzero", () => {
    expect(priceToolOperationMicrocredits("github.user")).toBe(250_000n);
    expect(priceToolOperationMicrocredits("hacker_news_algolia.item")).toBe(250_000n);
  });
});

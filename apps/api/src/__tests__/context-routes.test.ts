import { describe, expect, it } from "vitest";
import type { ApiEnv } from "@supacontext/config";
import {
  getDepthCreditCost,
  hashApiKey,
  type ContextDepth,
  type PlanSlug,
  type RequestStatus,
} from "@supacontext/core";
import type { ApiKeyRow } from "@supacontext/db";
import { authorizeUsage } from "@supacontext/usage";
import { ApiError } from "../errors.js";
import { toPublicContextResponse, type StoredContextRequest, type StoredContextResultPayload } from "../public-response.js";
import type { EnqueueContextJobInput, EnqueueContextJobResult, QstashClient } from "../qstash.js";
import type { RateLimitInput, RateLimitResult, RateLimiter } from "../rate-limit.js";
import { buildServer } from "../server.js";
import {
  createContextRequestIdempotencyHash,
  type AcceptContextRequestInput,
  type AcceptContextRequestResult,
  type ContextStore,
  type FailContextRequestOptions,
} from "../store.js";
import type { ContextJobRunner, ContextJobRunResult } from "../worker-runner.js";

const secret = "test-secret-with-at-least-32-characters";
const rawKey = "sk_sc_test_key";
const workspaceId = "workspace_1";
const apiKeyId = "api_key_1";

function createEnv(): ApiEnv {
  return {
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    API_URL: "http://localhost:3001",
    WORKER_URL: "http://localhost:3002",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    API_KEY_HASH_SECRET: secret,
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    CORS_ALLOWED_ORIGINS: [],
    PORT: 3001,
    LOG_LEVEL: "fatal",
  };
}

class AllowRateLimiter implements RateLimiter {
  async check(_input: RateLimitInput): Promise<RateLimitResult> {
    return {
      allowed: true,
      limit: 999,
      remaining: 998,
      resetAt: new Date(Date.now() + 60_000),
    };
  }
}

class CapturingQstashClient implements QstashClient {
  readonly jobs: EnqueueContextJobInput[] = [];

  async enqueueContextJob(input: EnqueueContextJobInput): Promise<EnqueueContextJobResult> {
    this.jobs.push(input);

    return {
      messageId: `msg_${input.requestId}`,
    };
  }
}

class FailingQstashClient implements QstashClient {
  async enqueueContextJob(_input: EnqueueContextJobInput): Promise<EnqueueContextJobResult> {
    throw new ApiError(503, "internal_error", "Could not enqueue context job.");
  }
}

type InternalRequest = StoredContextRequest & {
  workspace_id: string;
  idempotency_key: string | null;
  idempotency_request_hash: string | null;
};

class InMemoryContextStore implements ContextStore {
  readonly ledger: Array<{ requestId: string; credits: number }> = [];
  private readonly apiKeysByHash = new Map<string, ApiKeyRow>();
  private readonly apiKeysById = new Map<string, ApiKeyRow>();
  private readonly requests = new Map<string, InternalRequest>();
  private readonly plans = new Map<string, PlanSlug>();
  private nextRequestNumber = 1;

  constructor(
    plan: PlanSlug = "builder",
    private balance = 500,
    maxDepth: ContextDepth = "deep",
  ) {
    const apiKey: ApiKeyRow = {
      id: apiKeyId,
      workspace_id: workspaceId,
      name: "Test key",
      key_hash: hashApiKey(rawKey, secret),
      prefix: rawKey.slice(0, 16),
      max_depth: maxDepth,
      monthly_credit_limit: null,
      month_to_date_credits: 0,
      last_used_at: null,
      revoked_at: null,
      created_at: new Date(),
    };

    this.apiKeysByHash.set(apiKey.key_hash, apiKey);
    this.apiKeysById.set(apiKey.id, apiKey);
    this.plans.set(workspaceId, plan);
  }

  get currentBalance(): number {
    return this.balance;
  }

  get apiKey(): ApiKeyRow {
    const apiKey = this.apiKeysById.get(apiKeyId);

    if (!apiKey) {
      throw new Error("Missing test API key.");
    }

    return apiKey;
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
    return this.apiKeysByHash.get(keyHash) ?? null;
  }

  async markApiKeyUsed(apiKeyIdToMark: string): Promise<void> {
    const apiKey = this.apiKeysById.get(apiKeyIdToMark);

    if (apiKey) {
      apiKey.last_used_at = new Date();
    }
  }

  async getWorkspacePlan(workspaceIdToRead: string): Promise<PlanSlug> {
    return this.plans.get(workspaceIdToRead) ?? "trial";
  }

  async findRequestById(
    workspaceIdToRead: string,
    requestId: string,
  ): Promise<StoredContextRequest | null> {
    const request = this.requests.get(requestId);

    return request?.workspace_id === workspaceIdToRead ? request : null;
  }

  async findRequestByIdempotencyKey(
    workspaceIdToRead: string,
    idempotencyKey: string,
    idempotencyRequestHash: string,
  ): Promise<StoredContextRequest | null> {
    const request =
      [...this.requests.values()].find(
        (storedRequest) =>
          storedRequest.workspace_id === workspaceIdToRead &&
          storedRequest.idempotency_key === idempotencyKey,
      ) ?? null;

    if (request && request.idempotency_request_hash !== idempotencyRequestHash) {
      throw new ApiError(
        409,
        "idempotency_key_conflict",
        "Idempotency-Key was already used with a different request payload.",
      );
    }

    return request;
  }

  async countActiveJobs(workspaceIdToRead: string, depth?: ContextDepth): Promise<number> {
    return [...this.requests.values()].filter(
      (request) =>
        request.workspace_id === workspaceIdToRead &&
        (request.status === "queued" || request.status === "running") &&
        (!depth || request.depth === depth),
    ).length;
  }

  async acceptContextRequest(input: AcceptContextRequestInput): Promise<AcceptContextRequestResult> {
    if (input.idempotencyKey) {
      const existing = await this.findRequestByIdempotencyKey(
        input.apiKey.workspace_id,
        input.idempotencyKey,
        createContextRequestIdempotencyHash(input),
      );

      if (existing) {
        return {
          request: existing,
          created: false,
        };
      }
    }

    const apiKey = this.apiKey;
    const authorization = authorizeUsage({
      plan: input.plan,
      depth: input.depth,
      balance: this.balance,
      apiKeyMaxDepth: apiKey.max_depth,
      monthlyCreditLimit: apiKey.monthly_credit_limit,
      monthToDateCredits: apiKey.month_to_date_credits,
    });

    if (!authorization.allowed) {
      if (authorization.reason === "credits") {
        throw new ApiError(402, "insufficient_credits", "Insufficient account credits.");
      }

      if (authorization.reason === "monthly_limit") {
        throw new ApiError(
          402,
          "insufficient_credits",
          "API key monthly credit limit would be exceeded.",
        );
      }

      throw new ApiError(
        403,
        "forbidden_depth",
        "Requested depth is not allowed for this API key or plan.",
      );
    }

    const credits = getDepthCreditCost(input.depth);
    const request: InternalRequest = {
      id: `ctx_test_${this.nextRequestNumber}`,
      workspace_id: input.apiKey.workspace_id,
      idempotency_key: input.idempotencyKey,
      idempotency_request_hash: input.idempotencyKey
        ? createContextRequestIdempotencyHash(input)
        : null,
      query: input.query,
      depth: input.depth,
      platforms: input.platforms,
      status: "queued",
      spent_credits: credits,
      error_code: null,
      error_message: null,
      result: null,
    };

    this.nextRequestNumber += 1;
    this.balance -= credits;
    apiKey.month_to_date_credits += credits;
    this.ledger.push({
      requestId: request.id,
      credits: credits * -1,
    });
    this.requests.set(request.id, request);

    return {
      request,
      created: true,
    };
  }

  async markRequestRunning(requestId: string): Promise<StoredContextRequest> {
    return this.updateStatus(requestId, "running");
  }

  async completeContextRequest(
    requestId: string,
    result: StoredContextResultPayload,
  ): Promise<StoredContextRequest> {
    const request = this.updateStatus(requestId, "completed") as InternalRequest;

    request.result = result;

    return request;
  }

  async attachQstashMessageId(_requestId: string, _messageId: string): Promise<void> {}

  async failContextRequest(
    requestId: string,
    errorCode: string,
    errorMessage: string,
    options: FailContextRequestOptions = {},
  ): Promise<void> {
    const request = this.updateStatus(requestId, "failed") as InternalRequest;

    if (options.refundCredits && request.spent_credits > 0) {
      const credits = request.spent_credits;

      request.spent_credits = 0;
      this.balance += credits;
      this.apiKey.month_to_date_credits -= credits;
      this.ledger.push({
        requestId,
        credits,
      });
    }

    request.error_code = errorCode;
    request.error_message = errorMessage;
  }

  async close(): Promise<void> {}

  private updateStatus(requestId: string, status: RequestStatus): StoredContextRequest {
    const request = this.requests.get(requestId);

    if (!request) {
      throw new ApiError(404, "job_not_found", "Context request not found.");
    }

    request.status = status;

    return request;
  }
}

function createCompletedResult(request: StoredContextRequest): StoredContextResultPayload {
  const sources = request.platforms.map((platform, index) => ({
    id: `src_${index + 1}`,
    title: `${platform} source`,
    url: `https://example.com/supacontext/${platform}`,
    platform,
  }));

  return {
    answer: `Worker-backed context for "${request.query}".`,
    context_pack: [
      {
        claim: "The request was processed by the worker runner.",
        confidence: "high",
        supporting_sources: sources.map((source) => source.id),
      },
    ],
    sources,
    gaps: [],
    usage: {
      credits_charged: request.spent_credits,
      depth: request.depth,
      platforms_used: request.platforms,
      sources_considered: sources.length,
      sources_used: sources.length,
      cached: false,
    },
  };
}

class CompletingWorkerRunner implements ContextJobRunner {
  constructor(private readonly store: InMemoryContextStore) {}

  async runContextJob(requestId: string): Promise<ContextJobRunResult> {
    const request = await this.store.findRequestById(workspaceId, requestId);

    if (!request) {
      return {
        id: requestId,
        status: "failed",
        error: {
          code: "job_not_found",
          message: "Context job not found.",
        },
      };
    }

    const result = createCompletedResult(request);
    await this.store.completeContextRequest(requestId, result);

    return {
      id: requestId,
      status: "completed",
      result,
    };
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    authorization: `Bearer ${rawKey}`,
    ...extra,
  };
}

describe("context API routes", () => {
  it("rejects invalid requests with a stable error code", async () => {
    const server = buildServer(createEnv(), {
      store: new InMemoryContextStore(),
      rateLimiter: new AllowRateLimiter(),
      qstash: new CapturingQstashClient(),
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: {
        depth: "standard",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_request",
      },
    });

    await server.close();
  });

  it("requires a valid API key", async () => {
    const store = new InMemoryContextStore();
    const server = buildServer(createEnv(), {
      store,
      rateLimiter: new AllowRateLimiter(),
      qstash: new CapturingQstashClient(),
    });

    const missing = await server.inject({
      method: "POST",
      url: "/v1/context",
      payload: {
        query: "latest API context tools",
      },
    });
    const invalid = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: {
        authorization: "Bearer sk_sc_wrong",
      },
      payload: {
        query: "latest API context tools",
      },
    });

    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(store.apiKey.last_used_at).toBeNull();

    await server.close();
  });

  it("enforces plan and API key depth restrictions", async () => {
    const trialServer = buildServer(createEnv(), {
      store: new InMemoryContextStore("trial", 500, "deep"),
      rateLimiter: new AllowRateLimiter(),
      qstash: new CapturingQstashClient(),
    });
    const keyLimitServer = buildServer(createEnv(), {
      store: new InMemoryContextStore("builder", 500, "standard"),
      rateLimiter: new AllowRateLimiter(),
      qstash: new CapturingQstashClient(),
    });

    const trialResponse = await trialServer.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: {
        query: "AI search APIs",
        depth: "deep",
      },
    });
    const keyLimitResponse = await keyLimitServer.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: {
        query: "AI search APIs",
        depth: "thorough",
      },
    });

    expect(trialResponse.statusCode).toBe(403);
    expect(trialResponse.json()).toMatchObject({ error: { code: "forbidden_depth" } });
    expect(keyLimitResponse.statusCode).toBe(403);
    expect(keyLimitResponse.json()).toMatchObject({ error: { code: "forbidden_depth" } });

    await trialServer.close();
    await keyLimitServer.close();
  });

  it("deducts credits once and returns a completed synchronous worker result", async () => {
    const store = new InMemoryContextStore("builder", 100);
    const server = buildServer(createEnv(), {
      store,
      rateLimiter: new AllowRateLimiter(),
      qstash: new CapturingQstashClient(),
      workerRunner: new CompletingWorkerRunner(store),
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: {
        query: "SupaContext competitors",
        platforms: ["web", "reddit"],
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: "completed",
      query: "SupaContext competitors",
      depth: "standard",
      usage: {
        credits_charged: 20,
        platforms_used: ["web", "reddit"],
        cached: false,
      },
    });
    expect(store.currentBalance).toBe(80);
    expect(store.ledger).toEqual([{ requestId: body.id, credits: -20 }]);
    expect(store.apiKey.month_to_date_credits).toBe(20);
    expect(store.apiKey.last_used_at).toBeInstanceOf(Date);

    await server.close();
  });

  it("does not expose internal failure messages in public responses", () => {
    const response = toPublicContextResponse({
      id: "ctx_failed",
      query: "SupaContext",
      depth: "standard",
      platforms: ["web"],
      status: "failed",
      spent_credits: 0,
      error_code: "internal_error",
      error_message: "connect ETIMEDOUT qstash.internal",
      result: null,
    });

    expect(response.gaps).toEqual(["The context request could not be queued. Please retry."]);
  });

  it("does not double-charge idempotent retries", async () => {
    const store = new InMemoryContextStore("builder", 100);
    const server = buildServer(createEnv(), {
      store,
      rateLimiter: new AllowRateLimiter(),
      qstash: new CapturingQstashClient(),
      workerRunner: new CompletingWorkerRunner(store),
    });
    const request = {
      method: "POST",
      url: "/v1/context",
      headers: authHeaders({
        "idempotency-key": "idem_1",
      }),
      payload: {
        query: "SupaContext pricing",
        depth: "fast",
      },
    } as const;

    const first = await server.inject(request);
    const second = await server.inject(request);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(store.currentBalance).toBe(95);
    expect(store.ledger).toHaveLength(1);

    await server.close();
  });

  it("rejects idempotency-key reuse with a different request body", async () => {
    const store = new InMemoryContextStore("builder", 100);
    const server = buildServer(createEnv(), {
      store,
      rateLimiter: new AllowRateLimiter(),
      qstash: new CapturingQstashClient(),
      workerRunner: new CompletingWorkerRunner(store),
    });
    const headers = authHeaders({
      "idempotency-key": "idem_conflict",
    });

    const first = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers,
      payload: {
        query: "SupaContext pricing",
        depth: "fast",
      },
    });
    const second = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers,
      payload: {
        query: "Different query",
        depth: "fast",
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: "idempotency_key_conflict" } });
    expect(store.currentBalance).toBe(95);
    expect(store.ledger).toHaveLength(1);

    await server.close();
  });

  it("refunds credits when asynchronous enqueue fails", async () => {
    const store = new InMemoryContextStore("builder", 100);
    const server = buildServer(createEnv(), {
      store,
      rateLimiter: new AllowRateLimiter(),
      qstash: new FailingQstashClient(),
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: {
        query: "new context APIs",
        async: true,
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "internal_error" } });
    expect(store.currentBalance).toBe(100);
    expect(store.ledger).toEqual([
      { requestId: "ctx_test_1", credits: -20 },
      { requestId: "ctx_test_1", credits: 20 },
    ]);
    expect(store.apiKey.month_to_date_credits).toBe(0);

    await server.close();
  });

  it("queues asynchronous requests and exposes status through GET", async () => {
    const store = new InMemoryContextStore("builder", 100);
    const qstash = new CapturingQstashClient();
    const server = buildServer(createEnv(), {
      store,
      rateLimiter: new AllowRateLimiter(),
      qstash,
    });

    const postResponse = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: {
        query: "new context APIs",
        async: true,
      },
    });
    const postBody = postResponse.json();
    const getResponse = await server.inject({
      method: "GET",
      url: `/v1/context/${postBody.id}`,
      headers: authHeaders(),
    });

    expect(postResponse.statusCode).toBe(202);
    expect(postBody).toEqual({
      id: postBody.id,
      status: "queued",
      credits_charged: 20,
    });
    expect(qstash.jobs).toHaveLength(1);
    expect(qstash.jobs[0]).toMatchObject({
      requestId: postBody.id,
      query: "new context APIs",
      depth: "standard",
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      id: postBody.id,
      status: "queued",
      answer: null,
      usage: {
        credits_charged: 20,
        sources_considered: 0,
      },
    });

    await server.close();
  });
});

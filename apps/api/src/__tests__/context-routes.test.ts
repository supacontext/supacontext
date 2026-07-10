import { describe, expect, it } from "vitest";
import type { ApiEnv } from "@supacontext/config";
import {
  CREDIT_MICROS,
  PLAN_RATE_LIMITS,
  creditMicrocreditsToDisplayNumber,
  hashApiKey,
  type PlanSlug,
  type RequestStatus,
  type ResolvedEffort,
} from "@supacontext/core";
import type { ApiKeyRow } from "@supacontext/db";
import { authorizeUsage } from "@supacontext/usage";
import { ApiError } from "../errors.js";
import type { EnqueueContextJobInput, EnqueueContextJobResult, QstashClient } from "../qstash.js";
import type { RateLimitInput, RateLimitResult, RateLimiter } from "../rate-limit.js";
import { buildServer } from "../server.js";
import {
  createContextRequestIdempotencyHash,
  type AcceptContextRequestInput,
  type AcceptContextRequestResult,
  type ContextStore,
} from "../store.js";
import {
  toPublicContextResponse,
  type StoredContextRequest,
  type StoredContextResultPayload,
} from "../public-response.js";
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
    return { messageId: `msg_${input.requestId}` };
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
  readonly ledger: Array<{ requestId: string; creditMicrocredits: bigint }> = [];
  private readonly requests = new Map<string, InternalRequest>();
  private acceptLock: Promise<void> = Promise.resolve();
  private requestNumber = 1;
  private balanceMicrocredits: bigint;
  readonly apiKey: ApiKeyRow;

  constructor(
    input: {
      balanceCredits?: number;
      maxEffort?: ResolvedEffort;
      monthlyLimitCredits?: number | null;
      plan?: PlanSlug;
    } = {},
  ) {
    this.balanceMicrocredits = BigInt(input.balanceCredits ?? 500) * CREDIT_MICROS;
    this.plan = input.plan ?? "builder";
    this.apiKey = {
      id: apiKeyId,
      workspace_id: workspaceId,
      name: "Test key",
      key_hash: hashApiKey(rawKey, secret),
      prefix: rawKey.slice(0, 16),
      max_effort: input.maxEffort ?? "x_high",
      monthly_credit_limit_microcredits:
        input.monthlyLimitCredits === undefined || input.monthlyLimitCredits === null
          ? null
          : BigInt(input.monthlyLimitCredits) * CREDIT_MICROS,
      month_to_date_microcredits: 0n,
      last_used_at: null,
      revoked_at: null,
      created_at: new Date(),
    };
  }

  private readonly plan: PlanSlug;

  get balance(): number {
    return creditMicrocreditsToDisplayNumber(this.balanceMicrocredits);
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRow | null> {
    return keyHash === this.apiKey.key_hash ? this.apiKey : null;
  }

  async markApiKeyUsed(apiKeyIdToMark: string): Promise<void> {
    if (apiKeyIdToMark === this.apiKey.id) {
      this.apiKey.last_used_at = new Date();
    }
  }

  async getWorkspacePlan(_workspaceId: string): Promise<PlanSlug> {
    return this.plan;
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
        (candidate) =>
          candidate.workspace_id === workspaceIdToRead &&
          candidate.idempotency_key === idempotencyKey,
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

  async acceptContextRequest(
    input: AcceptContextRequestInput,
  ): Promise<AcceptContextRequestResult> {
    const previous = this.acceptLock;
    let unlock: () => void = () => {};
    this.acceptLock = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;

    try {
      const requestHash = createContextRequestIdempotencyHash(input);

      if (input.idempotencyKey) {
        const existing = await this.findRequestByIdempotencyKey(
          input.apiKey.workspace_id,
          input.idempotencyKey,
          requestHash,
        );
        if (existing) {
          return { request: existing, created: false };
        }
      }

      if (input.async) {
        const active = [...this.requests.values()].filter(
          (request) => request.status === "queued" || request.status === "running",
        ).length;
        if (active >= PLAN_RATE_LIMITS[input.plan].concurrentJobs) {
          throw new ApiError(429, "rate_limited", "Concurrent job limit exceeded.");
        }
      }

      const authorization = authorizeUsage({
        effort: input.effort,
        balanceCreditMicros: this.balanceMicrocredits,
        callerMaxCreditMicros: input.callerMaxCreditMicros,
        apiKeyMaxEffort: this.apiKey.max_effort,
        monthlyCreditLimitMicros: this.apiKey.monthly_credit_limit_microcredits,
        monthToDateCreditMicros: this.apiKey.month_to_date_microcredits,
      });

      if (!authorization.allowed) {
        if (authorization.reason === "api_key_effort_restricted") {
          throw new ApiError(403, "forbidden_effort", "Effort is restricted for this key.");
        }
        if (authorization.reason === "caller_cap") {
          throw new ApiError(402, "budget_too_low", "max_credits is too low.");
        }
        throw new ApiError(402, "insufficient_credits", "Insufficient credits.");
      }

      const cap = authorization.reservationCreditMicros;
      const request: InternalRequest = {
        id: `ctx_test_${this.requestNumber}`,
        workspace_id: input.apiKey.workspace_id,
        idempotency_key: input.idempotencyKey,
        idempotency_request_hash: input.idempotencyKey ? requestHash : null,
        query: input.query,
        effort: input.effort,
        resolved_effort: input.effort === "auto" ? null : input.effort,
        max_resolved_effort: this.apiKey.max_effort,
        platforms: input.platforms,
        status: "queued",
        effective_cap_microcredits: cap,
        reserved_microcredits: cap,
        spent_microcredits: 0n,
        error_code: null,
        error_message: null,
        result: null,
      };

      this.requestNumber += 1;
      this.balanceMicrocredits -= cap;
      this.apiKey.month_to_date_microcredits += cap;
      this.ledger.push({ requestId: request.id, creditMicrocredits: -cap });
      this.requests.set(request.id, request);
      return { request, created: true };
    } finally {
      unlock();
    }
  }

  async attachQstashMessageId(_requestId: string, _messageId: string): Promise<void> {}

  async failContextRequest(
    requestId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const request = this.requireRequest(requestId);
    const release = request.reserved_microcredits;
    request.status = "failed";
    request.reserved_microcredits = 0n;
    request.error_code = errorCode;
    request.error_message = errorMessage;
    this.release(request, release);
  }

  complete(requestId: string, actualMicrocredits: bigint): StoredContextResultPayload {
    const request = this.requireRequest(requestId);
    if (actualMicrocredits > request.effective_cap_microcredits) {
      throw new Error("Test completion exceeded its reservation.");
    }

    const release = request.effective_cap_microcredits - actualMicrocredits;
    request.status = "completed";
    request.resolved_effort = request.effort === "auto" ? "low" : request.effort;
    request.reserved_microcredits = 0n;
    request.spent_microcredits = actualMicrocredits;
    const source = {
      id: "src_1",
      platform: request.platforms[0] ?? "web",
      title: "Public source",
      url: "https://example.com/source",
      published_at: "2026-07-01T00:00:00.000Z",
      summary: "Normalized public evidence.",
    };
    const result: StoredContextResultPayload = {
      answer: "Structured, cited context.",
      context_pack: [
        {
          claim: "A supported claim.",
          confidence: "high",
          supporting_sources: [source.id],
        },
      ],
      sources: [source],
      gaps: [],
      usage: {
        credits_charged: creditMicrocreditsToDisplayNumber(actualMicrocredits),
        credits_reserved: 0,
        effort: request.effort,
        resolved_effort: request.resolved_effort,
        platforms_used: request.platforms,
        sources_considered: 1,
        sources_used: 1,
        cached: false,
      },
    };
    request.result = result;
    this.release(request, release);
    return result;
  }

  async close(): Promise<void> {}

  private requireRequest(requestId: string): InternalRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new ApiError(404, "job_not_found", "Context request not found.");
    }
    return request;
  }

  private release(request: InternalRequest, amount: bigint): void {
    if (amount === 0n) {
      return;
    }
    this.balanceMicrocredits += amount;
    this.apiKey.month_to_date_microcredits -= amount;
    this.ledger.push({ requestId: request.id, creditMicrocredits: amount });
  }
}

class CompletingWorkerRunner implements ContextJobRunner {
  constructor(
    private readonly store: InMemoryContextStore,
    private readonly actualMicrocredits = 4_250_000n,
  ) {}

  async runContextJob(requestId: string): Promise<ContextJobRunResult> {
    const result = this.store.complete(requestId, this.actualMicrocredits);
    return {
      id: requestId,
      status: "completed",
      result: {
        resolved_effort: result.usage.resolved_effort,
        answer: result.answer,
        context_pack: result.context_pack,
        sources: result.sources,
        gaps: result.gaps,
        usage: result.usage,
      },
    };
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${rawKey}`, ...extra };
}

function serverFor(
  store: InMemoryContextStore,
  input: { qstash?: QstashClient; workerRunner?: ContextJobRunner } = {},
) {
  return buildServer(createEnv(), {
    store,
    rateLimiter: new AllowRateLimiter(),
    qstash: input.qstash ?? new CapturingQstashClient(),
    workerRunner: input.workerRunner ?? new CompletingWorkerRunner(store),
  });
}

describe("context API effort and reservation routes", () => {
  it("validates effort, max_credits, and rejects the removed depth field", async () => {
    const server = serverFor(new InMemoryContextStore());

    for (const payload of [
      { query: "research", effort: "extreme" },
      { query: "research", effort: "low", max_credits: 250.000001 },
      { query: "research", effort: "low", depth: "fast" },
    ]) {
      const response = await server.inject({
        method: "POST",
        url: "/v1/context",
        headers: authHeaders(),
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "invalid_request" } });
    }

    await server.close();
  });

  it("serializes fixed-point effort metadata without exposing bigint values", async () => {
    const server = serverFor(new InMemoryContextStore());
    const response = await server.inject({ method: "GET", url: "/v1/meta" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      pricing_version: "2026-07-10",
      efforts: {
        low: { minimum_credits: "3", maximum_credits: "20" },
        auto: { minimum_credits: "8", maximum_credits: "250" },
      },
    });

    await server.close();
  });

  it("reserves the lower caller cap and reports it on an async request", async () => {
    const store = new InMemoryContextStore({ balanceCredits: 100 });
    const qstash = new CapturingQstashClient();
    const server = serverFor(store, { qstash });
    const response = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: { query: "narrow lookup", effort: "low", max_credits: 4.5, async: true },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: "queued", credits_reserved: 4.5 });
    expect(store.balance).toBe(95.5);
    expect(qstash.jobs[0]).toMatchObject({ effort: "low", maxCredits: 4.5 });

    await server.close();
  });

  it("defines budget denial for low caller caps, key restrictions, and balances", async () => {
    const cases = [
      {
        store: new InMemoryContextStore(),
        payload: { query: "research", effort: "medium", max_credits: 5 },
        status: 402,
        code: "budget_too_low",
      },
      {
        store: new InMemoryContextStore({ maxEffort: "medium" }),
        payload: { query: "research", effort: "high" },
        status: 403,
        code: "forbidden_effort",
      },
      {
        store: new InMemoryContextStore({ balanceCredits: 2 }),
        payload: { query: "research", effort: "low" },
        status: 402,
        code: "insufficient_credits",
      },
    ];

    for (const testCase of cases) {
      const server = serverFor(testCase.store);
      const response = await server.inject({
        method: "POST",
        url: "/v1/context",
        headers: authHeaders(),
        payload: testCase.payload,
      });
      expect(response.statusCode).toBe(testCase.status);
      expect(response.json()).toMatchObject({ error: { code: testCase.code } });
      await server.close();
    }
  });

  it("settles synchronous requests against actual usage and releases the remainder", async () => {
    const store = new InMemoryContextStore({ balanceCredits: 100 });
    const server = serverFor(store, { workerRunner: new CompletingWorkerRunner(store) });
    const response = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: { query: "verified answer", effort: "medium", max_credits: 10 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      effort: "medium",
      resolved_effort: "medium",
      status: "completed",
      answer: "Structured, cited context.",
      usage: { credits_charged: 4.25, credits_reserved: 0 },
    });
    expect(store.balance).toBe(95.75);
    expect(store.ledger.map((entry) => entry.creditMicrocredits)).toEqual([
      -10n * CREDIT_MICROS,
      5_750_000n,
    ]);

    await server.close();
  });

  it("does not reserve twice for concurrent idempotent retries", async () => {
    const store = new InMemoryContextStore({ balanceCredits: 100 });
    const qstash = new CapturingQstashClient();
    const server = serverFor(store, { qstash });
    const request = {
      method: "POST" as const,
      url: "/v1/context",
      headers: authHeaders({ "idempotency-key": "same-request" }),
      payload: { query: "idempotent", effort: "low", max_credits: 8, async: true },
    };
    const [first, second] = await Promise.all([server.inject(request), server.inject(request)]);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(first.json().id).toBe(second.json().id);
    expect(store.balance).toBe(92);
    expect(store.ledger).toHaveLength(1);
    expect(qstash.jobs).toHaveLength(1);

    await server.close();
  });

  it("rejects idempotency-key reuse with a different priced payload", async () => {
    const store = new InMemoryContextStore();
    const server = serverFor(store);
    const headers = authHeaders({ "idempotency-key": "conflict" });

    await server.inject({
      method: "POST",
      url: "/v1/context",
      headers,
      payload: { query: "first", effort: "low", async: true },
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers,
      payload: { query: "second", effort: "medium", async: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "idempotency_key_conflict" } });

    await server.close();
  });

  it("releases an untouched reservation when enqueueing fails", async () => {
    const store = new InMemoryContextStore({ balanceCredits: 100 });
    const server = serverFor(store, { qstash: new FailingQstashClient() });
    const response = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: { query: "enqueue failure", effort: "low", async: true },
    });

    expect(response.statusCode).toBe(503);
    expect(store.balance).toBe(100);
    expect(store.ledger.map((entry) => entry.creditMicrocredits)).toEqual([
      -20n * CREDIT_MICROS,
      20n * CREDIT_MICROS,
    ]);

    await server.close();
  });

  it("serializes concurrent reservations so the balance never becomes negative", async () => {
    const store = new InMemoryContextStore({ balanceCredits: 10, plan: "builder" });
    const server = serverFor(store);
    const request = (key: string) => ({
      method: "POST" as const,
      url: "/v1/context",
      headers: authHeaders({ "idempotency-key": key }),
      payload: { query: key, effort: "low", max_credits: 8, async: true },
    });
    const responses = await Promise.all([
      server.inject(request("reservation-a")),
      server.inject(request("reservation-b")),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([202, 402]);
    expect(store.balance).toBe(2);

    await server.close();
  });

  it("returns queued ownership-scoped status with reservation details", async () => {
    const store = new InMemoryContextStore();
    const server = serverFor(store);
    const created = await server.inject({
      method: "POST",
      url: "/v1/context",
      headers: authHeaders(),
      payload: { query: "status", effort: "auto", max_credits: 12, async: true },
    });
    const response = await server.inject({
      method: "GET",
      url: `/v1/context/${created.json().id as string}`,
      headers: authHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      effort: "auto",
      status: "queued",
      answer: null,
      usage: { credits_charged: 0, credits_reserved: 12 },
    });

    await server.close();
  });
});

describe("public response safety", () => {
  it("does not expose stored internal failure messages", () => {
    const request: StoredContextRequest = {
      id: "ctx_failed",
      query: "failure",
      effort: "low",
      resolved_effort: "low",
      max_resolved_effort: "x_high",
      platforms: ["web"],
      status: "failed" as RequestStatus,
      effective_cap_microcredits: 20n * CREDIT_MICROS,
      reserved_microcredits: 0n,
      spent_microcredits: 1_500_000n,
      error_code: "provider_error",
      error_message: "secret upstream detail",
      result: null,
    };

    const safe = toPublicContextResponse(request);
    expect(JSON.stringify(safe)).not.toContain("secret upstream detail");
    expect(safe.gaps).toEqual([
      "The context request failed. Retry with the same idempotency key to inspect its result.",
    ]);
  });
});

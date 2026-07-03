import {
  PLATFORMS,
  contextRequestInputSchema,
  type ContextDepth,
  type Platform,
  type PlatformMode,
  type PublicContextResponse,
} from "@supacontext/core";
import { z } from "zod";
import { authenticateApiKey } from "./auth.js";
import { ApiError, formatZodError } from "./errors.js";
import { createPlaceholderResult, toPublicContextResponse } from "./public-response.js";
import type { QstashClient } from "./qstash.js";
import { PLAN_RATE_LIMITS, type RateLimiter } from "./rate-limit.js";
import type { ContextStore } from "./store.js";

const idempotencyKeySchema = z.string().trim().min(1).max(255);
const contextIdSchema = z.string().trim().regex(/^ctx_[A-Za-z0-9_-]+$/);

export type CreateContextRequestResult =
  | {
      statusCode: 200;
      body: PublicContextResponse;
    }
  | {
      statusCode: 202;
      body: {
        id: string;
        status: "queued";
        credits_charged: number;
      };
    };

export class ContextService {
  constructor(
    private readonly store: ContextStore,
    private readonly rateLimiter: RateLimiter,
    private readonly qstash: QstashClient,
    private readonly apiKeyHashSecret: string,
  ) {}

  async createContextRequest(input: {
    authorization: string | undefined;
    idempotencyKey: string | undefined;
    body: unknown;
  }): Promise<CreateContextRequestResult> {
    const apiKey = await authenticateApiKey({
      authorization: input.authorization,
      hashSecret: this.apiKeyHashSecret,
      store: this.store,
    });
    const parsed = contextRequestInputSchema.safeParse(input.body);

    if (!parsed.success) {
      throw formatZodError(parsed.error);
    }

    const idempotencyKey = this.parseIdempotencyKey(input.idempotencyKey);

    if (idempotencyKey) {
      const existing = await this.store.findRequestByIdempotencyKey(apiKey.workspace_id, idempotencyKey);

      if (existing) {
        if (parsed.data.async && existing.status === "queued") {
          return {
            statusCode: 202,
            body: {
              id: existing.id,
              status: "queued",
              credits_charged: existing.spent_credits,
            },
          };
        }

        return {
          statusCode: 200,
          body: toPublicContextResponse(existing),
        };
      }
    }

    const plan = await this.store.getWorkspacePlan(apiKey.workspace_id);
    await this.enforceRateLimit(apiKey.workspace_id, plan);
    await this.enforceConcurrency({
      workspaceId: apiKey.workspace_id,
      plan,
      depth: parsed.data.depth,
      isAsync: parsed.data.async,
    });

    const platformSelection = this.resolvePlatforms(parsed.data.platforms);
    const accepted = await this.store.acceptContextRequest({
      apiKey,
      plan,
      query: parsed.data.query,
      depth: parsed.data.depth,
      platforms: platformSelection.platforms,
      platformMode: platformSelection.mode,
      idempotencyKey,
      webhookUrl: parsed.data.webhook_url ?? null,
      metadata: parsed.data.metadata ?? {},
    });

    if (!accepted.created) {
      return parsed.data.async && accepted.request.status === "queued"
        ? {
            statusCode: 202,
            body: {
              id: accepted.request.id,
              status: "queued",
              credits_charged: accepted.request.spent_credits,
            },
          }
        : {
            statusCode: 200,
            body: toPublicContextResponse(accepted.request),
          };
    }

    if (parsed.data.async) {
      try {
        const job = await this.qstash.enqueueContextJob({
          requestId: accepted.request.id,
          workspaceId: apiKey.workspace_id,
          query: parsed.data.query,
          depth: parsed.data.depth,
          platforms: platformSelection.platforms,
          ...(parsed.data.webhook_url ? { webhookUrl: parsed.data.webhook_url } : {}),
          ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {}),
        });

        await this.store.attachQstashMessageId(accepted.request.id, job.messageId);
      } catch (error) {
        await this.store.failContextRequest(
          accepted.request.id,
          "QUEUE_UNAVAILABLE",
          error instanceof Error ? error.message : "Could not enqueue context job.",
        );
        throw error;
      }

      return {
        statusCode: 202,
        body: {
          id: accepted.request.id,
          status: "queued",
          credits_charged: accepted.request.spent_credits,
        },
      };
    }

    const running = await this.store.markRequestRunning(accepted.request.id);
    const placeholderResult = createPlaceholderResult({
      id: running.id,
      query: running.query,
      depth: running.depth,
      platforms: running.platforms,
      creditsCharged: running.spent_credits,
    });
    const completed = await this.store.completeContextRequest(running.id, placeholderResult);

    return {
      statusCode: 200,
      body: toPublicContextResponse(completed),
    };
  }

  async getContextRequest(input: {
    authorization: string | undefined;
    requestId: string;
  }): Promise<PublicContextResponse> {
    const apiKey = await authenticateApiKey({
      authorization: input.authorization,
      hashSecret: this.apiKeyHashSecret,
      store: this.store,
    });
    const parsedId = contextIdSchema.safeParse(input.requestId);

    if (!parsedId.success) {
      throw new ApiError(404, "NOT_FOUND", "Context request not found.");
    }

    const request = await this.store.findRequestById(apiKey.workspace_id, parsedId.data);

    if (!request) {
      throw new ApiError(404, "NOT_FOUND", "Context request not found.");
    }

    return toPublicContextResponse(request);
  }

  private resolvePlatforms(platforms: Platform[] | undefined): {
    platforms: Platform[];
    mode: PlatformMode;
  } {
    if (platforms) {
      return {
        platforms,
        mode: "manual",
      };
    }

    return {
      platforms: [...PLATFORMS],
      mode: "auto",
    };
  }

  private parseIdempotencyKey(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    const parsed = idempotencyKeySchema.safeParse(value);

    if (!parsed.success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid Idempotency-Key header.");
    }

    return parsed.data;
  }

  private async enforceRateLimit(workspaceId: string, plan: keyof typeof PLAN_RATE_LIMITS): Promise<void> {
    const result = await this.rateLimiter.check({
      workspaceId,
      plan,
    });

    if (!result.allowed) {
      throw new ApiError(429, "RATE_LIMITED", "Rate limit exceeded.", {
        limit: result.limit,
        remaining: result.remaining,
        reset_at: result.resetAt.toISOString(),
      });
    }
  }

  private async enforceConcurrency(input: {
    workspaceId: string;
    plan: keyof typeof PLAN_RATE_LIMITS;
    depth: ContextDepth;
    isAsync: boolean;
  }): Promise<void> {
    if (!input.isAsync) {
      return;
    }

    const limits = PLAN_RATE_LIMITS[input.plan];
    const activeJobs = await this.store.countActiveJobs(input.workspaceId);

    if (activeJobs >= limits.concurrentJobs) {
      throw new ApiError(429, "CONCURRENCY_LIMIT_EXCEEDED", "Concurrent job limit exceeded.");
    }

    if (input.depth === "deep") {
      const activeDeepJobs = await this.store.countActiveJobs(input.workspaceId, "deep");

      if (activeDeepJobs >= limits.deepConcurrentJobs) {
        throw new ApiError(429, "CONCURRENCY_LIMIT_EXCEEDED", "Concurrent deep job limit exceeded.");
      }
    }
  }
}

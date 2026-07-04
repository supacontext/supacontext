import {
  PLATFORMS,
  type Platform,
  type PlatformMode,
  type PlanSlug,
  type PublicContextResponse,
} from "@supacontext/core";
import { contextRequestInputSchema } from "@supacontext/core/validation";
import { z } from "zod";
import { authenticateApiKey } from "./auth.js";
import { ApiError, formatZodError } from "./errors.js";
import { toPublicContextResponse } from "./public-response.js";
import type { QstashClient } from "./qstash.js";
import type { RateLimiter } from "./rate-limit.js";
import { createContextRequestIdempotencyHash, type ContextStore } from "./store.js";
import {
  mapWorkerFailureToApiError,
  type ContextJobRunner,
  type ContextJobRunResult,
} from "./worker-runner.js";

const idempotencyKeySchema = z.string().trim().min(1).max(255);
const contextIdSchema = z
  .string()
  .trim()
  .regex(/^ctx_[A-Za-z0-9_-]+$/);

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
    private readonly workerRunner: ContextJobRunner,
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
    const parsed = await contextRequestInputSchema.safeParseAsync(input.body);

    if (!parsed.success) {
      throw formatZodError(parsed.error);
    }

    const idempotencyKey = this.parseIdempotencyKey(input.idempotencyKey);
    const platformSelection = this.resolvePlatforms(parsed.data.platforms);
    const idempotencyRequestHash = createContextRequestIdempotencyHash({
      query: parsed.data.query,
      depth: parsed.data.depth,
      platforms: platformSelection.platforms,
      platformMode: platformSelection.mode,
      async: parsed.data.async,
      webhookUrl: parsed.data.webhook_url ?? null,
      metadata: parsed.data.metadata ?? {},
    });

    if (idempotencyKey) {
      const existing = await this.store.findRequestByIdempotencyKey(
        apiKey.workspace_id,
        idempotencyKey,
        idempotencyRequestHash,
      );

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
    const accepted = await this.store.acceptContextRequest({
      apiKey,
      plan,
      query: parsed.data.query,
      depth: parsed.data.depth,
      platforms: platformSelection.platforms,
      platformMode: platformSelection.mode,
      async: parsed.data.async,
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
          "internal_error",
          error instanceof Error ? error.message : "Could not enqueue context job.",
          { refundCredits: true },
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

    await this.store.markRequestRunning(accepted.request.id);
    let job: ContextJobRunResult;

    try {
      job = await this.workerRunner.runContextJob(accepted.request.id);
    } catch (error) {
      await this.store.failContextRequest(
        accepted.request.id,
        "internal_error",
        error instanceof Error ? error.message : "Context worker failed to process the request.",
        { refundCredits: true },
      );
      throw error;
    }

    if (job.status === "failed") {
      throw mapWorkerFailureToApiError(job.error);
    }

    const completed = await this.store.findRequestById(apiKey.workspace_id, accepted.request.id);

    if (!completed) {
      throw new ApiError(404, "job_not_found", "Context request not found.");
    }

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
      throw new ApiError(404, "job_not_found", "Context request not found.");
    }

    const request = await this.store.findRequestById(apiKey.workspace_id, parsedId.data);

    if (!request) {
      throw new ApiError(404, "job_not_found", "Context request not found.");
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
      throw new ApiError(400, "invalid_request", "Invalid Idempotency-Key header.");
    }

    return parsed.data;
  }

  private async enforceRateLimit(workspaceId: string, plan: PlanSlug): Promise<void> {
    const result = await this.rateLimiter.check({
      workspaceId,
      plan,
    });

    if (!result.allowed) {
      throw new ApiError(429, "rate_limited", "Rate limit exceeded.", {
        limit: result.limit,
        remaining: result.remaining,
        reset_at: result.resetAt.toISOString(),
      });
    }
  }
}

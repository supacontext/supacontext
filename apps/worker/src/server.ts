import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { WorkerEnv } from "@supacontext/config";
import { createDatabaseClient } from "@supacontext/db";
import {
  NormalizedProviderError,
  createProviderClients,
  type ProviderClients,
} from "@supacontext/providers";
import { z } from "zod";
import { BudgetExhaustedError } from "./budget.js";
import { ResearchPipeline } from "./pipeline.js";
import type { PublicContextResult } from "./public-result.js";
import { verifyInternalToken, verifyQstashSignature } from "./qstash-signature.js";
import { PostgresWorkerStore, type WorkerContextRequest, type WorkerStore } from "./store.js";
import { HttpWebhookSender, type WebhookPayload, type WebhookSender } from "./webhook.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export type WorkerServerDependencies = {
  store?: WorkerStore;
  providers?: ProviderClients;
  webhookSender?: WebhookSender;
};

export type ContextJobResponse =
  | {
      id: string;
      status: "completed";
      result: PublicContextResult;
    }
  | {
      id: string;
      status: "failed";
      error: {
        code: string;
        message: string;
      };
    }
  | {
      id: string;
      status: "skipped";
      reason: string;
    };

const contextJobSchema = z
  .object({
    requestId: z
      .string()
      .trim()
      .regex(/^ctx_[A-Za-z0-9_-]+$/),
  })
  .passthrough();

function expectedQstashUrl(workerUrl: string, requestUrl: string): string {
  return new URL(requestUrl, `${workerUrl.replace(/\/$/, "")}/`).toString();
}

export function buildServer(
  env: WorkerEnv,
  dependencies: WorkerServerDependencies = {},
): FastifyInstance {
  const store =
    dependencies.store ??
    new PostgresWorkerStore(
      createDatabaseClient({
        url: env.DATABASE_URL,
      }),
    );
  const providers =
    dependencies.providers ??
    createProviderClients({
      mode: env.NODE_ENV === "production" ? "real" : "auto",
      env: {
        nodeEnv: env.NODE_ENV,
        exaApiKey: env.EXA_API_KEY,
        fetchLayerApiKey: env.FETCHLAYER_API_KEY,
        apiDirectApiKey: env.API_DIRECT_API_KEY,
        supadataApiKey: env.SUPADATA_API_KEY,
        githubPat: env.GITHUB_TOKEN,
        deepseekApiKey: env.DEEPSEEK_API_KEY,
        groqApiKey: env.GROQ_API_KEY,
        voyageApiKey: env.VOYAGE_API_KEY,
      },
      logger: (input) => store.saveProviderCallLog(input),
    });
  const webhookSender = dependencies.webhookSender ?? new HttpWebhookSender();
  const processor = new ContextJobProcessor(
    store,
    new ResearchPipeline(providers, store),
    webhookSender,
  );
  const server = Fastify({
    bodyLimit: 64 * 1024,
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  server.removeContentTypeParser("application/json");
  server.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");

    request.rawBody = rawBody;

    try {
      done(null, rawBody ? (JSON.parse(rawBody) as unknown) : {});
    } catch (error) {
      done(error instanceof Error ? error : new Error("Invalid JSON payload."));
    }
  });

  if (env.NODE_ENV === "production") {
    server.addHook("preHandler", async (request, reply) => {
      if (!request.url.startsWith("/v1/jobs/context")) {
        return;
      }

      const signatureHeader = request.headers["upstash-signature"];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
      const tokenHeader = request.headers["x-supacontext-worker-token"];
      const internalToken = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
      const validInternalToken = verifyInternalToken({
        candidate: internalToken,
        expected: env.WORKER_INTERNAL_TOKEN,
      });
      const validQstashSignature = verifyQstashSignature({
        signature,
        currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
        body: request.rawBody,
        url: expectedQstashUrl(env.WORKER_URL, request.url),
      });

      if (!validInternalToken && !validQstashSignature) {
        return reply.code(401).send({
          error: {
            code: "unauthorized",
            message: "Invalid QStash signature.",
          },
        });
      }
    });
  }

  server.addHook("onClose", async () => {
    await store.close();
  });

  server.get("/health", async () => ({
    ok: true,
    service: "supacontext-worker",
    providers: Object.keys(providers),
  }));

  server.post("/v1/jobs/context", async (request, reply) => {
    const parsed = contextJobSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Invalid context job payload.",
        },
      });
    }

    const result = await processor.process(parsed.data.requestId);

    return reply.code(200).send(result);
  });

  server.post<{ Params: { id: string } }>("/v1/jobs/context/:id", async (request, reply) => {
    const parsed = contextJobSchema.safeParse({
      requestId: request.params.id,
    });

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "invalid_request",
          message: "Invalid context job id.",
        },
      });
    }

    const result = await processor.process(parsed.data.requestId);

    return reply.code(200).send(result);
  });

  return server;
}

export class ContextJobProcessor {
  constructor(
    private readonly store: WorkerStore,
    private readonly pipeline: ResearchPipeline,
    private readonly webhookSender: WebhookSender,
  ) {}

  async process(requestId: string): Promise<ContextJobResponse> {
    const claim = await this.store.claimRequest(requestId);
    const request = claim.request;

    if (!request) {
      return {
        id: requestId,
        status: "failed",
        error: {
          code: "job_not_found",
          message: "Context request not found.",
        },
      };
    }

    if (!claim.claimed && request.status === "running") {
      return {
        id: request.id,
        status: "skipped",
        reason: "Context request is already running.",
      };
    }

    if (request.status === "completed") {
      return {
        id: request.id,
        status: "skipped",
        reason: "Context request is already completed.",
      };
    }

    if (request.status === "failed" || request.status === "cancelled") {
      return {
        id: request.id,
        status: "skipped",
        reason: `Context request is already ${request.status}.`,
      };
    }

    try {
      const run = await this.pipeline.run(requestToPipelineInput(request));
      await this.store.completeRequest(request.id, run.resolvedEffort, run.result);
      await this.sendWebhook(request, {
        id: request.id,
        status: "completed",
        result: run.result,
      });

      return {
        id: request.id,
        status: "completed",
        result: run.result,
      };
    } catch (error) {
      const failure = normalizeJobFailure(error);
      await this.store.failRequest(request.id, failure.code, failure.message);
      await this.sendWebhook(request, {
        id: request.id,
        status: "failed",
        error: failure,
      });

      return {
        id: request.id,
        status: "failed",
        error: failure,
      };
    }
  }

  private async sendWebhook(request: WorkerContextRequest, payload: WebhookPayload): Promise<void> {
    if (!request.webhookUrl) {
      return;
    }

    try {
      await this.webhookSender.send(request.webhookUrl, payload);
    } catch {
      // Webhook delivery is best-effort for the job lifecycle; result persistence remains authoritative.
    }
  }
}

function requestToPipelineInput(
  request: WorkerContextRequest,
): Parameters<ResearchPipeline["run"]>[0] {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    query: request.query,
    effort: request.effort,
    maxResolvedEffort: request.maxResolvedEffort,
    platforms: request.platforms,
    platformMode: request.platformMode,
    effectiveCapMicrocredits: request.effectiveCapMicrocredits,
    committedMicrocredits: request.committedMicrocredits,
    claimAttempt: request.claimAttempt,
  };
}

function normalizeJobFailure(error: unknown): { code: string; message: string } {
  if (error instanceof BudgetExhaustedError) {
    return {
      code: "budget_exhausted",
      message: error.message,
    };
  }

  if (error instanceof NormalizedProviderError) {
    return {
      code: "provider_error",
      message: `${error.provider} provider failed while compiling context.`,
    };
  }

  if (error instanceof Error && error.message.includes("invalid JSON")) {
    return {
      code: "invalid_model_output",
      message: "The research model returned invalid JSON after one repair attempt.",
    };
  }

  return {
    code: "model_error",
    message: "Context compilation failed.",
  };
}

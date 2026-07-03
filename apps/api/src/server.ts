import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "@supacontext/config";
import { getDepthCreditCost, PLANS } from "@supacontext/core";
import { createDatabaseClient } from "@supacontext/db";
import { ZodError } from "zod";
import { ContextService } from "./context-service.js";
import { ApiError, formatError, formatZodError } from "./errors.js";
import { createQstashClient, type QstashClient } from "./qstash.js";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";
import { PostgresContextStore, type ContextStore } from "./store.js";

export type ServerDependencies = {
  store?: ContextStore;
  rateLimiter?: RateLimiter;
  qstash?: QstashClient;
  contextService?: ContextService;
};

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function buildServer(env: ApiEnv, dependencies: ServerDependencies = {}): FastifyInstance {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });
  const store =
    dependencies.store ??
    new PostgresContextStore(
      createDatabaseClient({
        url: env.DATABASE_URL,
      }),
    );
  const rateLimiter =
    dependencies.rateLimiter ??
    createRateLimiter({
      nodeEnv: env.NODE_ENV,
      redisUrl: env.UPSTASH_REDIS_REST_URL,
      redisToken: env.UPSTASH_REDIS_REST_TOKEN,
      warn: (message) => server.log.warn(message),
    });
  const qstash =
    dependencies.qstash ??
    createQstashClient({
      nodeEnv: env.NODE_ENV,
      qstashToken: env.QSTASH_TOKEN,
      workerUrl: env.WORKER_URL,
      warn: (message) => server.log.warn(message),
    });
  const contextService =
    dependencies.contextService ??
    new ContextService(store, rateLimiter, qstash, env.API_KEY_HASH_SECRET);

  server.register(cors, {
    origin: env.APP_URL,
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      void reply.code(error.statusCode).send(formatError(error));
      return;
    }

    if (error instanceof ZodError) {
      const apiError = formatZodError(error);
      void reply.code(apiError.statusCode).send(formatError(apiError));
      return;
    }

    request.log.error(error);
    void reply.code(500).send(
      formatError(new ApiError(500, "INTERNAL_ERROR", "Internal server error.")),
    );
  });

  server.addHook("onClose", async () => {
    await store.close();
  });

  server.get("/health", async () => ({
    ok: true,
    service: "supacontext-api",
  }));

  server.get("/v1/meta", async () => ({
    product: "SupaContext",
    depths: {
      fast: getDepthCreditCost("fast"),
      standard: getDepthCreditCost("standard"),
      thorough: getDepthCreditCost("thorough"),
      deep: getDepthCreditCost("deep"),
    },
    plans: PLANS,
  }));

  server.post("/v1/context", async (request, reply) => {
    const result = await contextService.createContextRequest({
      authorization: request.headers.authorization,
      idempotencyKey: readHeader(request.headers["idempotency-key"]),
      body: request.body,
    });

    return reply.code(result.statusCode).send(result.body);
  });

  server.get<{ Params: { id: string } }>("/v1/context/:id", async (request) =>
    contextService.getContextRequest({
      authorization: request.headers.authorization,
      requestId: request.params.id,
    }),
  );

  return server;
}

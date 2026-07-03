import cors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "@supacontext/config";
import { getDepthCreditCost, PLANS } from "@supacontext/core";

export function buildServer(env: ApiEnv): FastifyInstance {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  server.register(cors, {
    origin: env.APP_URL,
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

  return server;
}


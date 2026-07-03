import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { WorkerEnv } from "@supacontext/config";
import { createProviderClients } from "@supacontext/providers";

export function buildServer(env: WorkerEnv): FastifyInstance {
  const providers = createProviderClients();
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  server.get("/health", async () => ({
    ok: true,
    service: "supacontext-worker",
    providers: Object.keys(providers),
  }));

  return server;
}


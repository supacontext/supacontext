import { pathToFileURL } from "node:url";
import { getApiEnv } from "@supacontext/config";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = getApiEnv();
  const server = buildServer(env);
  let isClosing = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isClosing) {
      return;
    }

    isClosing = true;
    const forceExitTimer = setTimeout(() => {
      server.log.error({ signal }, "Timed out shutting down SupaContext API.");
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.log.info({ signal }, "Shutting down SupaContext API.");

    try {
      await server.close();
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      server.log.error(error, "Failed to shut down SupaContext API cleanly.");
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  await server.listen({
    host: "0.0.0.0",
    port: env.PORT,
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypoint === import.meta.url) {
  await main();
}


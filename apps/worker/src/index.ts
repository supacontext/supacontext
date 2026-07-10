import { pathToFileURL } from "node:url";
import { getWorkerEnv } from "@supacontext/config";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = getWorkerEnv();
  const server = buildServer(env);

  await server.listen({
    host: "0.0.0.0",
    port: env.WORKER_PORT,
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypoint === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error("Failed to start Supacontext worker.", error);
    process.exit(1);
  }
}

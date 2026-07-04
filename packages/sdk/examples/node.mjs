import { createSupaContext } from "@supacontext/sdk";

if (!process.env.SUPACONTEXT_API_KEY) {
  throw new Error("Set SUPACONTEXT_API_KEY before running this example.");
}

const supacontext = createSupaContext({
  apiKey: process.env.SUPACONTEXT_API_KEY,
  baseUrl: process.env.SUPACONTEXT_API_URL,
});

const created = await supacontext.context.create(
  {
    query: "What changed in AI agent tooling this week?",
    depth: "standard",
    platforms: ["web", "reddit", "youtube"],
    async: true,
  },
  {
    idempotencyKey: `demo-${Date.now()}`,
  },
);

const result =
  created.status === "queued"
    ? await supacontext.context.poll(created.id, { intervalMs: 1500 })
    : created;

console.log(JSON.stringify(result, null, 2));

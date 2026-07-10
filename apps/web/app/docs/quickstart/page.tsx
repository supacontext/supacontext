import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "../../../components/site-header";

const curlExample = `curl -X POST "$SUPACONTEXT_API_URL/v1/context" \\
  -H "Authorization: Bearer $SUPACONTEXT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: quickstart-1" \\
  -d '{
    "query": "current best practices for Next.js app router auth",
    "effort": "auto",
    "max_credits": 50,
    "platforms": ["web", "reddit", "youtube", "github"]
  }'`;

const sdkExample = `import { createSupaContext } from "@supacontext/sdk";

const supacontext = createSupaContext({
  apiKey: process.env.SUPACONTEXT_API_KEY,
  baseUrl: process.env.SUPACONTEXT_API_URL
});

const created = await supacontext.context.create({
  query: "current best practices for Next.js app router auth",
  effort: "auto",
  max_credits: 50,
  async: true
});

const result = created.status === "queued"
  ? await supacontext.context.poll(created.id)
  : created;`;

const fetchExample = `const response = await fetch(\`\${process.env.SUPACONTEXT_API_URL}/v1/context\`, {
  method: "POST",
  headers: {
    "authorization": \`Bearer \${process.env.SUPACONTEXT_API_KEY}\`,
    "content-type": "application/json",
    "idempotency-key": "quickstart-1"
  },
  body: JSON.stringify({
    query: "current best practices for Next.js app router auth",
    effort: "medium",
    max_credits: 30
  })
});

const data = await response.json();`;

export default function QuickstartPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero">
          <p className="eyebrow">Quickstart</p>
          <h1>Make your first context request.</h1>
          <p className="heroText">
            Create an API key in the dashboard, choose an effort or use Auto, and send a JSON
            request to the context endpoint. Supacontext returns structured cited JSON while raw
            provider output stays internal.
          </p>
          <Link className="button primaryButton heroButton" href="/keys">
            Create API key
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </section>

        <section className="docsLayout">
          <aside className="docsToc">
            <a href="#local">Local</a>
            <a href="#curl">curl</a>
            <a href="#sdk">JS SDK</a>
            <a href="#fetch">fetch</a>
            <a href="#response">Response</a>
          </aside>
          <article className="docsArticle">
            <h2 id="local">1. Local development</h2>
            <pre>{`pnpm install
cp .env.example .env
pnpm supabase start
pnpm supabase db reset
pnpm dev`}</pre>

            <h2>2. Set environment variables</h2>
            <pre>{`SUPACONTEXT_API_URL=http://localhost:3001
SUPACONTEXT_API_KEY=sk_sc_...`}</pre>

            <h2 id="curl">3. Send a request with curl</h2>
            <pre>{curlExample}</pre>

            <h2 id="sdk">4. Use the JavaScript SDK</h2>
            <pre>{sdkExample}</pre>

            <h2 id="fetch">5. Use direct fetch</h2>
            <pre>{fetchExample}</pre>

            <h2 id="response">6. Read compact cited JSON</h2>
            <pre>{`{
  "id": "ctx_...",
  "query": "current best practices...",
  "effort": "auto",
  "resolved_effort": "medium",
  "status": "completed",
  "answer": "...",
  "context_pack": [{
    "claim": "...",
    "confidence": "high",
    "supporting_sources": ["src_1"]
  }],
  "sources": [{
    "id": "src_1",
    "platform": "web",
    "title": "...",
    "url": "https://example.com/source",
    "published_at": "2026-07-10T00:00:00.000Z",
    "summary": "..."
  }],
  "gaps": [],
  "usage": {
    "credits_charged": 8.25,
    "credits_reserved": 0,
    "effort": "auto",
    "resolved_effort": "medium",
    "platforms_used": ["web"],
    "sources_considered": 7,
    "sources_used": 1,
    "cached": false
  }
}`}</pre>
          </article>
        </section>
      </main>
    </>
  );
}

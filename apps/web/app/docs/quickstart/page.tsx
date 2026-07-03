import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "../../../components/site-header";

const curlExample = `curl -X POST "$SUPACONTEXT_API_URL/v1/context" \\
  -H "Authorization: Bearer $SUPACONTEXT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: quickstart-1" \\
  -d '{
    "query": "current best practices for Next.js app router auth",
    "depth": "standard",
    "platforms": ["web", "reddit", "youtube"]
  }'`;

const sdkExample = `import { createSupaContext } from "@supacontext/sdk";

const supacontext = createSupaContext({
  apiKey: process.env.SUPACONTEXT_API_KEY,
  baseUrl: process.env.SUPACONTEXT_API_URL
});

const created = await supacontext.context.create({
  query: "current best practices for Next.js app router auth",
  depth: "standard",
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
    depth: "standard"
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
            Create an API key in the dashboard, choose a depth, and send a JSON request to the
            context endpoint.
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
  "depth": "standard",
  "status": "completed",
  "answer": "...",
  "context_pack": [],
  "sources": [],
  "gaps": [],
  "usage": {
    "credits_charged": 20,
    "sources_used": 4
  }
}`}</pre>
          </article>
        </section>
      </main>
    </>
  );
}

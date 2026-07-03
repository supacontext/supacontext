import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "../../../components/site-header";

const curlExample = `curl -X POST "$SUPACONTEXT_API_URL/v1/context" \\
  -H "Authorization: Bearer $SUPACONTEXT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "current best practices for Next.js app router auth",
    "depth": "standard",
    "platforms": ["web", "reddit", "youtube"]
  }'`;

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
            <a href="#install">Install</a>
            <a href="#request">Request</a>
            <a href="#response">Response</a>
          </aside>
          <article className="docsArticle">
            <h2 id="install">1. Set environment variables</h2>
            <pre>{`SUPACONTEXT_API_URL=http://localhost:3001
SUPACONTEXT_API_KEY=sk_sc_...`}</pre>

            <h2 id="request">2. Send a request</h2>
            <pre>{curlExample}</pre>

            <h2 id="response">3. Read compact cited JSON</h2>
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

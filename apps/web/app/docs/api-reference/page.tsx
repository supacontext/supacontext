import { DEPTH_CREDIT_COST, PLAN_RATE_LIMITS, PLATFORMS } from "@supacontext/core";
import { SiteHeader } from "../../../components/site-header";

const toolSchema = `{
  "name": "supacontext",
  "description": "Get compact, cited, up-to-date public context for an AI agent.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "The research question or context request."
      },
      "depth": {
        "type": "string",
        "enum": ["fast", "standard", "thorough", "deep"],
        "description": "Optional. Deep is only for the most demanding, broad, high-importance, or exhaustive research tasks where cost and latency are justified."
      },
      "platforms": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["web", "reddit", "x", "youtube"]
        },
        "description": "Optional. Omit to use all supported public platforms."
      }
    },
    "required": ["query"],
    "additionalProperties": false
  }
}`;

const errorCodes = [
  "invalid_request",
  "unauthorized",
  "forbidden_depth",
  "insufficient_credits",
  "rate_limited",
  "provider_error",
  "model_error",
  "invalid_model_output",
  "job_not_found",
  "idempotency_key_conflict",
  "internal_error",
];

export default function ApiReferencePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero">
          <p className="eyebrow">API reference</p>
          <h1>JSON context endpoint for agents.</h1>
          <p className="heroText">
            The main API accepts one context request and returns public structured JSON. It is not a
            raw search, scrape, or provider-output endpoint.
          </p>
        </section>

        <section className="docsLayout">
          <aside className="docsToc">
            <a href="#schema">Tool schema</a>
            <a href="#auth">Authentication</a>
            <a href="#pricing">Pricing</a>
            <a href="#depth-guide">Depth guide</a>
            <a href="#platform-guide">Platform guide</a>
            <a href="#jobs">Async jobs</a>
            <a href="#webhooks">Webhooks</a>
            <a href="#errors">Errors</a>
            <a href="#deploy">Deploy</a>
            <a href="#env">Env vars</a>
          </aside>
          <article className="docsArticle">
            <h2 id="schema">Tool schema for agents</h2>
            <pre>{toolSchema}</pre>

            <h2 id="auth">Authentication</h2>
            <p>
              Send API keys with <code>Authorization: Bearer sk_sc_...</code>. Keys are scoped to a
              workspace, can set a monthly credit limit, and can cap max depth.
            </p>
            <p>
              Store keys server-side only. Do not put Supacontext keys in browser bundles, public
              mobile clients, logs, analytics events, or support screenshots.
            </p>

            <h2 id="pricing">Pricing and credits</h2>
            <div className="rows">
              {Object.entries(DEPTH_CREDIT_COST).map(([depth, credits]) => (
                <div className="row" key={depth}>
                  <span>{depth}</span>
                  <strong>{credits} credits</strong>
                </div>
              ))}
            </div>

            <h2 id="depth-guide">Depth selection guide</h2>
            <p>
              Use <code>fast</code> for lightweight lookups, <code>standard</code> for normal agent
              context, <code>thorough</code> for higher confidence multi-source research, and{" "}
              <code>deep</code> for expensive broad research. Trial workspaces cannot use deep.
            </p>

            <h2 id="platform-guide">Platform selection guide</h2>
            <p>
              Supported platforms are <code>{PLATFORMS.join(", ")}</code>. Omit the array to let the
              API use all supported platforms. Restrict platforms when an agent already knows the
              desired source type, for example YouTube-only transcript context or Reddit-only buyer
              sentiment.
            </p>

            <h2 id="limits">Rate limits</h2>
            <div className="rows">
              {Object.entries(PLAN_RATE_LIMITS).map(([plan, limits]) => (
                <div className="row" key={plan}>
                  <span>{plan}</span>
                  <strong>
                    {limits.requestsPerMinute}/min - {limits.concurrentJobs} concurrent -{" "}
                    {limits.deepConcurrentJobs} deep
                  </strong>
                </div>
              ))}
            </div>

            <h2 id="jobs">Async jobs</h2>
            <p>
              Use <code>{"\"async\": true"}</code> for work that may take longer. The create response
              can return <code>202</code> with an id. Poll <code>GET /v1/context/:id</code> until the
              status is completed, failed, or cancelled.
            </p>

            <h2 id="webhooks">Webhooks</h2>
            <p>
              Provide <code>webhook_url</code> on async requests to receive completion events. Treat
              delivery as best-effort and keep polling as the authoritative recovery path.
            </p>

            <h2 id="errors">Error codes</h2>
            <div className="codeGrid">
              {errorCodes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </div>

            <h2 id="deploy">Railway deployment notes</h2>
            <p>
              Deploy separate web, API, and worker services from the monorepo. Set API and worker
              health checks to <code>/health</code>. Apply Supabase migrations before routing traffic,
              configure Creem webhooks to <code>/api/billing/creem/webhook</code>, and set QStash to
              call the worker job endpoint.
            </p>

            <h2 id="env">Required environment groups</h2>
            <p>
              Configure WorkOS AuthKit, Supabase Postgres, Creem product ids and webhook secret,
              Upstash Redis, QStash signing keys, provider keys, an internal worker token, and a
              32+ character API key hash secret. See the
              repository README and <code>.env.example</code> for exact variable names.
            </p>
          </article>
        </section>
      </main>
    </>
  );
}

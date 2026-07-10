import { CONTEXT_EFFORTS, EFFORT_PROFILES, PLAN_RATE_LIMITS, PLATFORMS } from "@supacontext/core";
import { SiteHeader } from "../../../components/site-header";
import { formatEffort } from "../../../lib/usage-formatting";

const toolSchema = JSON.stringify(
  {
    name: "supacontext",
    description: "Get compact, cited, up-to-date public context for an AI agent.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The research question or context request.",
        },
        effort: {
          type: "string",
          enum: CONTEXT_EFFORTS,
          default: "medium",
          description: "Research effort. Auto selects a resolved effort for the request.",
        },
        max_credits: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: 250,
          description: "Optional caller cap. Supports up to six decimal places.",
        },
        platforms: {
          type: "array",
          items: {
            type: "string",
            enum: PLATFORMS,
          },
          description: "Optional. Omit to let the research agent select relevant platforms.",
        },
        async: {
          type: "boolean",
          default: false,
        },
        webhook_url: {
          type: "string",
          format: "uri",
          description: "Optional public HTTPS callback for async completion.",
        },
        metadata: {
          type: "object",
          description: "Optional caller metadata stored with the request.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  null,
  2,
);

const errorCodes = [
  "invalid_request",
  "unauthorized",
  "forbidden_effort",
  "budget_too_low",
  "budget_exhausted",
  "insufficient_credits",
  "rate_limited",
  "provider_error",
  "model_error",
  "invalid_model_output",
  "job_not_found",
  "idempotency_key_conflict",
  "internal_error",
];

const effortModels = {
  low: "DeepSeek V4 Flash · high reasoning",
  medium: "DeepSeek V4 Flash · max reasoning",
  high: "DeepSeek V4 Pro · high reasoning",
  x_high: "DeepSeek V4 Pro · max reasoning",
  auto: "Qwen 3.6 27B router on Groq · Flash fallback",
} as const;

export default function ApiReferencePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero">
          <p className="eyebrow">API reference</p>
          <h1>Structured JSON context for agents.</h1>
          <p className="heroText">
            The main API compiles public evidence into compact cited JSON. Raw searches, scrapes,
            transcripts, and provider responses stay internal.
          </p>
        </section>

        <section className="docsLayout">
          <aside className="docsToc">
            <a href="#schema">Tool schema</a>
            <a href="#auth">Authentication</a>
            <a href="#pricing">Pricing</a>
            <a href="#effort-guide">Effort guide</a>
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
              workspace and can set a monthly credit limit and maximum resolved effort.
            </p>
            <p>
              Store keys server-side only. Do not put Supacontext keys in browser bundles, public
              mobile clients, logs, analytics events, or support screenshots.
            </p>

            <h2 id="pricing">Dynamic credits and reservations</h2>
            <p>
              Supacontext charges actual provider operations, provider-reported model input and
              output tokens, and Auto routing. Effort sets the research profile and spending cap.
            </p>
            <p>
              Before paid work, Supacontext atomically reserves a budget within the selected
              effort&apos;s cap and the caller&apos;s <code>max_credits</code>. The API returns
              <code>budget_too_low</code> if <code>max_credits</code> is below the effort&apos;s
              minimum budget, or <code>insufficient_credits</code> if the available balance cannot
              fund that minimum. Work cannot exceed the reservation. Settlement charges actual usage
              and releases unused credits.
            </p>
            <p>
              Retrieval stops when the remaining reservation must be kept for synthesis, and the
              response reports that gap. If safe synthesis no longer fits, the request settles
              completed work and fails with <code>budget_exhausted</code>.
            </p>

            <h2 id="effort-guide">Effort selection guide</h2>
            <div className="rows">
              {CONTEXT_EFFORTS.map((effort) => (
                <div className="row" key={effort}>
                  <span>
                    {formatEffort(effort)} · {effortModels[effort]}
                  </span>
                  <strong>
                    {EFFORT_PROFILES[effort].minimumCredits.toString()} min ·{" "}
                    {EFFORT_PROFILES[effort].maximumCredits.toString()} max credits
                  </strong>
                </div>
              ))}
            </div>
            <p>
              Use Low for focused lookups, Medium for routine multi-source work, High for broad
              cross-checking, and X High for exhaustive research. Auto routes to the least expensive
              suitable resolved effort and records it as <code>resolved_effort</code>.
            </p>

            <h2 id="platform-guide">Platform selection guide</h2>
            <p>
              Supported platforms are <code>{PLATFORMS.join(", ")}</code>. Omit the array to let the
              agent load only relevant platform tools, or restrict it when the source type is known.
              YouTube discovery uses API Direct while transcripts remain on Supadata; web search and
              page retrieval remain on Exa.
            </p>

            <h2 id="limits">Rate limits</h2>
            <div className="rows">
              {Object.entries(PLAN_RATE_LIMITS).map(([plan, limits]) => (
                <div className="row" key={plan}>
                  <span>{plan}</span>
                  <strong>
                    {limits.requestsPerMinute === null
                      ? "Custom rate and concurrency limits"
                      : `${limits.requestsPerMinute}/min · ${limits.concurrentJobs} concurrent`}
                  </strong>
                </div>
              ))}
            </div>

            <h2 id="jobs">Async jobs</h2>
            <p>
              Use <code>{'"async": true'}</code> for work that may take longer. A queued response
              includes <code>id</code>, <code>status</code>, and <code>credits_reserved</code>. Poll{" "}
              <code>GET /v1/context/:id</code> until completion, failure, or cancellation.
            </p>
            <p>
              Final <code>usage</code> reports both <code>credits_charged</code> and{" "}
              <code>credits_reserved</code>, along with effort, resolved effort, platforms, and
              source counts.
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
              health checks to <code>/health</code>. Apply Supabase migrations before routing
              traffic, configure Creem webhooks to <code>/api/billing/creem/webhook</code>, and set
              QStash to call the worker job endpoint.
            </p>

            <h2 id="env">Required environment groups</h2>
            <p>
              Configure WorkOS AuthKit, Supabase Postgres, Creem product ids and webhook secret,
              Upstash Redis, QStash signing keys, provider keys, the server-side GitHub token, an
              internal worker token, and a 32+ character API key hash secret. See the repository
              README and <code>.env.example</code> for exact names.
            </p>
          </article>
        </section>
      </main>
    </>
  );
}

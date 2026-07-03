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
  "AUTH_REQUIRED",
  "INVALID_API_KEY",
  "INVALID_REQUEST",
  "INSUFFICIENT_CREDITS",
  "MONTHLY_CREDIT_LIMIT_EXCEEDED",
  "DEPTH_NOT_ALLOWED",
  "RATE_LIMITED",
  "CONCURRENCY_LIMIT_EXCEEDED",
  "NOT_FOUND",
  "INTERNAL_ERROR",
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
            <a href="#jobs">Async jobs</a>
            <a href="#webhooks">Webhooks</a>
            <a href="#depths">Depths</a>
            <a href="#platforms">Platforms</a>
            <a href="#errors">Errors</a>
          </aside>
          <article className="docsArticle">
            <h2 id="schema">Tool schema for agents</h2>
            <pre>{toolSchema}</pre>

            <h2 id="auth">Authentication</h2>
            <p>
              Send API keys with <code>Authorization: Bearer sk_sc_...</code>. Keys are scoped to a
              workspace, can set a monthly credit limit, and can cap max depth.
            </p>

            <h2 id="jobs">Async jobs</h2>
            <p>
              Use <code>{"\"async\": true"}</code> for work that may take longer. The create response
              can return <code>202</code> with an id. Poll <code>GET /v1/context/:id</code> until the
              status is completed or failed.
            </p>

            <h2 id="webhooks">Webhooks</h2>
            <p>
              Provide <code>webhook_url</code> on async requests to receive completion events. Webhook
              signatures must be verified before processing.
            </p>

            <h2 id="depths">Depth levels</h2>
            <div className="rows">
              {Object.entries(DEPTH_CREDIT_COST).map(([depth, credits]) => (
                <div className="row" key={depth}>
                  <span>{depth}</span>
                  <strong>{credits} credits</strong>
                </div>
              ))}
            </div>

            <h2 id="platforms">Platform selection</h2>
            <p>
              Supported platforms are <code>{PLATFORMS.join(", ")}</code>. Omit the array to let the
              API select all supported platforms.
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

            <h2 id="errors">Error codes</h2>
            <div className="codeGrid">
              {errorCodes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}

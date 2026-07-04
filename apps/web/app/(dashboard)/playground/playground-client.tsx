"use client";

import { Check, Copy, Play, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { CONTEXT_DEPTHS, PLATFORMS, type ContextDepth, type Platform, type PublicContextResponse } from "@supacontext/core";
import { DEPTH_CREDIT_COST } from "@supacontext/core";

type PlaygroundApiResponse =
  | {
      status: string;
      result: PublicContextResponse;
      creditsCharged: number;
      sourcesUsed: number;
    }
  | {
      error: {
        message: string;
      };
    };

const sampleCurl = `curl -X POST "$SUPACONTEXT_API_URL/v1/context" \\
  -H "Authorization: Bearer $SUPACONTEXT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"latest AI browser automation patterns","depth":"standard","platforms":["web","reddit"]}'`;

export function PlaygroundClient({ hasApiKey }: { hasApiKey: boolean }) {
  const [query, setQuery] = useState("What changed in AI coding agent tooling this week?");
  const [depth, setDepth] = useState<ContextDepth>("standard");
  const [platforms, setPlatforms] = useState<Platform[]>(["web", "reddit", "youtube"]);
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [result, setResult] = useState<PublicContextResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const resultJson = useMemo(() => (result ? JSON.stringify(result, null, 2) : ""), [result]);

  function togglePlatform(platform: Platform) {
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1400);
  }

  async function run() {
    setError(null);
    setResult(null);

    if (!hasApiKey) {
      setStatus("error");
      setError("Create an API key before running the playground.");
      return;
    }

    if (!query.trim()) {
      setStatus("error");
      setError("Query is required.");
      return;
    }

    if (platforms.length === 0) {
      setStatus("error");
      setError("Choose at least one platform.");
      return;
    }

    setStatus("running");

    try {
      const response = await fetch("/api/dashboard/playground", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query,
          depth,
          platforms,
        }),
      });
      const data = (await response.json()) as PlaygroundApiResponse;

      if (!response.ok || "error" in data) {
        setStatus("error");
        setError("error" in data ? data.error.message : "Playground request failed.");
        return;
      }

      setResult(data.result);
      setStatus("completed");
    } catch (requestError) {
      setStatus("error");
      setError(requestError instanceof Error ? requestError.message : "Playground request failed.");
    }
  }

  return (
    <div className="playgroundGrid">
      <section className="card controlPanel">
        <div>
          <p className="eyebrow">Playground</p>
          <h1>Run a context query.</h1>
          <p className="mutedText">This dashboard route uses your workspace auth and first active key.</p>
        </div>

        <label className="field">
          <span>Query</span>
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={5} />
        </label>

        <label className="field">
          <span>Depth</span>
          <select value={depth} onChange={(event) => setDepth(event.target.value as ContextDepth)}>
            {CONTEXT_DEPTHS.map((item) => (
              <option key={item} value={item}>
                {item} - {DEPTH_CREDIT_COST[item]} credits
              </option>
            ))}
          </select>
        </label>

        <fieldset className="platformField">
          <legend>Platforms</legend>
          <div className="toggleGrid">
            {PLATFORMS.map((platform) => (
              <label className="checkToggle" key={platform}>
                <input
                  checked={platforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                  type="checkbox"
                />
                <span>{platform}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button className="button primaryButton" disabled={status === "running"} onClick={run} type="button">
          {status === "running" ? <RefreshCw aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
          {status === "running" ? "Running..." : "Run"}
        </button>

        {!hasApiKey ? <div className="alert errorAlert">Create an API key first on the Keys page.</div> : null}
        {error ? <div className="alert errorAlert">{error}</div> : null}
      </section>

      <section className="card resultPanel">
        <div className="cardHeader">
          <div>
            <h2>Result JSON</h2>
            <p className="mutedText">
              Status: <strong>{status}</strong>
              {result ? ` - ${result.usage.credits_charged} credits - ${result.usage.sources_used} sources` : ""}
            </p>
          </div>
          <div className="buttonCluster">
            <button
              className="iconButton"
              disabled={!result}
              onClick={() => copy("json", resultJson)}
              type="button"
              aria-label="Copy JSON"
            >
              {copied === "json" ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
            </button>
            <button
              className="iconButton"
              onClick={() => copy("curl", sampleCurl)}
              type="button"
              aria-label="Copy curl"
            >
              {copied === "curl" ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
            </button>
          </div>
        </div>
        {result ? (
          <pre>{resultJson}</pre>
        ) : (
          <div className="emptyState">
            <p>Run a query to see the final JSON, credits charged, and sources used.</p>
          </div>
        )}
      </section>
    </div>
  );
}

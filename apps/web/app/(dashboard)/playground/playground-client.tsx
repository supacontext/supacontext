"use client";

import { Check, Copy, Play, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CONTEXT_EFFORTS,
  PLATFORMS,
  type ContextEffort,
  type Platform,
  type PublicContextResponse,
} from "@supacontext/core";
import { formatEffort } from "../../../lib/usage-formatting";

type PlaygroundApiResponse =
  | {
      status: string;
      result: PublicContextResponse;
      creditsCharged: number;
      creditsReserved: number;
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
  -d '{"query":"latest AI browser automation patterns","effort":"auto","max_credits":50,"platforms":["web","reddit","github"]}'`;

export function PlaygroundClient({ hasApiKey }: { hasApiKey: boolean }) {
  const [query, setQuery] = useState("What changed in AI coding agent tooling this week?");
  const [effort, setEffort] = useState<ContextEffort>("auto");
  const [maxCredits, setMaxCredits] = useState("50");
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

    const parsedMaxCredits = maxCredits.trim() ? Number(maxCredits) : undefined;
    const validMaxCreditsPrecision =
      !maxCredits.trim() || /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(maxCredits.trim());

    if (
      parsedMaxCredits !== undefined &&
      (!validMaxCreditsPrecision ||
        !Number.isFinite(parsedMaxCredits) ||
        parsedMaxCredits <= 0 ||
        parsedMaxCredits > 250)
    ) {
      setStatus("error");
      setError("Max credits must be greater than 0, no more than 250, and use up to 6 decimals.");
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
          effort,
          ...(parsedMaxCredits === undefined ? {} : { max_credits: parsedMaxCredits }),
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
          <p className="mutedText">
            This dashboard route uses your workspace auth and first active key.
          </p>
        </div>

        <label className="field">
          <span>Query</span>
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={5} />
        </label>

        <label className="field">
          <span>Effort</span>
          <select
            value={effort}
            onChange={(event) => setEffort(event.target.value as ContextEffort)}
          >
            {CONTEXT_EFFORTS.map((item) => (
              <option key={item} value={item}>
                {formatEffort(item)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Max Credits (optional)</span>
          <input
            inputMode="decimal"
            max={250}
            min={0.000001}
            onChange={(event) => setMaxCredits(event.target.value)}
            step={0.000001}
            type="number"
            value={maxCredits}
          />
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

        <button
          className="button primaryButton"
          disabled={status === "running"}
          onClick={run}
          type="button"
        >
          {status === "running" ? (
            <RefreshCw aria-hidden="true" size={16} />
          ) : (
            <Play aria-hidden="true" size={16} />
          )}
          {status === "running" ? "Running..." : "Run"}
        </button>

        {!hasApiKey ? (
          <div className="alert errorAlert">Create an API key first on the Keys page.</div>
        ) : null}
        {error ? <div className="alert errorAlert">{error}</div> : null}
      </section>

      <section className="card resultPanel">
        <div className="cardHeader">
          <div>
            <h2>Result JSON</h2>
            <p className="mutedText">
              Status: <strong>{status}</strong>
              {result
                ? ` - ${result.usage.credits_charged} charged - ${result.usage.credits_reserved} reserved - ${result.usage.sources_used} sources`
                : ""}
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
              {copied === "json" ? (
                <Check aria-hidden="true" size={17} />
              ) : (
                <Copy aria-hidden="true" size={17} />
              )}
            </button>
            <button
              className="iconButton"
              onClick={() => copy("curl", sampleCurl)}
              type="button"
              aria-label="Copy curl"
            >
              {copied === "curl" ? (
                <Check aria-hidden="true" size={17} />
              ) : (
                <Copy aria-hidden="true" size={17} />
              )}
            </button>
          </div>
        </div>
        {result ? (
          <pre>{resultJson}</pre>
        ) : (
          <div className="emptyState">
            <p>
              Run a query to see structured cited JSON, actual charges, reservations, and sources.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

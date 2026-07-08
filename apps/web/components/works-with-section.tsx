"use client";

import Image from "next/image";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const integrations = [
  { name: "Claude", icon: "/agent-logos/claude.svg" },
  { name: "Codex", icon: "/agent-logos/codex.svg" },
  { name: "OpenCode", icon: "/agent-logos/opencode-logo.avif" },
  { name: "OpenClaw", icon: "/agent-logos/openclaw.svg" },
  { name: "Hermes Agent", icon: "/agent-logos/hermes-agent.svg" },
  { name: "GitHub Copilot", icon: "/agent-logos/github-copilot.svg" },
  { name: "Gemini CLI", icon: "/agent-logos/gemini-cli.svg" },
  { name: "Antigravity", icon: "/agent-logos/antigravity.svg" },
  { name: "Vercel AI SDK", icon: "/agent-logos/vercel-ai-sdk.svg" },
  { name: "LangChain", icon: "/agent-logos/langchain.svg" },
  { name: "Agents SDK", icon: "/agent-logos/agents-sdk.svg" },
  { name: "And more...", icon: null },
];

export function WorksWithSection() {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimeoutRef = useRef<number | null>(null);

  const setupCommand = "Read and follow https://www.supacontext.dev/agent-setup/SKILL.md";

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  async function copyCommand() {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    setCopyStatus("idle");

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is not available.");
      }

      await navigator.clipboard.writeText(setupCommand);
      setCopyStatus("copied");

      const resetTimeout = window.setTimeout(() => {
        if (resetTimeoutRef.current !== resetTimeout) {
          return;
        }

        setCopyStatus("idle");
        resetTimeoutRef.current = null;
      }, 2000);
      resetTimeoutRef.current = resetTimeout;
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="section worksWithSection" aria-label="Works with every agent">
      <div className="sectionHeader centeredHeader">
        <h2>Works with every agent</h2>
        <p className="mutedText">
          Use the API, MCP server, CLI, or a drop-in skill to add Supacontext to any agent.
        </p>
      </div>

      <div className="integrationGrid">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className={`integrationCard${integration.icon ? "" : " integrationCardTextOnly"}`}
          >
            {integration.icon ? (
              <span className="integrationIconFrame" aria-hidden="true">
                <Image
                  className="integrationIcon"
                  src={integration.icon}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized={integration.icon.endsWith(".avif")}
                />
              </span>
            ) : null}
            <span className="integrationName">{integration.name}</span>
          </div>
        ))}
      </div>

      <div className="worksWithCTA">
        <button
          className="button primaryButton agentSetupButton"
          onClick={copyCommand}
          type="button"
        >
          {copyStatus === "copied" ? (
            <Check aria-hidden="true" size={16} />
          ) : (
            <Copy aria-hidden="true" size={16} />
          )}
          {copyStatus === "copied" ? "Copied" : "Setup for Agent"}
        </button>
      </div>
    </section>
  );
}

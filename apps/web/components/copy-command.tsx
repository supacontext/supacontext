"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const command = "npm i @supacontext/sdk";

type CopyStatus = "idle" | "copied" | "failed";

export function CopyCommand() {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  async function copyCommand() {
    setCopyStatus("idle");

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is not available.");
      }

      await navigator.clipboard.writeText(command);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1400);
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <div className="scInstallCommand">
      <div>
        <span>$</span>
        <code>{command}</code>
      </div>
      {copyStatus === "idle" ? null : (
        <p className="scCommandFeedback" data-status={copyStatus} role="status">
          {copyStatus === "copied" ? "Copied" : "Copy failed. Select the command manually."}
        </p>
      )}
      <button
        aria-label={
          copyStatus === "failed" ? "Retry copying install command" : "Copy install command"
        }
        className="scCommandCopy"
        onClick={copyCommand}
        type="button"
      >
        {copyStatus === "copied" ? (
          <Check aria-hidden="true" size={16} />
        ) : (
          <Copy aria-hidden="true" size={16} />
        )}
      </button>
    </div>
  );
}

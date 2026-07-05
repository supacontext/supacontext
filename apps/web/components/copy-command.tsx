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
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <div className="scInstallCommand" data-status={copyStatus} aria-live="polite">
      <div>
        {copyStatus === "copied" ? null : <span>$</span>}
        <code>{copyStatus === "copied" ? "Copied" : command}</code>
      </div>
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

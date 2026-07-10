"use client";

import { AlertCircle, Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const command = "npm i @supacontext/sdk";

type CopyStatus = "idle" | "copied" | "failed";

export function CopyCommand() {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const resetTimeoutRef = useRef<number | null>(null);
  const isCopied = copyStatus === "copied";
  const isFailed = copyStatus === "failed";

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

      await navigator.clipboard.writeText(command);
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
    <div className="scInstallCommand" data-status={copyStatus} aria-live="polite">
      <div>
        {isCopied ? (
          <Check aria-hidden="true" size={16} />
        ) : isFailed ? (
          <AlertCircle aria-hidden="true" size={16} />
        ) : (
          <span>$</span>
        )}
        <code>{isCopied ? "Copied" : isFailed ? "Copy failed" : command}</code>
      </div>
      <button
        aria-label={isFailed ? "Retry copying install command" : "Copy install command"}
        className="scCommandCopy"
        onClick={copyCommand}
        type="button"
      >
        {isCopied ? (
          <Check aria-hidden="true" size={16} />
        ) : isFailed ? (
          <AlertCircle aria-hidden="true" size={16} />
        ) : (
          <Copy aria-hidden="true" size={16} />
        )}
      </button>
    </div>
  );
}

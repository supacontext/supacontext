"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const command = "npm i @supacontext/sdk";

export function CopyCommand() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="scInstallCommand">
      <div>
        <span>$</span>
        <code>{command}</code>
      </div>
      <button
        aria-label="Copy install command"
        className="scCommandCopy"
        onClick={copyCommand}
        type="button"
      >
        {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
      </button>
    </div>
  );
}

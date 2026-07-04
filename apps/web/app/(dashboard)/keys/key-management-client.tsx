"use client";

import { Copy, KeyRound, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CONTEXT_DEPTHS, type ContextDepth } from "@supacontext/core";
import { parseApiKeyForm } from "../../../lib/api-key-form";
import { formatDateTime } from "../../../lib/usage-formatting";

type DashboardApiKey = {
  id: string;
  name: string;
  prefix: string;
  maxDepth: ContextDepth;
  monthlyCreditLimit: number | null;
  monthToDateCredits: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type CreateKeyResponse =
  | {
      key: DashboardApiKey;
      rawKey: string;
    }
  | {
      error: {
        message: string;
      };
    };

export function KeyManagementClient({ initialKeys }: { initialKeys: DashboardApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [monthlyCreditLimit, setMonthlyCreditLimit] = useState("");
  const [maxDepth, setMaxDepth] = useState<ContextDepth>("deep");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const activeKeys = useMemo(() => keys.filter((key) => !key.revokedAt), [keys]);

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  async function createKey() {
    setError(null);
    const parsed = parseApiKeyForm({
      name,
      monthlyCreditLimit,
      maxDepth,
    });

    if (!parsed.ok) {
      setError(parsed.errors[0]?.message ?? "Invalid API key form.");
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/dashboard/keys", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(parsed.value),
      });
      const data = (await response.json()) as CreateKeyResponse;

      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error.message : "Could not create API key.");
        return;
      }

      setKeys((current) => [data.key, ...current]);
      setRawKey(data.rawKey);
      setName("");
      setMonthlyCreditLimit("");
      setMaxDepth("deep");
      setDialogOpen(false);
    } finally {
      setPending(false);
    }
  }

  async function revokeKey(id: string) {
    setError(null);
    const response = await fetch(`/api/dashboard/keys/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: { message?: string } };

      setError(data.error?.message ?? "Could not revoke API key.");
      return;
    }

    setKeys((current) =>
      current.map((key) => (key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key)),
    );
  }

  return (
    <div className="clientStack">
      <div className="cardHeader">
        <div>
          <h1>API keys</h1>
          <p className="mutedText">Create scoped keys, cap monthly credits, and revoke access.</p>
        </div>
        <button className="button primaryButton" onClick={() => setDialogOpen(true)} type="button">
          <Plus aria-hidden="true" size={16} />
          Create key
        </button>
      </div>

      {error ? <div className="alert errorAlert">{error}</div> : null}

      {rawKey ? (
        <div className="alert successAlert">
          <div>
            <strong>Copy this key now. It cannot be shown again.</strong>
            <code>{rawKey}</code>
          </div>
          <button className="iconButton" onClick={() => copy(rawKey)} type="button" aria-label="Copy API key">
            <Copy aria-hidden="true" size={17} />
          </button>
        </div>
      ) : null}

      {keys.length === 0 ? (
        <div className="emptyState">
          <KeyRound aria-hidden="true" size={24} />
          <p>No API keys yet.</p>
          <button className="button primaryButton" onClick={() => setDialogOpen(true)} type="button">
            Create first key
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="table keyTable">
            {keys.map((key) => (
              <div className="tableRow" key={key.id}>
                <div>
                  <strong>{key.name}</strong>
                  <span>{key.prefix}...</span>
                </div>
                <span>{key.maxDepth}</span>
                <span>{key.monthlyCreditLimit === null ? "Unlimited" : key.monthlyCreditLimit}</span>
                <span>{formatDateTime(key.lastUsedAt)}</span>
                <span>{formatDateTime(key.createdAt)}</span>
                {key.revokedAt ? (
                  <span className="statusPill failed">Revoked</span>
                ) : (
                  <button
                    className="iconButton dangerButton"
                    onClick={() => revokeKey(key.id)}
                    type="button"
                    aria-label={`Revoke ${key.name}`}
                  >
                    <Trash2 aria-hidden="true" size={17} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {dialogOpen ? (
        <div className="modalBackdrop" role="presentation">
          <div aria-modal="true" className="modal" role="dialog">
            <div className="cardHeader">
              <div>
                <h2>Create API key</h2>
                <p className="mutedText">{activeKeys.length} active keys in this workspace.</p>
              </div>
              <button className="iconButton" onClick={() => setDialogOpen(false)} type="button" aria-label="Close">
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <label className="field">
              <span>Key Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Production agent" />
            </label>
            <label className="field">
              <span>Credits Limit / Month</span>
              <input
                inputMode="numeric"
                min={0}
                onChange={(event) => setMonthlyCreditLimit(event.target.value)}
                placeholder="Unlimited"
                value={monthlyCreditLimit}
              />
            </label>
            <label className="field">
              <span>Max Depth Level</span>
              <select value={maxDepth} onChange={(event) => setMaxDepth(event.target.value as ContextDepth)}>
                {CONTEXT_DEPTHS.map((depth) => (
                  <option key={depth} value={depth}>
                    {depth}
                  </option>
                ))}
              </select>
            </label>
            <div className="modalActions">
              <button className="button secondaryButton" onClick={() => setDialogOpen(false)} type="button">
                Cancel
              </button>
              <button className="button primaryButton" disabled={pending} onClick={createKey} type="button">
                {pending ? "Creating..." : "Create key"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

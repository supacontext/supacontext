"use client";

import type { PaidBillingInterval, SelfServePaidPlanSlug } from "@supacontext/core";
import { CreditCard, ExternalLink } from "lucide-react";
import { useState } from "react";

export function BillingActionButton({
  plan,
  billingInterval,
  disabled = false,
  label,
}: {
  plan: SelfServePaidPlanSlug;
  billingInterval: PaidBillingInterval;
  disabled?: boolean;
  label: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function checkout() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/dashboard/billing/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ plan, billingInterval }),
      });
      const data = (await response.json()) as { url?: string; error?: { message?: string } };

      if (!response.ok || !data.url) {
        setMessage(data.error?.message ?? "Billing checkout is not available.");
        return;
      }

      window.location.href = data.url;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="billingAction">
      <button
        className="button primaryButton fullButton"
        disabled={pending || disabled}
        onClick={checkout}
        type="button"
      >
        <CreditCard aria-hidden="true" size={16} />
        {pending ? "Opening..." : label}
      </button>
      {message ? <p className="inlineError">{message}</p> : null}
    </div>
  );
}

export function ManageBillingButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function openPortal() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/dashboard/billing/portal", {
        method: "POST",
      });
      const data = (await response.json()) as { url?: string; error?: { message?: string } };

      if (!response.ok || !data.url) {
        setMessage(data.error?.message ?? "Billing portal is not available.");
        return;
      }

      window.location.href = data.url;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="billingAction">
      <button
        className="button secondaryButton"
        disabled={pending}
        onClick={openPortal}
        type="button"
      >
        <ExternalLink aria-hidden="true" size={16} />
        {pending ? "Opening..." : "Manage billing"}
      </button>
      {message ? <p className="inlineError">{message}</p> : null}
    </div>
  );
}

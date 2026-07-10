import type { ContextEffort, Platform } from "@supacontext/core";

export function formatCredits(credits: number): string {
  const value = credits.toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });

  return `${value} ${credits === 1 ? "credit" : "credits"}`;
}

export function formatEffort(effort: ContextEffort): string {
  return effort === "x_high" ? "X High" : effort.charAt(0).toUpperCase() + effort.slice(1);
}

export function formatMoney(cents: number): string {
  if (cents === 0) {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatLatency(
  startedAt: Date | string | null,
  completedAt: Date | string | null,
): string {
  if (!startedAt || !completedAt) {
    return "Not available";
  }

  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  return formatDurationMs(durationMs);
}

export function formatDurationMs(durationMs: number | null): string {
  if (durationMs === null) {
    return "Not available";
  }

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "Not available";
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

export function formatPlatforms(platforms: Platform[]): string {
  return platforms.length > 0 ? platforms.join(", ") : "None";
}

export const CONTEXT_DEPTHS = ["fast", "standard", "thorough", "deep"] as const;
export type ContextDepth = (typeof CONTEXT_DEPTHS)[number];

export const PLATFORMS = ["web", "reddit", "x", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type PlatformMode = "auto" | "manual";

export const PLAN_SLUGS = ["free", "starter", "pro", "growth", "scale", "enterprise"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

export const SELF_SERVE_PAID_PLAN_SLUGS = ["starter", "pro", "growth", "scale"] as const;
export type SelfServePaidPlanSlug = (typeof SELF_SERVE_PAID_PLAN_SLUGS)[number];

export const PAID_BILLING_INTERVALS = ["month", "year"] as const;
export type PaidBillingInterval = (typeof PAID_BILLING_INTERVALS)[number];

export const PROVIDERS = ["exa", "fetchlayer", "xquik", "supadata", "deepseek", "voyage"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const REQUEST_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const LEDGER_EVENT_TYPES = ["grant", "debit", "refund", "adjustment", "expiration"] as const;
export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];

export type PublicContextUsage = {
  credits_charged: number;
  depth: ContextDepth;
  platforms_used: Platform[];
  sources_considered: number;
  sources_used: number;
  cached: boolean;
};

export type PublicContextResponse = {
  id: string;
  query: string;
  depth: ContextDepth;
  status: RequestStatus;
  answer: string | null;
  context_pack: unknown[];
  sources: unknown[];
  gaps: unknown[];
  usage: PublicContextUsage;
};

export const CONTEXT_EFFORTS = ["low", "medium", "high", "x_high", "auto"] as const;
export type ContextEffort = (typeof CONTEXT_EFFORTS)[number];

export const RESOLVED_EFFORTS = ["low", "medium", "high", "x_high"] as const;
export type ResolvedEffort = (typeof RESOLVED_EFFORTS)[number];

export const PLATFORMS = [
  "web",
  "reddit",
  "x",
  "youtube",
  "facebook",
  "news",
  "forums",
  "places",
  "linkedin",
  "hackernews",
  "github",
] as const;
export type Platform = (typeof PLATFORMS)[number];
export type PlatformMode = "auto" | "manual";

export const PLAN_SLUGS = ["trial", "starter", "builder", "pro", "scale"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

export const PROVIDERS = [
  "exa",
  "fetchlayer",
  "api_direct",
  "supadata",
  "deepseek",
  "groq",
  "voyage",
  "hacker_news_firebase",
  "hacker_news_algolia",
  "github",
] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const REQUEST_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const LEDGER_EVENT_TYPES = [
  "grant",
  "reservation",
  "release",
  "adjustment",
  "expiration",
] as const;
export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];

export type PublicContextUsage = {
  credits_charged: number;
  credits_reserved: number;
  effort: ContextEffort;
  resolved_effort?: ResolvedEffort;
  platforms_used: Platform[];
  sources_considered: number;
  sources_used: number;
  cached: boolean;
};

export type PublicContextResponse = {
  id: string;
  query: string;
  effort: ContextEffort;
  resolved_effort?: ResolvedEffort;
  status: RequestStatus;
  answer: string | null;
  context_pack: unknown[];
  sources: unknown[];
  gaps: unknown[];
  usage: PublicContextUsage;
};

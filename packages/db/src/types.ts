import type {
  ContextEffort,
  LedgerEventType,
  Platform,
  PlatformMode,
  ProviderName,
  RequestStatus,
} from "@supacontext/core";

export type ApiKeyRow = {
  id: string;
  workspace_id: string;
  name: string;
  key_hash: string;
  prefix: string;
  max_effort: Exclude<ContextEffort, "auto">;
  monthly_credit_limit_microcredits: bigint | null;
  month_to_date_microcredits: bigint;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

export type CreditBalanceRow = {
  workspace_id: string;
  balance_microcredits: bigint;
  updated_at: Date;
};

export type UsageLedgerRow = {
  id: string;
  workspace_id: string;
  event_type: LedgerEventType;
  credit_microcredits: bigint;
  context_request_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
};

export type ContextRequestRow = {
  id: string;
  workspace_id: string;
  api_key_id: string | null;
  query: string;
  effort: ContextEffort;
  resolved_effort: Exclude<ContextEffort, "auto"> | null;
  max_resolved_effort: Exclude<ContextEffort, "auto">;
  platforms: Platform[];
  platform_mode: PlatformMode;
  status: RequestStatus;
  caller_max_microcredits: bigint | null;
  effective_cap_microcredits: bigint;
  reserved_microcredits: bigint;
  spent_microcredits: bigint;
  pricing_version: string;
  idempotency_key: string | null;
  idempotency_request_hash: string | null;
  webhook_url: string | null;
  metadata: unknown;
  qstash_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  settled_at: Date | null;
  lease_expires_at: Date | null;
  claim_attempts: number;
  created_at: Date;
  updated_at: Date;
};

export type ContextResultRow = {
  id: string;
  context_request_id: string;
  response_json: unknown;
  citation_count: number;
  created_at: Date;
};

export type ProviderCallLogRow = {
  id: string;
  context_request_id: string | null;
  provider: ProviderName;
  platform: Platform | null;
  operation: string;
  attempt: number;
  status_code: number | null;
  duration_ms: number | null;
  billable_units: bigint | null;
  upstream_cost_usd_nanos: bigint | null;
  charged_microcredits: bigint | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  pricing_version: string;
  created_at: Date;
};

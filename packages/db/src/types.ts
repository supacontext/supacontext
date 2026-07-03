import type {
  ContextDepth,
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
  max_depth: ContextDepth;
  monthly_credit_limit: number | null;
  month_to_date_credits: number;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

export type CreditBalanceRow = {
  workspace_id: string;
  balance: number;
  updated_at: Date;
};

export type UsageLedgerRow = {
  id: string;
  workspace_id: string;
  event_type: LedgerEventType;
  credits: number;
  context_request_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
};

export type ContextRequestRow = {
  id: string;
  workspace_id: string;
  api_key_id: string | null;
  query: string;
  depth: ContextDepth;
  platforms: Platform[];
  platform_mode: PlatformMode;
  status: RequestStatus;
  requested_credits: number;
  spent_credits: number;
  idempotency_key: string | null;
  webhook_url: string | null;
  metadata: unknown;
  qstash_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
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
  status_code: number | null;
  duration_ms: number | null;
  created_at: Date;
};

create extension if not exists pgcrypto;

create type public.context_effort as enum ('low', 'medium', 'high', 'x_high', 'auto');
create type public.platform as enum (
  'web',
  'reddit',
  'x',
  'youtube',
  'facebook',
  'news',
  'forums',
  'places',
  'linkedin',
  'hackernews',
  'github'
);
create type public.request_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type public.plan_slug as enum ('trial', 'starter', 'builder', 'pro', 'scale');
create type public.provider as enum (
  'exa',
  'fetchlayer',
  'api_direct',
  'supadata',
  'deepseek',
  'groq',
  'voyage',
  'hacker_news_firebase',
  'hacker_news_algolia',
  'github'
);
create type public.ledger_event_type as enum (
  'grant',
  'reservation',
  'release',
  'adjustment',
  'expiration'
);
create type public.cost_event_status as enum ('pending', 'settled', 'released', 'uncertain');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  workos_user_id text not null unique,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create table public.plans (
  slug public.plan_slug primary key,
  name text not null,
  billing_interval text not null check (billing_interval in ('one_time', 'month')),
  price_cents integer not null check (price_cents >= 0),
  included_credits integer not null check (included_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

insert into public.plans (slug, name, billing_interval, price_cents, included_credits)
values
  ('trial', 'Trial', 'one_time', 0, 50),
  ('starter', 'Starter', 'month', 1900, 1500),
  ('builder', 'Builder', 'month', 4900, 4000),
  ('pro', 'Pro', 'month', 9900, 9000),
  ('scale', 'Scale', 'month', 24900, 22000)
on conflict (slug) do update
set
  name = excluded.name,
  billing_interval = excluded.billing_interval,
  price_cents = excluded.price_cents,
  included_credits = excluded.included_credits;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_slug public.plan_slug not null references public.plans(slug) on delete restrict,
  status public.subscription_status not null,
  creem_customer_id text,
  creem_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_workspace_id_idx on public.subscriptions(workspace_id);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create table public.credit_balances (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  balance_microcredits bigint not null default 0 check (balance_microcredits >= 0),
  updated_at timestamptz not null default now()
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  max_effort public.context_effort not null default 'x_high' check (max_effort <> 'auto'),
  monthly_credit_limit_microcredits bigint check (
    monthly_credit_limit_microcredits is null or monthly_credit_limit_microcredits >= 0
  ),
  month_to_date_microcredits bigint not null default 0 check (month_to_date_microcredits >= 0),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index api_keys_workspace_id_idx on public.api_keys(workspace_id);
create index api_keys_prefix_idx on public.api_keys(prefix);
create index api_keys_active_hash_idx on public.api_keys(key_hash) where revoked_at is null;

create trigger api_keys_set_updated_at
before update on public.api_keys
for each row execute function public.set_updated_at();

create table public.context_requests (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  query text not null,
  effort public.context_effort not null,
  resolved_effort public.context_effort check (resolved_effort is null or resolved_effort <> 'auto'),
  max_resolved_effort public.context_effort not null check (max_resolved_effort <> 'auto'),
  platforms public.platform[] not null,
  platform_mode text not null default 'auto' check (platform_mode in ('auto', 'manual')),
  status public.request_status not null default 'queued',
  caller_max_microcredits bigint check (caller_max_microcredits is null or caller_max_microcredits > 0),
  effective_cap_microcredits bigint not null check (effective_cap_microcredits > 0),
  reserved_microcredits bigint not null check (reserved_microcredits >= 0),
  spent_microcredits bigint not null default 0 check (spent_microcredits >= 0),
  pricing_version text not null,
  idempotency_key text,
  idempotency_request_hash text,
  webhook_url text,
  metadata jsonb not null default '{}'::jsonb,
  qstash_message_id text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  settled_at timestamptz,
  lease_expires_at timestamptz,
  claim_attempts integer not null default 0 check (claim_attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(platforms) between 1 and 11),
  check (spent_microcredits <= effective_cap_microcredits),
  check (reserved_microcredits + spent_microcredits <= effective_cap_microcredits)
);

create unique index context_requests_workspace_idempotency_key_idx
on public.context_requests(workspace_id, idempotency_key)
where idempotency_key is not null;

create index context_requests_workspace_id_idx on public.context_requests(workspace_id);
create index context_requests_status_idx on public.context_requests(status);

create trigger context_requests_set_updated_at
before update on public.context_requests
for each row execute function public.set_updated_at();

create table public.context_request_events (
  id uuid primary key default gen_random_uuid(),
  context_request_id text not null references public.context_requests(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index context_request_events_request_id_idx on public.context_request_events(context_request_id);

create table public.context_results (
  id uuid primary key default gen_random_uuid(),
  context_request_id text not null unique references public.context_requests(id) on delete cascade,
  response_json jsonb not null,
  citation_count integer not null default 0 check (citation_count >= 0),
  created_at timestamptz not null default now()
);

comment on table public.context_results is
  'Stores compiled public JSON context only. Never store raw provider output here.';

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_type public.ledger_event_type not null,
  credit_microcredits bigint not null check (credit_microcredits <> 0),
  context_request_id text references public.context_requests(id) on delete set null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (
    (event_type in ('grant', 'release') and credit_microcredits > 0) or
    (event_type in ('reservation', 'expiration') and credit_microcredits < 0) or
    event_type = 'adjustment'
  )
);

create unique index usage_ledger_workspace_idempotency_key_idx
on public.usage_ledger(workspace_id, idempotency_key)
where idempotency_key is not null;

create index usage_ledger_workspace_id_idx on public.usage_ledger(workspace_id);
create index usage_ledger_context_request_id_idx on public.usage_ledger(context_request_id);

create or replace function public.apply_usage_ledger_to_balance()
returns trigger
language plpgsql
as $$
begin
  insert into public.credit_balances (workspace_id, balance_microcredits, updated_at)
  values (new.workspace_id, new.credit_microcredits, now())
  on conflict (workspace_id) do update
  set
    balance_microcredits = public.credit_balances.balance_microcredits + excluded.balance_microcredits,
    updated_at = now();

  return new;
end;
$$;

create trigger usage_ledger_apply_to_balance
after insert on public.usage_ledger
for each row execute function public.apply_usage_ledger_to_balance();

create table public.context_cost_events (
  id text primary key,
  context_request_id text not null references public.context_requests(id) on delete cascade,
  provider public.provider not null,
  platform public.platform,
  operation text not null,
  status public.cost_event_status not null default 'pending',
  reserved_microcredits bigint not null check (reserved_microcredits > 0),
  actual_microcredits bigint check (
    actual_microcredits is null or
    (actual_microcredits >= 0 and actual_microcredits <= reserved_microcredits)
  ),
  upstream_cost_usd_nanos bigint check (
    upstream_cost_usd_nanos is null or upstream_cost_usd_nanos >= 0
  ),
  billable_units bigint check (billable_units is null or billable_units >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  cached_input_tokens integer check (
    cached_input_tokens is null or cached_input_tokens >= 0
  ),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  model text,
  pricing_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check (
    cached_input_tokens is null or
    (input_tokens is not null and cached_input_tokens <= input_tokens)
  )
);

create index context_cost_events_request_id_idx
on public.context_cost_events(context_request_id);

create table public.provider_call_logs (
  id uuid primary key default gen_random_uuid(),
  context_request_id text references public.context_requests(id) on delete set null,
  provider public.provider not null,
  platform public.platform,
  operation text not null,
  attempt integer not null default 1 check (attempt > 0),
  status_code integer,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  billable_units bigint check (billable_units is null or billable_units >= 0),
  upstream_cost_usd_nanos bigint check (
    upstream_cost_usd_nanos is null or upstream_cost_usd_nanos >= 0
  ),
  charged_microcredits bigint check (charged_microcredits is null or charged_microcredits >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  cached_input_tokens integer check (
    cached_input_tokens is null or cached_input_tokens >= 0
  ),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  model text,
  pricing_version text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  check (
    cached_input_tokens is null or
    (input_tokens is not null and cached_input_tokens <= input_tokens)
  )
);

comment on table public.provider_call_logs is
  'Operational metadata only. Do not add raw provider request or response payload columns.';

create index provider_call_logs_request_id_idx on public.provider_call_logs(context_request_id);
create index provider_call_logs_provider_idx on public.provider_call_logs(provider);

create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text,
  event_type text not null,
  payload jsonb not null,
  signature_valid boolean not null default false,
  processed_at timestamptz,
  error_message text,
  received_at timestamptz not null default now()
);

create unique index webhooks_source_external_id_idx
on public.webhooks(source, external_id)
where external_id is not null;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_balances enable row level security;
alter table public.api_keys enable row level security;
alter table public.context_requests enable row level security;
alter table public.context_request_events enable row level security;
alter table public.context_results enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.context_cost_events enable row level security;
alter table public.provider_call_logs enable row level security;
alter table public.webhooks enable row level security;

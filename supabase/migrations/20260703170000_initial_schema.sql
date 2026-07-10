create extension if not exists pgcrypto;

create type public.context_depth as enum ('fast', 'standard', 'thorough', 'deep');
create type public.platform as enum ('web', 'reddit', 'x', 'youtube');
create type public.request_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type public.plan_slug as enum ('free', 'starter', 'pro', 'growth', 'scale', 'enterprise');
create type public.provider as enum ('exa', 'fetchlayer', 'xquik', 'supadata', 'deepseek', 'voyage');
create type public.ledger_event_type as enum ('grant', 'debit', 'refund', 'adjustment', 'expiration');
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
  billing_interval text not null check (billing_interval in ('one_time', 'month', 'custom')),
  price_cents integer check (price_cents >= 0),
  annual_price_cents integer check (annual_price_cents >= 0),
  included_credits integer check (included_credits >= 0),
  deep_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

insert into public.plans (
  slug,
  name,
  billing_interval,
  price_cents,
  annual_price_cents,
  included_credits,
  deep_allowed
)
values
  ('free', 'Free', 'one_time', 0, null, 250, false),
  ('starter', 'Starter', 'month', 1900, 19000, 5000, true),
  ('pro', 'Pro', 'month', 7900, 79000, 25000, true),
  ('growth', 'Growth', 'month', 19900, 199000, 75000, true),
  ('scale', 'Scale', 'month', 49900, 499000, 200000, true),
  ('enterprise', 'Enterprise', 'custom', null, null, null, true)
on conflict (slug) do update
set
  name = excluded.name,
  billing_interval = excluded.billing_interval,
  price_cents = excluded.price_cents,
  annual_price_cents = excluded.annual_price_cents,
  included_credits = excluded.included_credits,
  deep_allowed = excluded.deep_allowed;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_slug public.plan_slug not null references public.plans(slug) on delete restrict,
  billing_interval text check (billing_interval in ('month', 'year')),
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
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  max_depth public.context_depth not null default 'deep',
  monthly_credit_limit integer check (monthly_credit_limit is null or monthly_credit_limit >= 0),
  month_to_date_credits integer not null default 0 check (month_to_date_credits >= 0),
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
  depth public.context_depth not null,
  platforms public.platform[] not null,
  platform_mode text not null default 'auto' check (platform_mode in ('auto', 'manual')),
  status public.request_status not null default 'queued',
  requested_credits integer not null check (requested_credits > 0),
  spent_credits integer not null default 0 check (spent_credits >= 0),
  idempotency_key text,
  idempotency_request_hash text,
  webhook_url text,
  metadata jsonb not null default '{}'::jsonb,
  qstash_message_id text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(platforms) between 1 and 4)
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
  credits integer not null check (credits <> 0),
  context_request_id text references public.context_requests(id) on delete set null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
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
  insert into public.credit_balances (workspace_id, balance, updated_at)
  values (new.workspace_id, new.credits, now())
  on conflict (workspace_id) do update
  set
    balance = public.credit_balances.balance + excluded.balance,
    updated_at = now();

  return new;
end;
$$;

create trigger usage_ledger_apply_to_balance
after insert on public.usage_ledger
for each row execute function public.apply_usage_ledger_to_balance();

create table public.provider_call_logs (
  id uuid primary key default gen_random_uuid(),
  context_request_id text references public.context_requests(id) on delete set null,
  provider public.provider not null,
  platform public.platform,
  status_code integer,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
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
alter table public.provider_call_logs enable row level security;
alter table public.webhooks enable row level security;

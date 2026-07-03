# SupaContext

Developer API for giving AI agents compact, cited, up-to-date public context from web, Reddit, X, and YouTube.

SupaContext is not a raw search API, scraper, or provider-output passthrough. Public responses must be compiled JSON context with citations.

## Monorepo Layout

- `apps/web` - Next.js App Router dashboard shell.
- `apps/api` - Node.js HTTP API service. `/v1/context` is intentionally not implemented yet.
- `apps/worker` - Node.js worker service placeholder for QStash-triggered jobs.
- `packages/config` - strict environment parsing.
- `packages/core` - product constants, depth pricing, plan config, validation, API-key hashing.
- `packages/db` - Postgres client and typed query helpers.
- `packages/billing` - Creem billing interfaces and placeholders.
- `packages/usage` - usage authorization helpers.
- `packages/providers` - typed provider interfaces and placeholder clients for Exa, FetchLayer, Xquik, Supadata, DeepSeek, and Voyage.
- `packages/agent` - orchestration/result types only. No research system prompt is included.
- `packages/ui` - shared React UI primitives.
- `packages/eslint-config` and `packages/tsconfig` - shared tooling config.

## Requirements

- Node.js 24+
- pnpm 10+
- Supabase CLI
- Local or hosted Supabase Postgres
- Clerk
- Creem.io
- Upstash Redis
- Upstash QStash

## Local Setup

```bash
pnpm install
cp .env.example .env
```

Fill `.env` with local service credentials. `API_KEY_HASH_SECRET` must be at least 32 characters.

Start Supabase locally:

```bash
pnpm supabase start
pnpm supabase db reset
```

The initial schema is in `supabase/migrations/20260703170000_initial_schema.sql`.

Run the workspace:

```bash
pnpm dev
```

Useful filtered commands:

```bash
pnpm --filter @supacontext/web dev
pnpm --filter @supacontext/api dev
pnpm --filter @supacontext/worker dev
```

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Current tests cover:

- depth credit pricing
- plan depth restrictions
- credit value math
- API-key generation, hashing, prefix storage, and verification

## Database Notes

The schema supports:

- Clerk-mapped profiles
- workspaces
- plans and subscriptions
- credit balances and immutable usage ledger entries
- secure API keys with hash-only storage and display prefixes
- context requests, request events, and compiled JSON results
- provider call metadata without raw provider payload storage
- webhook receipt tracking

API keys are designed so the raw key is shown once, only the HMAC hash is stored, and the prefix is kept for display.

## Environment Validation

Environment parsing lives in `packages/config`. Apps call the parser at runtime, not import time, so builds and typechecks do not require real secrets.

## Railway Deployment Shape

Use separate Railway services from the same monorepo:

- Web service: root command `pnpm --filter @supacontext/web start`, build command `pnpm build`.
- API service: root command `pnpm --filter @supacontext/api start`, build command `pnpm build`.
- Worker service: root command `pnpm --filter @supacontext/worker start`, build command `pnpm build`.

Each service should receive only the environment variables it needs. Do not expose Supabase service-role keys, provider keys, Creem secrets, QStash signing keys, Redis tokens, or API key hash secrets to the browser.

## Intentional Placeholders

- No real provider API calls are implemented.
- Creem billing has typed interfaces only.
- The internal research agent system prompt is intentionally absent.
- `POST /v1/context` is intentionally left for the next implementation phase.


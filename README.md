# Supacontext

Developer API for giving AI agents compact, cited, up-to-date public context from web, Reddit, X, and YouTube.

Supacontext is not a raw search API, scraper, or provider-output passthrough. Public responses are JSON-only compiled context with citations, gaps, and usage metadata.

## Services

- `apps/web` - Next.js dashboard, docs, API-key management, usage, playground, billing UI, Creem dashboard routes.
- `apps/api` - Public HTTP API. `POST /v1/context`, `GET /v1/context/:id`, `/health`.
- `apps/worker` - QStash-triggered context worker. Runs provider orchestration and writes compiled public results.
- `packages/core` - product constants, depth pricing, plans, validation, API-key hashing.
- `packages/db` - Postgres client and typed query helpers.
- `packages/billing` - typed Creem adapter, webhook signature verification, normalized billing events.
- `packages/providers` - provider adapters with timeouts, retries, normalized errors, and safe metadata logging.
- `packages/sdk` - dependency-free JavaScript SDK.

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm supabase start
pnpm supabase db reset
pnpm dev
```

Useful service commands:

```bash
pnpm --filter @supacontext/web dev
pnpm --filter @supacontext/api dev
pnpm --filter @supacontext/worker dev
```

Health checks:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
```

## Public API

```bash
curl -X POST "$API_URL/v1/context" \
  -H "Authorization: Bearer $SUPACONTEXT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-1" \
  -d '{"query":"What changed in AI agent tooling this week?","depth":"standard","platforms":["web","reddit"],"async":true}'
```

Poll async jobs:

```bash
curl "$API_URL/v1/context/ctx_..." \
  -H "Authorization: Bearer $SUPACONTEXT_API_KEY"
```

## JavaScript SDK

```ts
import { createSupaContext } from "@supacontext/sdk";

const supacontext = createSupaContext({
  apiKey: process.env.SUPACONTEXT_API_KEY!,
  baseUrl: process.env.SUPACONTEXT_API_URL,
});

const created = await supacontext.context.create({ query: "agent context APIs", async: true });
const result = created.status === "queued" ? await supacontext.context.poll(created.id) : created;
```

Examples live in `packages/sdk/examples`.

## Environment Variables

Local development uses one root env file:

```bash
cp .env.example .env
```

The root scripts and app `dev`/`start` scripts load `./.env` from the monorepo root. Do not create separate `.env` files inside `apps/web`, `apps/api`, or `apps/worker`.

In cloud deployment, env vars are configured per deployed service. Railway and Vercel do not automatically share the monorepo root `.env`.

Shared:

- `NODE_ENV`
- `APP_URL`
- `API_URL`
- `WORKER_URL`
- `CORS_ALLOWED_ORIGINS` comma-separated browser origins allowed to call the public API
- `WORKER_INTERNAL_TOKEN` shared by server-side web/API calls to the worker
- `DATABASE_URL`
- `API_KEY_HASH_SECRET` at least 32 characters

Web and WorkOS AuthKit:

- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD` at least 32 characters
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` for example `http://localhost:3000/callback`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Configure the WorkOS dashboard Redirects settings for each environment:

- Redirect URI: `<APP_URL>/callback`
- Sign-in endpoint: `<APP_URL>/sign-in`
- Sign-out redirect: `<APP_URL>`

API:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `QSTASH_URL`
- `QSTASH_TOKEN`
- `PORT`
- `LOG_LEVEL`

Worker:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `QSTASH_URL`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `EXA_API_KEY`
- `FETCHLAYER_API_KEY`
- `XQUIK_API_KEY`
- `SUPADATA_API_KEY`
- `DEEPSEEK_API_KEY`
- `VOYAGE_API_KEY`
- `WORKER_PORT`
- `LOG_LEVEL`

Creem billing:

- `CREEM_API_KEY`
- `CREEM_WEBHOOK_SECRET`
- `CREEM_STARTER_PRODUCT_ID`
- `CREEM_BUILDER_PRODUCT_ID`
- `CREEM_PRO_PRODUCT_ID`
- `CREEM_SCALE_PRODUCT_ID`

Never expose service-role keys, provider keys, Creem secrets, QStash signing keys, Redis tokens, or `API_KEY_HASH_SECRET` to client code.

`DATABASE_URL` is the Supabase Postgres connection string, not the Supabase API URL. For Supabase Cloud, use the database connection string from the Supabase project and set it on each server-side service that talks to Postgres: web, API, and worker.

## Database Setup

The Supabase migration is `supabase/migrations/20260703170000_initial_schema.sql`.

Local reset:

```bash
pnpm supabase db reset
```

Hosted Supabase:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The schema includes profiles, workspaces, subscriptions, credit balances, API keys, context requests/results, provider call metadata, webhook receipts, and usage ledger triggers. `context_results` stores compiled public JSON only; provider raw payloads are not stored.

## Billing

Creem checkout is created from the dashboard billing page. The checkout metadata includes:

- `workspace_id`
- `plan`

Configure the Creem webhook endpoint:

```text
https://<web-service-domain>/api/billing/creem/webhook
```

Handled events:

- subscription created
- subscription updated
- subscription cancelled
- payment succeeded
- payment failed

Credit grants are ledger entries with idempotency keys based on the Creem payment id. Duplicate webhooks do not double-grant. Successful monthly payments reset API-key month-to-date counters and grant the paid plan's monthly credits.

The Creem adapter contains TODO comments around the exact checkout and portal HTTP endpoint names; verify those against Creem's current API before live billing traffic.

## Railway Deployment

Create three Railway services from this monorepo. This is the recommended first deployment path because the web app, API, and worker can share one Railway project while still having separate service-level env vars.

Web service:

```bash
pnpm --filter @supacontext/web build
pnpm --filter @supacontext/web start
```

API service:

```bash
pnpm --filter @supacontext/api build
pnpm --filter @supacontext/api start
```

Worker service:

```bash
pnpm --filter @supacontext/worker build
pnpm --filter @supacontext/worker start
```

Recommended Railway build command for each service:

```bash
pnpm install --frozen-lockfile && pnpm build
```

Set health checks to:

- API: `/health`
- Worker: `/health`
- Web: `/`

Set env vars separately per Railway service:

- Web: shared web URLs/tokens, `DATABASE_URL`, `API_KEY_HASH_SECRET`, WorkOS AuthKit, Supabase anon URL/key, and Creem billing vars.
- API: shared API URLs/tokens, `DATABASE_URL`, `API_KEY_HASH_SECRET`, Supabase anon/service keys, Upstash Redis, and QStash token.
- Worker: shared worker URLs/tokens, `DATABASE_URL`, `API_KEY_HASH_SECRET`, Supabase anon/service keys, QStash signing keys, and provider API keys.

## Verification

Before deploying:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Targeted checks covered by tests include API-key auth, depth restrictions, monthly API-key caps, ledger debits/refunds, idempotent context creation, async queue lifecycle, provider failure handling, invalid model JSON repair/failure, safe public responses, Creem signature/event normalization, and SDK basics.

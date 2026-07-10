# Credit economics

Last reviewed: 2026-07-10. The executable source of truth is
`packages/core/src/pricing.ts`. Update that registry first whenever an upstream price changes, then
re-run its tests and refresh the estimates in this document.

## Conversion and accounting

- One displayed credit equals 1,000,000 internal microcredits.
- One credit has a reference retail value of $0.002.
- The reference value sits just below the lowest annual-plan revenue per allowance credit: about
  $0.00208 for Scale. Plan price differences stay in the margin model, not the runtime meter.
- Metered upstream cost receives a 2.0x markup before conversion to credits.
- At that markup, one charged credit maps to $0.001 of upstream cost:
  `ceil(upstream USD × 2 / $0.002 × 1,000,000)` microcredits.
- The registry stores prices as integer USD nanos and balances as integer microcredits. Division
  always rounds up, so small calls and token completions cannot disappear through rounding.
- GitHub and Hacker News use a 0.25-credit operational floor per call even though their
  public APIs have no request fee. That floor pays for orchestration, normalization, storage, abuse
  prevention, and maintenance; it is not represented as an upstream provider charge.
- The Supadata rate assumes its $10 per 1,000-credit auto-recharge price: $0.01 per provider credit.
  Actual transcript settlement uses the `x-billable-requests` response header. Change the registry
  rate when Supacontext commits to a different Supadata plan.

Reservations use the request's effective cap, in microcredits. Settlement charges the sum of actual
tool units and provider-reported model tokens and releases the rest. Public responses convert the
final integer amount to a decimal credit number only at the JSON boundary.

## Current upstream assumptions

The registry reflects these public prices:

- Exa Search $0.007/call and Contents text $0.001/page.
- FetchLayer PAYG $1.99/1,000 calls. One successful REST operation is one provider credit.
- API Direct endpoint-specific pricing from $0.003 to $0.010, with paged endpoints charged per page.
- DeepSeek V4 Flash: $0.14/M cache-miss input, $0.0028/M cache-hit input, and $0.28/M
  output tokens; V4 Pro: $0.435/M cache-miss input, $0.003625/M cache-hit input, and $0.87/M
  output tokens. Settlement uses the provider's reported cached-input count.
- Groq `qwen/qwen3.6-27b`: $0.60/M input and $3.00/M output tokens.
- Voyage `rerank-2.5`: $0.05/M processed tokens.

Primary sources: [Exa pricing](https://exa.ai/pricing),
[FetchLayer pricing and endpoint coverage](https://fetchlayer.dev/),
[API Direct pricing](https://apidirect.io/docs/pricing),
[DeepSeek models and pricing](https://api-docs.deepseek.com/quick_start/pricing),
[Groq Qwen 3.6 model pricing](https://console.groq.com/docs/model/qwen/qwen3.6-27b),
[Voyage pricing](https://docs.voyageai.com/docs/pricing), and
[Supadata pricing](https://supadata.ai/pricing). The operational floors cover the
[GitHub REST API](https://docs.github.com/en/rest) and both the
[Hacker News Firebase API](https://github.com/HackerNews/API) and
[Hacker News Algolia API](https://hn.algolia.com/api).

## Expected request mix

These are planning assumptions, not fixed request prices. Dynamic charging uses actual operations
and tokens.

| Routed effort | Mix | Typical work                                                                                    | Estimated charge |
| ------------- | --: | ----------------------------------------------------------------------------------------------- | ---------------: |
| Low           | 75% | One primary discovery call, optional content fetch, about 3,500 input / 600 output Flash tokens |      8.2 credits |
| Medium        | 18% | Two to three discovery/content calls, reranking, about 7,000 input / 1,200 output Flash tokens  |     11.8 credits |
| High          |  6% | Several cross-platform calls, reranking, about 12,000 input / 2,500 output Pro tokens           |     33.6 credits |
| X High        |  1% | Broad cross-platform retrieval, about 25,000 input / 5,000 output Pro tokens                    |     71.7 credits |

Assume 40% of requests enter through Auto. A typical router call of 500 input and 50 output tokens
adds about 0.45 credit to those requests. The weighted estimate is about 11.2 credits per run, close
to the marketing page's rounded “about 10 credits” illustration.

For margin planning, assume 6% of consumed credits come from GitHub/Hacker News operational floors
with no request-level upstream fee. That produces an estimated blended COGS of $0.00094 per consumed
credit. Model and paid-tool credits otherwise map to at most $0.001 of upstream cost per credit.

## Plan margin estimate

The allowances and prices below come from the marketing home page. Subscription implementation and
checkout still carry older plan records; this project leaves those records unchanged.

Expected utilization assumptions are 65% Starter, 75% Pro, 80% Growth, and 85% Scale. Annual prices
are ten monthly payments for twelve months of credits, matching the marketing toggle before its
rounded per-month display.

| Marketing plan | Credits/month | Monthly price | Expected monthly COGS | Expected monthly gross margin | Annual price | Expected annual gross margin |
| -------------- | ------------: | ------------: | --------------------: | ----------------------------: | -----------: | ---------------------------: |
| Starter        |         5,000 |           $19 |                 $3.05 |                         83.9% |         $190 |                        80.7% |
| Pro            |        25,000 |           $79 |                $17.63 |                         77.7% |         $790 |                        73.2% |
| Growth         |        75,000 |          $199 |                $56.40 |                         71.7% |       $1,990 |                        66.0% |
| Scale          |       200,000 |          $499 |               $159.80 |                         68.0% |       $4,990 |                        61.6% |

The 250-credit Free allowance has a maximum paid-provider COGS of $0.25 and should be treated as
acquisition cost, not as a gross-margin plan.

### Full-utilization stress case

If every allowance credit is consumed entirely by paid operations at the $0.001 cost ceiling, the
monthly margins are 73.7% Starter, 68.4% Pro, 62.3% Growth, and 59.9% Scale. Under annual billing,
they are 68.4%, 62.0%, 54.8%, and 51.9%, respectively. Taxes, payment processing, database/compute,
support, free-tier provider allowances, and negotiated volume discounts are excluded from both the
expected and stress cases.

## Refresh checklist

1. Update integer rates and `PRICING_VERSION` in `packages/core/src/pricing.ts`.
2. Update any endpoint unit semantics, especially page multipliers and Supadata billable units.
3. Re-run pricing, reservation, provider, and worker tests.
4. Recalculate the four typical effort rows from observed 30-day tool and token usage.
5. Replace utilization and free-operation-share assumptions with observed cohorts, then refresh the
   margin table.

import { ArrowRight, KeyRound, Play, WalletCards } from "lucide-react";
import Link from "next/link";
import {
  getCreditBalance,
  getMonthUsage,
  getPlanState,
  listApiKeys,
  listRecentRequests,
  requireWorkspaceContext,
} from "../../../lib/server/dashboard";
import { formatCredits, formatDateTime, formatEffort } from "../../../lib/usage-formatting";

const quickstart = `curl -X POST "$SUPACONTEXT_API_URL/v1/context" \\
  -H "Authorization: Bearer $SUPACONTEXT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"What changed in AI agent tooling this week?","effort":"auto","max_credits":50}'`;

export default async function DashboardPage() {
  const workspace = await requireWorkspaceContext();
  const [plan, balance, monthUsage, keys, recentRequests] = await Promise.all([
    getPlanState(workspace.workspaceId),
    getCreditBalance(workspace.workspaceId),
    getMonthUsage(workspace.workspaceId),
    listApiKeys(workspace.workspaceId),
    listRecentRequests(workspace.workspaceId),
  ]);
  const activeKeys = keys.filter((key) => !key.revokedAt);

  return (
    <main className="dashboardPage">
      <section className="dashboardHero">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Ship one context tool for every agent.</h1>
          <p className="mutedText">
            Manage keys, run playground requests, inspect usage, and keep credit spend visible.
          </p>
        </div>
        <div className="heroActions">
          <Link className="button primaryButton" href="/keys">
            <KeyRound aria-hidden="true" size={16} />
            Create API key
          </Link>
          <Link className="button secondaryButton" href="/playground">
            <Play aria-hidden="true" size={16} />
            Open playground
          </Link>
        </div>
      </section>

      <section className="metricGrid">
        <article className="metricCard">
          <span>Current plan</span>
          <strong>{plan.name}</strong>
          <p>{plan.status}</p>
        </article>
        <article className="metricCard">
          <span>Credits remaining</span>
          <strong>{formatCredits(balance)}</strong>
          <p>
            {plan.includedCredits === null
              ? "Custom credits included"
              : `${formatCredits(plan.includedCredits)} included`}
          </p>
        </article>
        <article className="metricCard">
          <span>Usage this month</span>
          <strong>{formatCredits(monthUsage)}</strong>
          <p>{activeKeys.length} active keys</p>
        </article>
      </section>

      <section className="dashboardGrid">
        <article className="card wideCard">
          <div className="cardHeader">
            <div>
              <h2>Quickstart</h2>
              <p className="mutedText">
                Use a key from the dashboard and call the main context API.
              </p>
            </div>
            <Link className="iconLink" href="/docs/quickstart" aria-label="Open quickstart docs">
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
          <pre>{quickstart}</pre>
        </article>

        <article className="card">
          <div className="cardHeader">
            <div>
              <h2>Billing state</h2>
              <p className="mutedText">Current subscription and renewal.</p>
            </div>
            <WalletCards aria-hidden="true" size={20} />
          </div>
          <div className="rows">
            <div className="row">
              <span>Plan</span>
              <strong>{plan.name}</strong>
            </div>
            <div className="row">
              <span>Renewal</span>
              <strong>{formatDateTime(plan.renewalDate)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="section">
        <div className="card">
          <div className="cardHeader">
            <div>
              <h2>Recent requests</h2>
              <p className="mutedText">Latest context runs across API keys and the playground.</p>
            </div>
            <Link className="button secondaryButton" href="/usage">
              View usage
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
          {recentRequests.length === 0 ? (
            <div className="emptyState">
              <p>No requests yet.</p>
              <Link className="button primaryButton" href="/playground">
                Run playground
              </Link>
            </div>
          ) : (
            <div className="table">
              {recentRequests.map((request) => (
                <div className="tableRow" key={request.id}>
                  <span>{request.query}</span>
                  <span>{formatEffort(request.effort)}</span>
                  <span>{request.status}</span>
                  <strong>{formatCredits(request.creditsCharged)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

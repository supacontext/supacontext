import { REQUEST_STATUSES } from "@supacontext/core";
import {
  listApiKeys,
  listUsageRequests,
  parseUsageFilters,
  requireWorkspaceContext,
} from "../../../lib/server/dashboard";
import {
  formatCredits,
  formatDateTime,
  formatDurationMs,
  formatPlatforms,
} from "../../../lib/usage-formatting";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const workspace = await requireWorkspaceContext();
  const params = await searchParams;
  const filters = parseUsageFilters(params);
  const [keys, requests] = await Promise.all([
    listApiKeys(workspace.workspaceId),
    listUsageRequests(workspace.workspaceId, filters),
  ]);

  return (
    <main className="dashboardPage">
      <section className="cardHeader pageTitleRow">
        <div>
          <p className="eyebrow">Usage</p>
          <h1>Request history</h1>
          <p className="mutedText">Filter requests by date, key, depth, and status.</p>
        </div>
      </section>

      <form className="card filters" action="/usage">
        <label className="field">
          <span>From</span>
          <input defaultValue={filters.from ?? ""} name="from" type="date" />
        </label>
        <label className="field">
          <span>To</span>
          <input defaultValue={filters.to ?? ""} name="to" type="date" />
        </label>
        <label className="field">
          <span>Key</span>
          <select defaultValue={filters.keyId ?? ""} name="key">
            <option value="">All keys</option>
            {keys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Depth</span>
          <select defaultValue={filters.depth ?? ""} name="depth">
            <option value="">All depths</option>
            <option value="fast">fast</option>
            <option value="standard">standard</option>
            <option value="thorough">thorough</option>
            <option value="deep">deep</option>
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select defaultValue={filters.status ?? ""} name="status">
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button className="button primaryButton" type="submit">
          Apply
        </button>
      </form>

      <section className="card">
        {requests.length === 0 ? (
          <div className="emptyState">
            <p>No usage records match these filters.</p>
          </div>
        ) : (
          <div className="usageList">
            {requests.map((request) => (
              <details className="usageItem" key={request.id}>
                <summary>
                  <span>{request.query}</span>
                  <span>{request.depth}</span>
                  <span>{request.status}</span>
                  <strong>{formatCredits(request.creditsCharged)}</strong>
                </summary>
                <div className="usageDetails">
                  <div className="detailGrid">
                    <div>
                      <span>Key</span>
                      <strong>{request.keyName ?? "Deleted key"}</strong>
                    </div>
                    <div>
                      <span>Platforms</span>
                      <strong>{formatPlatforms(request.platforms)}</strong>
                    </div>
                    <div>
                      <span>Sources</span>
                      <strong>{request.sourcesUsed}</strong>
                    </div>
                    <div>
                      <span>Latency</span>
                      <strong>{formatDurationMs(request.latencyMs)}</strong>
                    </div>
                    <div>
                      <span>Cached</span>
                      <strong>{request.cached ? "Yes" : "No"}</strong>
                    </div>
                    <div>
                      <span>Created</span>
                      <strong>{formatDateTime(request.createdAt)}</strong>
                    </div>
                  </div>
                  {request.error ? <div className="alert errorAlert">{request.error}</div> : null}
                  <pre>{JSON.stringify(request.resultJson ?? { status: request.status }, null, 2)}</pre>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

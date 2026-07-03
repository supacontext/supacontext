import { listApiKeys, requireWorkspaceContext } from "../../../lib/server/dashboard";
import { PlaygroundClient } from "./playground-client";

export default async function PlaygroundPage() {
  const workspace = await requireWorkspaceContext();
  const keys = await listApiKeys(workspace.workspaceId);
  const hasApiKey = keys.some((key) => !key.revokedAt);

  return (
    <main className="dashboardPage">
      <PlaygroundClient hasApiKey={hasApiKey} />
    </main>
  );
}

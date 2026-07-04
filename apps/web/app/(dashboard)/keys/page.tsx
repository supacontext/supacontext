import { KeyManagementClient } from "./key-management-client";
import { listApiKeys, requireWorkspaceContext } from "../../../lib/server/dashboard";

export default async function KeysPage() {
  const workspace = await requireWorkspaceContext();
  const keys = await listApiKeys(workspace.workspaceId);

  return (
    <main className="dashboardPage">
      <KeyManagementClient initialKeys={keys} />
    </main>
  );
}

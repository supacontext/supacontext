import { getCliWorkspaceContext } from "../../../../lib/server/cli-auth";
import {
  DashboardError,
  createDashboardApiKey,
  listApiKeys,
} from "../../../../lib/server/dashboard";

function unauthorized() {
  return Response.json(
    {
      error: {
        code: "AUTH_REQUIRED",
        message: "Valid browser authorization is required.",
      },
    },
    { status: 401 },
  );
}

function jsonError(error: unknown) {
  if (!(error instanceof DashboardError)) {
    console.error(error);
  }

  const status = error instanceof DashboardError ? error.statusCode : 500;
  const code = error instanceof DashboardError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof DashboardError ? error.message : "Internal server error.";

  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export async function GET(request: Request) {
  const workspace = await getCliWorkspaceContext(request);

  if (!workspace) {
    return unauthorized();
  }

  try {
    return Response.json({ keys: await listApiKeys(workspace.workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  const workspace = await getCliWorkspaceContext(request);

  if (!workspace) {
    return unauthorized();
  }

  try {
    const body = await request.json();

    return Response.json(await createDashboardApiKey(workspace, body));
  } catch (error) {
    return jsonError(error);
  }
}

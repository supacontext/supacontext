import {
  DashboardError,
  createBillingPortal,
  getWorkspaceContext,
} from "../../../../../lib/server/dashboard";

function jsonError(error: DashboardError | Error) {
  const status = error instanceof DashboardError ? error.statusCode : 500;
  const code = error instanceof DashboardError ? error.code : "INTERNAL_ERROR";

  return Response.json(
    {
      error: {
        code,
        message: error.message,
      },
    },
    { status },
  );
}

export async function POST() {
  const workspace = await getWorkspaceContext();

  if (!workspace) {
    return Response.json(
      {
        error: {
          code: "AUTH_REQUIRED",
          message: "Sign in required.",
        },
      },
      { status: 401 },
    );
  }

  try {
    const url = await createBillingPortal(workspace.workspaceId);

    return Response.json({ url });
  } catch (error) {
    return jsonError(error instanceof Error ? error : new Error("Unknown error."));
  }
}

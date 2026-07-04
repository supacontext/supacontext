import {
  DashboardError,
  getStoredPlaygroundRequest,
  getWorkspaceContext,
} from "../../../../../lib/server/dashboard";

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

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
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
    const { id } = await context.params;
    const result = await getStoredPlaygroundRequest(workspace.workspaceId, id);

    if (!result) {
      throw new DashboardError(404, "REQUEST_NOT_FOUND", "Playground request not found.");
    }

    return Response.json({
      status: result.status,
      result,
      creditsCharged: result.usage.credits_charged,
      sourcesUsed: result.usage.sources_used,
    });
  } catch (error) {
    return jsonError(error);
  }
}

import {
  DashboardError,
  getWorkspaceContext,
  runPlaygroundRequest,
} from "../../../../lib/server/dashboard";

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

export async function POST(request: Request) {
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
    const body = await request.json();
    const result = await runPlaygroundRequest(workspace, body);

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

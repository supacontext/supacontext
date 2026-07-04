import {
  DashboardError,
  createBillingCheckout,
  getWorkspaceContext,
  parsePaidPlan,
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
    const body = (await request.json()) as { plan?: unknown };
    const plan = parsePaidPlan(body.plan);

    if (!plan) {
      throw new DashboardError(400, "INVALID_PLAN", "Choose a paid plan.");
    }

    const url = await createBillingCheckout(workspace.workspaceId, plan);

    return Response.json({ url });
  } catch (error) {
    return jsonError(error);
  }
}

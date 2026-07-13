import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "../../../../../lib/server/auth";
import { CliAuthError, decideCliDeviceAuthorization } from "../../../../../lib/server/cli-auth";
import { getWorkspaceContext } from "../../../../../lib/server/dashboard";
import { webEnv } from "../../../../../lib/server/env";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  const workspace = await getWorkspaceContext();

  if (!workspace) {
    return NextResponse.redirect(new URL("/sign-in", webEnv.APP_URL), 303);
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return redirectResult("invalid");
  }

  const userCode = form.get("user_code");
  const decision = form.get("decision");

  if (typeof userCode !== "string" || (decision !== "approve" && decision !== "deny")) {
    return redirectResult("invalid");
  }

  try {
    const status = await decideCliDeviceAuthorization({
      profileId: workspace.profileId,
      userCode,
      decision,
    });

    return redirectResult(status === "approved" ? "approved" : status);
  } catch (error) {
    if (!(error instanceof CliAuthError)) {
      console.error("Could not update CLI authorization.");
    }

    return redirectResult(
      error instanceof CliAuthError && error.statusCode === 429 ? "rate_limited" : "invalid",
    );
  }
}

function redirectResult(result: string) {
  const url = new URL("/cli/authorize", webEnv.APP_URL);

  url.searchParams.set("result", result);
  return NextResponse.redirect(url, 303);
}

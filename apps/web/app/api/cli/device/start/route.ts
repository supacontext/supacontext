import { createCliDeviceAuthorization, CliAuthError } from "../../../../../lib/server/cli-auth";
import { isSameOriginRequest } from "../../../../../lib/server/auth";
import { webEnv } from "../../../../../lib/server/env";

export async function POST(request: Request) {
  if (request.headers.has("origin") && !isSameOriginRequest(request)) {
    return Response.json({ error: "invalid_request" }, { status: 403 });
  }

  try {
    const authorization = await createCliDeviceAuthorization(request);
    const verificationUri = new URL("/cli/authorize", webEnv.APP_URL).toString();
    const verificationComplete = new URL(verificationUri);

    verificationComplete.searchParams.set("user_code", authorization.userCode);

    return Response.json(
      {
        device_code: authorization.deviceCode,
        user_code: authorization.userCode,
        verification_uri: verificationUri,
        verification_uri_complete: verificationComplete.toString(),
        expires_in: authorization.expiresIn,
        interval: authorization.interval,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CliAuthError) {
      return Response.json(
        { error: error.code.toLowerCase(), error_description: error.message },
        { status: error.statusCode },
      );
    }

    console.error("Could not start CLI authorization.");
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

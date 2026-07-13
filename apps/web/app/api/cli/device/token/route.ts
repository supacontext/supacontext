import { CliAuthError, redeemCliDeviceAuthorization } from "../../../../../lib/server/cli-auth";
import { isSameOriginRequest } from "../../../../../lib/server/auth";

export async function POST(request: Request) {
  if (request.headers.has("origin") && !isSameOriginRequest(request)) {
    return Response.json({ error: "invalid_request" }, { status: 403 });
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const deviceCode = form.get("device_code");

  try {
    const result = await redeemCliDeviceAuthorization(
      request,
      typeof deviceCode === "string" ? deviceCode : "",
    );

    if (result.status === "authorized") {
      return Response.json(
        {
          access_token: result.accessToken,
          token_type: "Bearer",
          expires_in: result.expiresIn,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const error =
      result.status === "pending"
        ? "authorization_pending"
        : result.status === "slow_down"
          ? "slow_down"
          : result.status === "denied"
            ? "access_denied"
            : result.status === "consumed"
              ? "consumed_token"
              : "expired_token";

    return Response.json(
      { error },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          ...(result.status === "pending" || result.status === "slow_down"
            ? { "Retry-After": String(result.interval) }
            : {}),
        },
      },
    );
  } catch (error) {
    if (error instanceof CliAuthError) {
      return Response.json(
        { error: error.code.toLowerCase(), error_description: error.message },
        { status: error.statusCode },
      );
    }

    console.error("Could not redeem CLI authorization.");
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

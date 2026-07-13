import { saveSession } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";
import {
  authFlowCookieName,
  authFlowCookieOptions,
  authRetryPath,
  authenticateOAuthCode,
  readOAuthFlow,
} from "../../../lib/server/auth";
import { provisionWorkspaceForUser } from "../../../lib/server/dashboard";
import { webEnv } from "../../../lib/server/env";

const accountConflictErrors = new Set([
  "email_verification_required",
  "mfa_challenge",
  "mfa_enrollment",
  "organization_authentication_required",
  "organization_selection_required",
  "oauth_account_linking_required",
  "sso_required",
  "user_conflict",
]);

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const flow = state ? await readOAuthFlow(request, state) : null;

  if (!state || !flow) {
    return errorRedirect(request, state, null, "invalid_session");
  }

  const providerError = request.nextUrl.searchParams.get("error");

  if (providerError) {
    return errorRedirect(
      request,
      state,
      flow,
      providerError === "access_denied" ? "access_denied" : "provider_error",
    );
  }

  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return errorRedirect(request, state, flow, "invalid_callback");
  }

  let authentication: Awaited<ReturnType<typeof authenticateOAuthCode>>;

  try {
    authentication = await authenticateOAuthCode({ code, flow, request });
  } catch (error) {
    const category = authenticationErrorCategory(error);

    console.error("OAuth callback authentication failed.", { category });
    return errorRedirect(request, state, flow, category);
  }

  try {
    await provisionWorkspaceForUser(authentication.user);
  } catch {
    console.error("OAuth callback workspace provisioning failed.", {
      workosUserId: authentication.user.id,
    });
    return errorRedirect(request, state, flow, "provisioning_failed");
  }

  try {
    await saveSession(authentication, request);
  } catch {
    console.error("OAuth callback session creation failed.", {
      workosUserId: authentication.user.id,
    });
    return errorRedirect(request, state, flow, "session_failed");
  }

  const response = NextResponse.redirect(new URL(flow.returnPath, webEnv.APP_URL), 303);

  deleteFlowCookie(response, state);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function errorRedirect(
  request: NextRequest,
  state: string | null,
  flow: Awaited<ReturnType<typeof readOAuthFlow>>,
  error: string,
) {
  const response = NextResponse.redirect(new URL(authRetryPath(flow, error), webEnv.APP_URL), 303);

  if (state) {
    deleteFlowCookie(response, state);
  } else {
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sc-auth-flow-")) {
        response.cookies.set(cookie.name, "", { ...authFlowCookieOptions(), maxAge: 0 });
      }
    }
  }

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function deleteFlowCookie(response: NextResponse, state: string) {
  response.cookies.set(authFlowCookieName(state), "", {
    ...authFlowCookieOptions(),
    maxAge: 0,
  });
}

function authenticationErrorCategory(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "callback_failed";
  }

  const candidate = error as {
    error?: unknown;
    rawData?: { error?: unknown };
  };
  const code =
    typeof candidate.error === "string"
      ? candidate.error
      : typeof candidate.rawData?.error === "string"
        ? candidate.rawData.error
        : undefined;

  return code && accountConflictErrors.has(code) ? "account_conflict" : "callback_failed";
}

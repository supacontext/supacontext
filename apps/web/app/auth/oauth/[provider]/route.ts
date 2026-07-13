import { NextResponse, type NextRequest } from "next/server";
import {
  authFlowCookieOptions,
  createOAuthFlow,
  isOAuthProvider,
  isSameOriginRequest,
  normalizeReturnPath,
  type AuthIntent,
} from "../../../../lib/server/auth";
import { webEnv } from "../../../../lib/server/env";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;

  if (!isOAuthProvider(provider)) {
    return new Response("Not found", { status: 404 });
  }

  if (!isSameOriginRequest(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_request", webEnv.APP_URL), 303);
  }

  const intent: AuthIntent = form.get("intent") === "sign-up" ? "sign-up" : "sign-in";
  const returnTo = typeof form.get("returnTo") === "string" ? String(form.get("returnTo")) : null;

  try {
    const flow = await createOAuthFlow({
      provider,
      returnTo: normalizeReturnPath(returnTo),
      intent,
    });
    const response = NextResponse.redirect(flow.url, 303);

    response.cookies.set(flow.cookieName, flow.cookieValue, authFlowCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const page = intent === "sign-up" ? "/sign-up" : "/sign-in";
    const params = new URLSearchParams({
      error: "provider_unavailable",
      returnTo: normalizeReturnPath(returnTo),
    });

    return NextResponse.redirect(new URL(`${page}?${params.toString()}`, webEnv.APP_URL), 303);
  }
}

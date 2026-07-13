import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { WorkOS, type AuthenticationResponse } from "@workos-inc/node";
import { sealData, unsealData } from "iron-session";
import type { NextRequest } from "next/server";
import { webEnv } from "./env";

const AUTH_FLOW_TTL_SECONDS = 10 * 60;
const AUTH_FLOW_COOKIE_PREFIX = "sc-auth-flow-";
const AUTH_PATHS = ["/auth/", "/sign-in", "/sign-up"];

export const oauthProviders = {
  google: "GoogleOAuth",
  github: "GitHubOAuth",
} as const;

export type OAuthProvider = keyof typeof oauthProviders;
export type AuthIntent = "sign-in" | "sign-up";

type OAuthFlow = {
  state: string;
  codeVerifier: string;
  provider: OAuthProvider;
  returnPath: string;
  intent: AuthIntent;
};

const workos = new WorkOS(webEnv.WORKOS_API_KEY, {
  clientId: webEnv.WORKOS_CLIENT_ID,
});

export function isOAuthProvider(value: string): value is OAuthProvider {
  return Object.hasOwn(oauthProviders, value);
}

export function normalizeReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    value.length > 2_048 ||
    value.includes("\\") ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);

      return code < 32 || code === 127;
    })
  ) {
    return "/dashboard";
  }

  try {
    const appUrl = new URL(webEnv.APP_URL);
    const candidate = new URL(value, appUrl);

    if (candidate.origin !== appUrl.origin || !["http:", "https:"].includes(candidate.protocol)) {
      return "/dashboard";
    }

    const path = `${candidate.pathname}${candidate.search}${candidate.hash}`;

    if (AUTH_PATHS.some((authPath) => candidate.pathname.startsWith(authPath))) {
      return "/dashboard";
    }

    return path;
  } catch {
    return "/dashboard";
  }
}

export function isSameOriginRequest(request: Request): boolean {
  const expectedOrigin = new URL(webEnv.APP_URL).origin;
  const origin = request.headers.get("origin");

  if (origin) {
    return origin === expectedOrigin;
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}

export async function createOAuthFlow(input: {
  provider: OAuthProvider;
  returnTo?: string | null;
  intent: AuthIntent;
}): Promise<{ cookieName: string; cookieValue: string; url: string }> {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const flow: OAuthFlow = {
    state,
    codeVerifier,
    provider: input.provider,
    returnPath: normalizeReturnPath(input.returnTo),
    intent: input.intent,
  };
  const cookieValue = await sealData(flow, {
    password: webEnv.WORKOS_COOKIE_PASSWORD,
    ttl: AUTH_FLOW_TTL_SECONDS,
  });
  const url = workos.userManagement.getAuthorizationUrl({
    clientId: webEnv.WORKOS_CLIENT_ID,
    redirectUri: webEnv.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
    provider: oauthProviders[input.provider],
    state,
    codeChallenge,
    codeChallengeMethod: "S256",
  });

  return {
    cookieName: authFlowCookieName(state),
    cookieValue,
    url,
  };
}

export async function readOAuthFlow(
  request: NextRequest,
  state: string,
): Promise<OAuthFlow | null> {
  const value = request.cookies.get(authFlowCookieName(state))?.value;

  if (!value) {
    return null;
  }

  try {
    const flow = await unsealData<unknown>(value, {
      password: webEnv.WORKOS_COOKIE_PASSWORD,
    });

    if (!isOAuthFlow(flow) || !safeEqual(flow.state, state)) {
      return null;
    }

    return {
      ...flow,
      returnPath: normalizeReturnPath(flow.returnPath),
    };
  } catch {
    return null;
  }
}

export async function authenticateOAuthCode(input: {
  code: string;
  flow: OAuthFlow;
  request: NextRequest;
}): Promise<AuthenticationResponse> {
  const userAgent = input.request.headers.get("user-agent");
  const response = await workos.userManagement.authenticateWithCode({
    clientId: webEnv.WORKOS_CLIENT_ID,
    code: input.code,
    codeVerifier: input.flow.codeVerifier,
    ...(userAgent ? { userAgent } : {}),
  });

  if (
    !response.accessToken ||
    !response.refreshToken ||
    response.authenticationMethod !== oauthProviders[input.flow.provider]
  ) {
    throw new Error("Invalid OAuth authentication response.");
  }

  return response;
}

export function authFlowCookieName(state: string): string {
  const fingerprint = createHash("sha256").update(state).digest("hex").slice(0, 16);

  return `${AUTH_FLOW_COOKIE_PREFIX}${fingerprint}`;
}

export function authFlowCookieOptions() {
  return {
    httpOnly: true,
    maxAge: AUTH_FLOW_TTL_SECONDS,
    path: "/auth/callback",
    sameSite: "lax" as const,
    secure: new URL(webEnv.APP_URL).protocol === "https:",
  };
}

export function authRetryPath(flow: OAuthFlow | null, error: string): string {
  const page = flow?.intent === "sign-up" ? "/sign-up" : "/sign-in";
  const params = new URLSearchParams({ error });

  if (flow) {
    params.set("returnTo", flow.returnPath);
  }

  return `${page}?${params.toString()}`;
}

function isOAuthFlow(value: unknown): value is OAuthFlow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const flow = value as Partial<OAuthFlow>;

  return (
    typeof flow.state === "string" &&
    typeof flow.codeVerifier === "string" &&
    typeof flow.returnPath === "string" &&
    (flow.intent === "sign-in" || flow.intent === "sign-up") &&
    typeof flow.provider === "string" &&
    isOAuthProvider(flow.provider)
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

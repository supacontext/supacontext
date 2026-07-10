import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";
import { WorkOS } from "@workos-inc/node";
import { getWorkspaceContextForUser, type WorkspaceContext } from "./dashboard";
import { webEnv } from "./env";

const jwks = createRemoteJWKSet(
  new URL(`https://api.workos.com/sso/jwks/${encodeURIComponent(webEnv.WORKOS_CLIENT_ID)}`),
);
const workos = new WorkOS(webEnv.WORKOS_API_KEY, {
  clientId: webEnv.WORKOS_CLIENT_ID,
});

function acceptedIssuers(): string[] {
  if (!webEnv.WORKOS_AUTHKIT_DOMAIN) {
    return ["https://api.workos.com", "https://api.workos.com/"];
  }

  const origin = new URL(webEnv.WORKOS_AUTHKIT_DOMAIN).origin;

  return [origin, `${origin}/`];
}

export async function getCliWorkspaceContext(request: Request): Promise<WorkspaceContext | null> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);

  if (!match?.[1]) {
    return null;
  }

  let workosUserId: string;

  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      algorithms: ["RS256"],
      issuer: acceptedIssuers(),
    });

    if (payload.client_id !== webEnv.WORKOS_CLIENT_ID || typeof payload.sub !== "string") {
      return null;
    }

    workosUserId = payload.sub;
  } catch {
    return null;
  }

  try {
    const user = await workos.userManagement.getUser(workosUserId);

    return getWorkspaceContextForUser(user);
  } catch {
    return null;
  }
}

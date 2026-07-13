import { signOut } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { isSameOriginRequest } from "../../../lib/server/auth";
import { webEnv } from "../../../lib/server/env";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  await signOut({ returnTo: webEnv.APP_URL });
  return new Response(null, { status: 204 });
}

import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { webEnv } from "../../lib/server/env";

export async function GET() {
  redirect(
    await getSignInUrl({
      redirectUri: webEnv.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
      returnTo: "/dashboard",
    }),
  );
}

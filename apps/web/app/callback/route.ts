import { handleAuth } from "@workos-inc/authkit-nextjs";
import { webEnv } from "../../lib/server/env";

export const GET = handleAuth({
  baseURL: webEnv.APP_URL,
  returnPathname: "/dashboard",
});

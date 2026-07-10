import { handleAuth } from "@workos-inc/authkit-nextjs";
import { provisionWorkspaceForUser } from "../../lib/server/dashboard";
import { webEnv } from "../../lib/server/env";

export const GET = handleAuth({
  baseURL: webEnv.APP_URL,
  returnPathname: "/dashboard",
  onSuccess: async ({ user }) => {
    await provisionWorkspaceForUser(user);
  },
});

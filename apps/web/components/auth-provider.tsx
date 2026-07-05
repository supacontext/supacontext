"use client";

import type { NoUserInfo, UserInfo } from "@workos-inc/authkit-nextjs";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import type { ReactNode } from "react";

type InitialAuth = Omit<UserInfo | NoUserInfo, "accessToken">;

export function AuthProvider({
  children,
  initialAuth,
}: {
  children: ReactNode;
  initialAuth: InitialAuth;
}) {
  return <AuthKitProvider initialAuth={initialAuth}>{children}</AuthKitProvider>;
}

"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { LogOut } from "lucide-react";

function getInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean);

  return words.slice(0, 2).join("").toUpperCase() || "SC";
}

export function UserMenu() {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="userMenuSkeleton" aria-label="Loading user menu" />;
  }

  if (!user) {
    return null;
  }

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;

  return (
    <div className="userMenu">
      <span className="userAvatar" aria-hidden="true">
        {getInitials(displayName)}
      </span>
      <span className="userEmail">{user.email}</span>
      <form action="/auth/sign-out" method="post">
        <button aria-label="Sign out" className="iconButton" type="submit">
          <LogOut aria-hidden="true" size={16} />
        </button>
      </form>
    </div>
  );
}

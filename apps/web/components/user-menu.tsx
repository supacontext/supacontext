"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { LogOut } from "lucide-react";
import { useState } from "react";

function getInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean);

  return words.slice(0, 2).join("").toUpperCase() || "SC";
}

export function UserMenu() {
  const { loading, signOut, user } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
      <button
        aria-label="Sign out"
        className="iconButton"
        disabled={isSigningOut}
        onClick={() => {
          setIsSigningOut(true);
          void signOut();
        }}
        type="button"
      >
        <LogOut aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

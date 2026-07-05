"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { ArrowRight, LogIn } from "lucide-react";
import Link from "next/link";
import { UserMenu } from "./user-menu";

export function PublicAuthControls() {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="authControls" aria-label="Loading authentication controls" />;
  }

  return (
    <div className="authControls">
      {user ? (
        <>
          <Link className="button primaryButton" href="/dashboard">
            Dashboard
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <UserMenu />
        </>
      ) : (
        <>
          <Link className="button secondaryButton" href="/sign-in">
            <LogIn aria-hidden="true" size={16} />
            Sign in
          </Link>
          <Link className="button primaryButton" href="/sign-up">
            Start Free
            <span className="buttonDivider" aria-hidden="true" />
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </>
      )}
    </div>
  );
}

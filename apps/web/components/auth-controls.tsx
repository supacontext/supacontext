"use client";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { ArrowRight, LogIn } from "lucide-react";
import Link from "next/link";

export function PublicAuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="authControls" aria-label="Loading authentication controls" />;
  }

  return (
    <div className="authControls">
      {isSignedIn ? (
        <>
          <Link className="button primaryButton" href="/dashboard">
            Dashboard
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <UserButton />
        </>
      ) : (
        <>
        <SignInButton mode="modal">
          <button className="button secondaryButton" type="button">
            <LogIn aria-hidden="true" size={16} />
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="button primaryButton" type="button">
            Start free
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </SignUpButton>
        </>
      )}
    </div>
  );
}

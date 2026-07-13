import { withAuth } from "@workos-inc/authkit-nextjs";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { normalizeReturnPath, type AuthIntent } from "../lib/server/auth";
import { LogoMark } from "./icons";

const errorMessages: Record<string, string> = {
  access_denied:
    "You canceled the sign-in request. Choose a provider when you’re ready to try again.",
  account_conflict:
    "This account needs help before it can sign in with Google or GitHub. Contact support or try your other provider.",
  callback_failed: "We couldn’t finish signing you in. Start a new request and try again.",
  invalid_callback: "The sign-in response was incomplete. Start a new request and try again.",
  invalid_request: "That sign-in request wasn’t valid. Try again from this page.",
  invalid_session: "Your sign-in request expired or could not be verified. Start again below.",
  provider_error: "The provider couldn’t complete sign-in. Try again or choose the other provider.",
  provider_unavailable: "Sign-in is temporarily unavailable. Try again in a moment.",
  provisioning_failed: "We signed you in but couldn’t prepare your workspace. Try again.",
  session_failed: "We couldn’t create your session. Start a new sign-in request and try again.",
};

export async function AuthPage({
  intent,
  searchParams,
}: {
  intent: AuthIntent;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = normalizeReturnPath(singleValue(params.returnTo));
  const error = singleValue(params.error);
  const { user } = await withAuth();

  if (user) {
    redirect(returnTo);
  }

  const isSignUp = intent === "sign-up";
  const isCli = returnTo.startsWith("/cli/authorize");
  const alternateParams = new URLSearchParams();

  if (returnTo !== "/dashboard") {
    alternateParams.set("returnTo", returnTo);
  }

  const alternateHref = `${isSignUp ? "/sign-in" : "/sign-up"}${alternateParams.size ? `?${alternateParams.toString()}` : ""}`;

  return (
    <main className="authPage">
      <div className="authBackdrop" aria-hidden="true" />
      <section className="authCard" aria-labelledby="auth-title">
        <Link className="brand authBrand" href="/">
          <LogoMark className="brandMark" />
          <span>supacontext</span>
        </Link>
        <div className="authHeading">
          <p className="authEyebrow">{isCli ? "CLI authorization" : "Developer account"}</p>
          <h1 id="auth-title">{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p>
            {isCli
              ? "Sign in to approve this Supacontext CLI request."
              : isSignUp
                ? "Start with Google or GitHub. No password required."
                : "Continue with the provider linked to your account."}
          </p>
        </div>

        {error && errorMessages[error] ? (
          <div className="authError" role="alert">
            {errorMessages[error]}
          </div>
        ) : null}

        <div className="authProviderList">
          <ProviderForm
            icon={<GoogleIcon />}
            intent={intent}
            label="Continue with Google"
            provider="google"
            returnTo={returnTo}
          />
          <ProviderForm
            icon={<GitHubIcon />}
            intent={intent}
            label="Continue with GitHub"
            provider="github"
            returnTo={returnTo}
          />
        </div>

        <p className="authAlternate">
          {isSignUp ? "Already have an account?" : "New to Supacontext?"}{" "}
          <Link href={alternateHref}>{isSignUp ? "Sign in" : "Create an account"}</Link>
        </p>
        <div className="authSecurityNote">
          <ShieldCheck aria-hidden="true" size={17} />
          <span>
            Supacontext keeps your session encrypted and your provider credentials private.
          </span>
        </div>
        <Link className="authBackLink" href="/">
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Supacontext
        </Link>
      </section>
    </main>
  );
}

function ProviderForm({
  icon,
  intent,
  label,
  provider,
  returnTo,
}: {
  icon: ReactNode;
  intent: AuthIntent;
  label: string;
  provider: "google" | "github";
  returnTo: string;
}) {
  return (
    <form action={`/auth/oauth/${provider}`} method="post">
      <input name="intent" type="hidden" value={intent} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <button className="authProviderButton" type="submit">
        {icon}
        <span>{label}</span>
      </button>
    </form>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
      <path
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
      <path
        d="M21.35 12.22c0-.72-.06-1.25-.2-1.8H12v3.48h5.37a4.7 4.7 0 0 1-2 3.03l-.02.12 2.9 2.25.2.02c1.84-1.7 2.9-4.2 2.9-7.1Z"
        fill="#4285F4"
      />
      <path
        d="M12 21.75c2.62 0 4.82-.86 6.43-2.43l-3.06-2.39c-.82.56-1.92.96-3.37.96a5.85 5.85 0 0 1-5.54-4.04l-.12.01-3.02 2.34-.04.11A9.7 9.7 0 0 0 12 21.75Z"
        fill="#34A853"
      />
      <path
        d="M6.46 13.85A5.98 5.98 0 0 1 6.14 12c0-.64.11-1.27.3-1.85v-.12L3.4 7.66l-.1.05A9.75 9.75 0 0 0 2.25 12c0 1.55.37 3.02 1.03 4.3l3.18-2.45Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.11c1.85 0 3.1.8 3.82 1.46l2.68-2.62A9.1 9.1 0 0 0 12 2.25a9.7 9.7 0 0 0-8.72 5.46l3.16 2.44A5.87 5.87 0 0 1 12 6.11Z"
        fill="#EB4335"
      />
    </svg>
  );
}

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

import { CheckCircle2, TerminalSquare, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoMark } from "../../../components/icons";
import { getCliDeviceAuthorization } from "../../../lib/server/cli-auth";
import { getWorkspaceContext } from "../../../lib/server/dashboard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const resultMessages: Record<string, { title: string; message: string; success: boolean }> = {
  approved: {
    title: "CLI authorized",
    message: "Return to your terminal to finish choosing or creating an API key.",
    success: true,
  },
  denied: {
    title: "Request denied",
    message: "The CLI request was denied. You can close this window.",
    success: false,
  },
  expired: {
    title: "Request expired",
    message: "Run supacontext auth login again to start a new request.",
    success: false,
  },
  consumed: {
    title: "Request already used",
    message: "This request cannot be approved or redeemed again.",
    success: false,
  },
  invalid: {
    title: "Request not found",
    message: "Check the code or run supacontext auth login again.",
    success: false,
  },
  rate_limited: {
    title: "Too many attempts",
    message: "Wait a minute, then try again.",
    success: false,
  },
};

export default async function CliAuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const result = singleValue(params.result);
  const userCode = singleValue(params.user_code)?.trim() ?? "";

  if (result && resultMessages[result]) {
    return <ResultCard {...resultMessages[result]!} />;
  }

  if (!userCode) {
    return <CodeEntry />;
  }

  const authorization = await getCliDeviceAuthorization(userCode);

  if (!authorization) {
    return <ResultCard {...resultMessages.invalid!} />;
  }

  if (authorization.status !== "pending") {
    const status = authorization.status === "approved" ? "approved" : authorization.status;

    return <ResultCard {...(resultMessages[status] ?? resultMessages.invalid!)} />;
  }

  const workspace = await getWorkspaceContext();

  if (!workspace) {
    const returnTo = `/cli/authorize?user_code=${encodeURIComponent(authorization.code)}`;

    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <AuthShell>
      <div className="cliAuthIcon" aria-hidden="true">
        <TerminalSquare size={25} />
      </div>
      <div className="authHeading">
        <p className="authEyebrow">CLI authorization</p>
        <h1 id="cli-auth-title">Approve this terminal?</h1>
        <p>Only continue if your terminal shows this code.</p>
      </div>
      <div className="cliUserCode" aria-label={`Authorization code ${authorization.code}`}>
        {authorization.code}
      </div>
      <p className="cliAuthAccount">
        Signed in as{" "}
        <strong>{workspace.email ?? workspace.displayName ?? "Supacontext user"}</strong>
      </p>
      <form action="/api/cli/device/decision" className="cliDecisionForm" method="post">
        <input name="user_code" type="hidden" value={authorization.code} />
        <button
          className="button primaryButton fullButton"
          name="decision"
          type="submit"
          value="approve"
        >
          Approve CLI
        </button>
        <button
          className="button secondaryButton fullButton"
          name="decision"
          type="submit"
          value="deny"
        >
          Deny
        </button>
      </form>
      <p className="authSecurityNote">
        Approval gives this CLI a short-lived credential for API-key setup. It does not share your
        browser session.
      </p>
    </AuthShell>
  );
}

function CodeEntry() {
  return (
    <AuthShell>
      <div className="cliAuthIcon" aria-hidden="true">
        <TerminalSquare size={25} />
      </div>
      <div className="authHeading">
        <p className="authEyebrow">CLI authorization</p>
        <h1 id="cli-auth-title">Enter your terminal code</h1>
        <p>Copy the code shown by supacontext auth login.</p>
      </div>
      <form className="cliCodeForm" method="get">
        <label htmlFor="user-code">Authorization code</label>
        <input
          autoCapitalize="characters"
          autoComplete="one-time-code"
          id="user-code"
          maxLength={15}
          name="user_code"
          placeholder="ABCD-EFGH-JKLMN"
          required
          spellCheck={false}
        />
        <button className="button primaryButton fullButton" type="submit">
          Continue
        </button>
      </form>
    </AuthShell>
  );
}

function ResultCard({
  title,
  message,
  success,
}: {
  title: string;
  message: string;
  success: boolean;
}) {
  return (
    <AuthShell>
      <div className={`cliAuthIcon ${success ? "success" : "error"}`} aria-hidden="true">
        {success ? <CheckCircle2 size={26} /> : <XCircle size={26} />}
      </div>
      <div className="authHeading">
        <p className="authEyebrow">CLI authorization</p>
        <h1 id="cli-auth-title">{title}</h1>
        <p>{message}</p>
      </div>
      <Link className="button secondaryButton fullButton" href="/dashboard">
        Go to dashboard
      </Link>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="authPage">
      <div className="authBackdrop" aria-hidden="true" />
      <section className="authCard cliAuthCard" aria-labelledby="cli-auth-title">
        <Link className="brand authBrand" href="/">
          <LogoMark className="brandMark" />
          <span>supacontext</span>
        </Link>
        {children}
      </section>
    </main>
  );
}

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

import { BarChart3, CreditCard, Gauge, KeyRound, Play, TerminalSquare } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth-provider";
import { UserMenu } from "./user-menu";

const appLinks = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/playground", label: "Playground", icon: Play },
  { href: "/keys", label: "Keys", icon: KeyRound },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="appFrame">
      <aside className="sidebar">
        <Link className="brand appBrand" href="/dashboard">
          <span className="brandMark" aria-hidden="true" />
          SupaContext
        </Link>
        <nav className="appNav" aria-label="Dashboard navigation">
          {appLinks.map((link) => {
            const Icon = link.icon;

            return (
              <Link href={link.href} key={link.href}>
                <Icon aria-hidden="true" size={17} />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <Link className="docsShortcut" href="/docs/api-reference">
          <TerminalSquare aria-hidden="true" size={16} />
          API reference
        </Link>
      </aside>
      <div className="appMain">
        <header className="appTopbar">
          <div>
            <p className="topbarEyebrow">Developer dashboard</p>
            <p className="topbarTitle">Live context for agent workflows</p>
          </div>
          <AuthProvider>
            <UserMenu />
          </AuthProvider>
        </header>
        {children}
      </div>
    </div>
  );
}

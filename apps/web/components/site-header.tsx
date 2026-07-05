import Link from "next/link";
import { PublicAuthControls } from "./auth-controls";

const publicLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs/quickstart", label: "Quickstart" },
];

export function SiteHeader() {
  return (
    <header className="siteHeader">
      <Link className="brand" href="/">
        <span className="brandMark" aria-hidden="true" />
        <span>SupaContext</span>
      </Link>
      <nav className="publicNav" aria-label="Main navigation">
        {publicLinks.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <PublicAuthControls />
    </header>
  );
}

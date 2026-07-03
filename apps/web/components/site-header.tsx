import Link from "next/link";
import { PublicAuthControls } from "./auth-controls";

const publicLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/docs/quickstart", label: "Quickstart" },
];

export function SiteHeader() {
  return (
    <header className="siteHeader">
      <Link className="brand" href="/">
        <span className="brandMark" aria-hidden="true" />
        SupaContext
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

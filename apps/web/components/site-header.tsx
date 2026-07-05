"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PublicAuthControls } from "./auth-controls";
import { LogoMark } from "./icons";

const publicLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs/quickstart", label: "Quickstart" },
];

export function SiteHeader() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsScrolled(!entry?.isIntersecting);
    });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="siteHeaderSentinel" aria-hidden="true" />
      <header className={`siteHeader${isScrolled ? " siteHeaderScrolled" : ""}`}>
        <Link className="brand" href="/">
          <LogoMark className="brandMark" />
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
    </>
  );
}

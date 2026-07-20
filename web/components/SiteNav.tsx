"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Search" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/players", label: "Players" },
  { href: "/champions", label: "Champions" },
  { href: "/records", label: "Records" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const links = LINKS.map((l) => (
    <Link
      key={l.href}
      href={l.href}
      className={isActive(l.href) ? "active" : undefined}
      onClick={() => setOpen(false)}
    >
      {l.label}
    </Link>
  ));

  return (
    <>
      <nav className="nav">{links}</nav>
      <button
        type="button"
        className="nav-toggle"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <i aria-hidden="true" />
      </button>
      {open && (
        <div className="nav-overlay" role="dialog" aria-label="Site navigation">
          <button
            type="button"
            className="nav-close"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
          {links}
        </div>
      )}
    </>
  );
}

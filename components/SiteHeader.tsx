"use client";
import { Bookmark, Menu, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
const links = [
  { href: "/events?radius=uk", label: "Find events" },
  { href: "/clubs", label: "Clubs & organisers" },
  { href: "/membership", label: "The Roadbook" },
  { href: "/submit-event/new", label: "Add an event" },
];
export function SiteHeader({
  signedIn,
  isAdmin,
}: {
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="masthead">
        <Link href="/" className="wordmark" aria-label="ClassicsGo home">
          Classics<span>Go</span>
          <small>Discover more. Drive more.</small>
        </Link>
        <nav aria-label="Main navigation" className="desktop-nav">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={
                pathname === link.href.split("?")[0] ? "page" : undefined
              }
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && <Link href="/admin">Admin</Link>}
        </nav>
        <div className="header-actions">
          {signedIn && (
            <Link
              href="/account?tab=saved"
              className="saved-link"
              aria-label="Saved events"
            >
              <Bookmark size={18} />
            </Link>
          )}
          <Link
            href={signedIn ? "/account" : "/sign-in"}
            aria-label={signedIn ? "My ClassicsGo account" : "Sign in"}
            className="account-link"
          >
            <UserRound size={17} />
            <span>{signedIn ? "My ClassicsGo" : "Sign in"}</span>
          </Link>
          <button
            className="menu-toggle"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      <nav
        id="mobile-navigation"
        aria-label="Mobile navigation"
        className="mobile-nav"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
          }
        }}
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            aria-current={
              pathname === link.href.split("?")[0] ? "page" : undefined
            }
          >
            {link.label}
          </Link>
        ))}
        {isAdmin && (
          <Link href="/admin" onClick={() => setOpen(false)}>
            Admin
          </Link>
        )}
        {signedIn && <Link href="/submit-event" onClick={() => setOpen(false)}>My event listings</Link>}
      </nav>
    </header>
  );
}

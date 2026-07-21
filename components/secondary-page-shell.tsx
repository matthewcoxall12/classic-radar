import { ArrowLeft, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { mailto, SITE_EMAILS } from "@/lib/site-contact";

export default function SecondaryPageShell({
  eyebrow,
  title,
  intro,
  note = "Reviewed by a person before publication",
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <main className="secondary-page">
      <header className="site-header">
        <div className="shell secondary-header">
          <Link className="brand" href="/" aria-label="ClassicsGo home">
            <Image
              className="brand-logo-image"
              src="/branding/classicsgo-logo-v2-512.png"
              width={43}
              height={43}
              alt=""
              aria-hidden="true"
              unoptimized
              priority
            />
            <span><strong>ClassicsGo</strong><small>The weekend roadbook</small></span>
          </Link>
          <Link className="back-home" href="/">
            <ArrowLeft size={17} /> Back to event finder
          </Link>
        </div>
      </header>

      <section className="secondary-hero">
        <div className="shell secondary-hero-grid">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{intro}</p>
            <span className="review-promise"><ShieldCheck size={17} /> {note}</span>
          </div>
          <div className="secondary-route-card" aria-hidden="true">
            <span>Start</span>
            <i />
            <strong>Community</strong>
            <i />
            <span>Great days out</span>
          </div>
        </div>
      </section>

      {children}

      <footer>
        <div className="shell secondary-footer">
          <p>ClassicsGo · The weekend roadbook</p>
          <div className="secondary-footer-links">
            <Link href="/">Find events near you</Link>
            <Link href="/membership">Membership</Link>
            <Link href="/account">My roadbook</Link>
            <a href={mailto(SITE_EMAILS.support)}>{SITE_EMAILS.support}</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

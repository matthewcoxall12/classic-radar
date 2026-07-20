import type { Metadata, Viewport } from "next";
import { Heart, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import { getViewer } from "@/lib/auth";
import { siteDescription, siteName, siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "ClassicsGo | Find classic car events near you", template: "%s | ClassicsGo" },
  description: siteDescription,
  applicationName: siteName,
  icons: {
    icon: [
      { url: "/branding/classicsgo-favicon-v2-32.png", type: "image/png", sizes: "32x32" },
      { url: "/branding/classicsgo-logo-v2-512.png", type: "image/png", sizes: "512x512" }
    ],
    shortcut: "/branding/classicsgo-favicon-v2-32.png",
    apple: "/branding/classicsgo-apple-touch-v2-180.png"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName,
    title: "ClassicsGo | Find classic car events near you",
    description: siteDescription,
    images: [{ url: "/images/hero-roadster.webp", width: 1672, height: 941, alt: "A classic roadster on a British country road" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "ClassicsGo | Find classic car events near you",
    description: siteDescription,
    images: ["/images/hero-roadster.webp"]
  }
};

export const viewport: Viewport = { themeColor: "#123b32", colorScheme: "light" };

const navItems = [
  { href: "/events?radius=uk", label: "Find events" },
  { href: "/membership", label: "Membership" },
  { href: "/clubs", label: "For clubs" },
  { href: "/submit-event", label: "Add an event" }
];

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getViewer();
  const websiteData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ClassicsGo",
    alternateName: "ClassicsGo classic car events",
    url: siteUrl().toString(),
    description: siteDescription,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl().toString()}events?q={search_term_string}&radius=uk`,
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <html lang="en-GB">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteData).replaceAll("<", "\\u003c") }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <header className="sticky top-0 z-50 border-b border-brass/60 bg-racing/95 text-paper shadow-sm backdrop-blur">
          <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="ClassicsGo home">
              <Image
                src="/branding/classicsgo-logo-v2-512.png"
                alt=""
                width={48}
                height={48}
                priority
                className="h-12 w-12 rounded-full border border-brass/50 object-cover"
              />
              <span className="grid leading-none">
                <strong className="font-serif text-xl font-semibold uppercase tracking-[0.08em] sm:text-2xl">ClassicsGo</strong>
                <small className="mt-1 hidden font-condensed text-[10px] uppercase tracking-[0.18em] text-paper/60 sm:block">The weekend roadbook</small>
              </span>
            </Link>
            <nav aria-label="Main navigation" className="hidden items-center gap-6 lg:flex">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="border-b-2 border-transparent py-7 text-sm font-semibold text-paper/85 transition hover:border-brass hover:text-paper">
                  {item.label}
                </Link>
              ))}
              {viewer?.isAdmin ? <Link href="/admin" className="text-sm font-semibold text-brass">Admin</Link> : null}
            </nav>
            <div className="flex items-center gap-2">
              {viewer ? (
                <>
                  <Link href="/account?tab=saved" className="focus-ring hidden min-h-10 items-center gap-2 rounded-md border border-paper/25 px-3 text-sm font-bold sm:inline-flex">
                    <Heart className="h-4 w-4" /> Saved
                  </Link>
                  <Link href="/account" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-brass px-3 text-sm font-black text-racing">
                    <UserRound className="h-4 w-4" /> <span className="hidden sm:inline">My ClassicsGo</span><span className="sm:hidden">Account</span>
                  </Link>
                </>
              ) : (
                <Link href="/sign-in" className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-brass px-4 text-sm font-black text-racing">
                  <UserRound className="h-4 w-4" /> Sign in
                </Link>
              )}
            </div>
          </div>
          <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-t border-paper/10 px-3 py-2 lg:hidden">
            {navItems.map((item) => <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold text-paper/80">{item.label}</Link>)}
          </nav>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="border-t border-brass/30 bg-ink text-paper">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2 font-serif text-xl font-semibold uppercase tracking-wide"><Image src="/branding/classicsgo-logo-v2-512.png" alt="" width={28} height={28} className="h-7 w-7 rounded-full" /> ClassicsGo</div>
              <p className="mt-3 max-w-md text-sm leading-6 text-paper/65">One place to discover classic car shows, local meets, autojumbles, road runs and club events across the UK and Europe.</p>
              <p className="mt-3 text-xs text-paper/50">Always confirm details with the organiser before travelling.</p>
            </div>
            <div className="grid content-start gap-2 text-sm text-paper/70">
              <strong className="mb-1 text-paper">Explore</strong>
              <Link href="/events?radius=uk">UK events</Link><Link href="/events?radius=europe">European events</Link><Link href="/membership">Membership</Link><Link href="/submit-event">Submit an event</Link>
            </div>
            <div className="grid content-start gap-2 text-sm text-paper/70">
              <strong className="mb-1 text-paper">ClassicsGo</strong>
              <Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>
            </div>
          </div>
          <div className="border-t border-paper/10 px-4 py-5 text-center text-xs text-paper/50">© {new Date().getFullYear()} ClassicsGo. Built for the classic motoring community.</div>
        </footer>
      </body>
    </html>
  );
}

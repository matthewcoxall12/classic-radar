import type { Metadata, Viewport } from "next";
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
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "ClassicsGo | Find classic car events near you",
    template: "%s | ClassicsGo",
  },
  description: siteDescription,
  applicationName: siteName,
  icons: {
    icon: [
      {
        url: "/branding/classicsgo-favicon-v2-32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: "/branding/classicsgo-logo-v2-512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: "/branding/classicsgo-favicon-v2-32.png",
    apple: "/branding/classicsgo-apple-touch-v2-180.png",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName,
    title: "ClassicsGo | Find classic car events near you",
    description: siteDescription,
    images: [
      {
        url: "/images/editorial/jaguar.webp",
        width: 1672,
        height: 941,
        alt: "Group 44 Jaguar E-Type at Goodwood, illustrative photography",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClassicsGo | Find classic car events near you",
    description: siteDescription,
    images: ["/images/editorial/jaguar.webp"],
  },
};

export const viewport: Viewport = {
  themeColor: "#123b32",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en-GB" data-scroll-behavior="smooth">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteData).replaceAll("<", "\\u003c"),
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader
          signedIn={Boolean(viewer)}
          isAdmin={Boolean(viewer?.isAdmin)}
        />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="border-t border-brass/30 bg-ink text-paper">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2 font-serif text-xl font-semibold uppercase tracking-wide">
                <Image
                  src="/branding/classicsgo-logo-v2-512.png"
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full"
                />{" "}
                ClassicsGo
              </div>
              <p className="mt-3 max-w-md text-sm leading-6 text-paper/65">
                One place to discover classic car shows, local meets,
                autojumbles, road runs and club events across the UK and Europe.
              </p>
              <p className="mt-3 text-xs text-paper/50">
                Always confirm details with the organiser before travelling.
              </p>
            </div>
            <div className="grid content-start gap-2 text-sm text-paper/70">
              <strong className="mb-1 text-paper">Explore</strong>
              <Link href="/events?radius=uk">UK events</Link>
              <Link href="/events?radius=europe">European events</Link>
              <Link href="/membership">Membership</Link>
              <Link href="/submit-event">Submit an event</Link>
            </div>
            <div className="grid content-start gap-2 text-sm text-paper/70">
              <strong className="mb-1 text-paper">ClassicsGo</strong>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/photography">Photography credits</Link>
            </div>
          </div>
          <div className="border-t border-paper/10 px-4 py-5 text-center text-xs text-paper/50">
            © {new Date().getFullYear()} ClassicsGo. Built for the classic
            motoring community.
          </div>
        </footer>
      </body>
    </html>
  );
}

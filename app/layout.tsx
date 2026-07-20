import type { Metadata } from "next";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import { publicSiteUrl } from "@/lib/site-url";
import { APP_NAME, SITE_EMAILS } from "@/lib/site-contact";
import "./globals.css";

const title = "ClassicsGo | Find classic car events near you";
const description =
  "Find classic car events near you, from local club meets to major shows, with direct links to official organisers.";

export function generateMetadata(): Metadata {
  const siteUrl = publicSiteUrl();
  return {
    metadataBase: siteUrl,
    title,
    description,
    applicationName: APP_NAME,
    openGraph: {
      type: "website",
      url: siteUrl,
      siteName: APP_NAME,
      title,
      description,
      images: [
        {
          url: new URL("/images/hero-roadster.png", siteUrl),
          alt: "Classic roadster on a British country road",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/images/hero-roadster.png", siteUrl)],
    },
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
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteUrl = publicSiteUrl();
  const websiteData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APP_NAME,
    alternateName: "ClassicsGo classic car events",
    url: siteUrl.toString(),
    description,
    publisher: {
      "@type": "Organization",
      name: APP_NAME,
      url: siteUrl.toString(),
      email: SITE_EMAILS.support,
    },
  };
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteData).replaceAll("<", "\\u003c"),
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <div id="main-content" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}

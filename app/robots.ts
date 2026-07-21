import type { MetadataRoute } from "next";
import { publicSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const origin = publicSiteUrl().origin;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/account-deleted",
        "/admin",
        "/api/",
        "/auth/",
        "/check-email",
        "/forgot-password",
        "/privacy-request",
        "/reset-password",
        "/roadbook/",
        "/sign-in",
        "/sign-up",
      ],
    },
    host: origin,
    sitemap: `${origin}/sitemap.xml`,
  };
}

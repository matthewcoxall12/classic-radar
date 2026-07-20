import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.classicsgo.com" }],
        destination: "https://classicsgo.com/:path*",
        permanent: true
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "script-src 'self' 'unsafe-inline' https://accounts.google.com",
              "style-src 'self' 'unsafe-inline' https://accounts.google.com",
              "font-src 'self' data:",
              "img-src 'self' data: blob: https://accounts.google.com https://*.googleusercontent.com",
              "connect-src 'self' https://rnayhhsurmztrohtftqo.supabase.co wss://rnayhhsurmztrohtftqo.supabase.co https://accounts.google.com",
              "frame-src https://accounts.google.com",
              "worker-src 'self' blob:",
              "upgrade-insecure-requests"
            ].join("; ")
          }
        ]
      }
    ];
  }
};

export default nextConfig;

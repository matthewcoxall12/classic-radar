import { getRuntimeEnv } from "@/lib/runtime-env";

const FALLBACK_SITE_URL = "https://classicsgo.com";

export function publicSiteUrl() {
  const runtime = getRuntimeEnv()?.SITE_URL;
  const configured =
    (typeof runtime === "string" && runtime.trim()) ||
    (typeof process !== "undefined" ? process.env.SITE_URL?.trim() : "") ||
    FALLBACK_SITE_URL;

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return new URL(FALLBACK_SITE_URL);
    }
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed;
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
}

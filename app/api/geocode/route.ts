import {
  AuthSecurityError,
  checkDurableAuthRateLimit,
  sha256,
} from "@/lib/auth-security";
import { ensureDatabase } from "@/lib/database";
import { getRuntimeEnv } from "@/lib/runtime-env";

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  address?: { country_code?: string };
};

type CachedResult = {
  label: string;
  latitude: number;
  longitude: number;
};

function runtimeValue(
  name: "GEOCODER_BASE_URL" | "GEOCODER_USER_AGENT" | "GEOCODER_COUNTRY_CODES",
) {
  const runtime = getRuntimeEnv();
  const value = runtime?.[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  return typeof process !== "undefined" ? process.env[name]?.trim() ?? "" : "";
}

export async function GET(request: Request) {
  let rate: Awaited<ReturnType<typeof checkDurableAuthRateLimit>>;
  try {
    rate = await checkDurableAuthRateLimit({
      request,
      scope: "geocode",
      limit: 30,
      windowSeconds: 60,
    });
  } catch (error) {
    if (error instanceof AuthSecurityError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many location searches. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const cacheKey = query.toLowerCase();

  if (query.length < 2 || query.length > 100) {
    return Response.json(
      { error: "Enter a UK or European town, city or postcode." },
      { status: 400 },
    );
  }

  const db = await ensureDatabase();
  const now = Math.floor(Date.now() / 1000);
  const queryHash = await sha256(cacheKey);
  const cached = await db
    .prepare(
      `SELECT label, latitude, longitude FROM geocode_cache
       WHERE cache_key = ? AND expires_at > ?`,
    )
    .bind(queryHash, now)
    .first<CachedResult>();
  if (cached) {
    return Response.json(cached, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  }

  try {
    const baseUrl = runtimeValue("GEOCODER_BASE_URL") || "https://nominatim.openstreetmap.org/";
    const parsedBase = new URL(baseUrl);
    if (parsedBase.protocol !== "https:") throw new Error("Invalid geocoder URL");
    const endpoint = new URL("search", `${parsedBase.toString().replace(/\/+$/, "")}/`);
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("format", "jsonv2");
    endpoint.searchParams.set(
      "countrycodes",
      runtimeValue("GEOCODER_COUNTRY_CODES") ||
        "gb,ie,fr,de,it,es,pt,nl,be,lu,ch,at,dk,se,no,fi,is,pl,cz,sk,hu,si,hr,ro,bg,gr,ee,lv,lt,mt,cy,tr,rs,ba,al,me,mk,ad,mc,sm,li",
    );
    endpoint.searchParams.set("limit", "1");
    endpoint.searchParams.set("addressdetails", "1");

    // This single durable lease enforces spacing between upstream requests. A
    // wall-clock-second bucket can permit two calls only milliseconds apart at
    // a boundary, which violates the public Nominatim service's 1 req/s limit.
    // This one row intentionally stores milliseconds in expires_at; all other
    // rate-limit rows use scoped keys and epoch seconds.
    const leaseNow = Date.now();
    const globalLease = await db
      .prepare(
        `INSERT INTO auth_rate_limits (bucket_key, hits, expires_at)
         VALUES ('geocode-global-lease', 1, ?)
         ON CONFLICT(bucket_key) DO UPDATE SET
           hits = 1,
           expires_at = excluded.expires_at,
           updated_at = CURRENT_TIMESTAMP
         WHERE auth_rate_limits.expires_at <= ?
         RETURNING expires_at`,
      )
      .bind(leaseNow + 1_050, leaseNow)
      .first<{ expires_at: number }>();
    if (!globalLease) {
      return Response.json(
        { error: "Location search is busy. Please wait a second and try again." },
        { status: 429, headers: { "Retry-After": "1" } },
      );
    }

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          runtimeValue("GEOCODER_USER_AGENT") ||
          "ClassicsGo/1.0 (+https://classicsgo.com)",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Geocoding service unavailable");

    const [match] = (await response.json()) as NominatimResult[];
    if (!match) {
      return Response.json(
        { error: "We couldn't find that UK or European location. Try a nearby town or postcode." },
        { status: 404 },
      );
    }

    const value = {
      label: match.display_name.split(",").slice(0, 3).join(","),
      latitude: Number(match.lat),
      longitude: Number(match.lon),
    };
    if (
      !value.label ||
      !Number.isFinite(value.latitude) ||
      !Number.isFinite(value.longitude) ||
      value.latitude < -90 ||
      value.latitude > 90 ||
      value.longitude < -180 ||
      value.longitude > 180
    ) {
      throw new Error("The geocoder returned an invalid location.");
    }
    await db.batch([
      db
        .prepare(
          `INSERT INTO geocode_cache (
             cache_key, label, latitude, longitude, provider, expires_at
           ) VALUES (?, ?, ?, ?, 'nominatim-compatible', ?)
           ON CONFLICT(cache_key) DO UPDATE SET
             label = excluded.label,
             latitude = excluded.latitude,
             longitude = excluded.longitude,
             provider = excluded.provider,
             expires_at = excluded.expires_at`,
        )
        .bind(
          queryHash,
          value.label,
          value.latitude,
          value.longitude,
          now + 30 * 24 * 60 * 60,
        ),
      db.prepare(`DELETE FROM geocode_cache WHERE expires_at < ?`).bind(now),
    ]);
    return Response.json(value, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Location lookup is temporarily unavailable. Try a nearby town, city or postcode.",
      },
      { status: 503 },
    );
  }
}

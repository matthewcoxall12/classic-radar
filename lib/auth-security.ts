import { getRuntimeEnv } from "@/lib/runtime-env";

export const SESSION_COOKIE = "__Host-cme_session";
export const CSRF_COOKIE = "__Host-cme_csrf";
export const RETURN_COOKIE = "__Host-cme_return";
export const REAUTH_COOKIE = "__Host-cme_reauth";
export const EMAIL_CHALLENGE_COOKIE = "__Host-cme_email_challenge";
export const CSRF_HEADER = "x-cme-csrf";

export class AuthSecurityError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthSecurityError";
    this.status = status;
    this.code = code;
  }
}

function runtimeValue(name: string): string {
  const runtime = getRuntimeEnv() as Record<string, unknown> | undefined;
  const value = runtime?.[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  const local = typeof process !== "undefined" ? process.env[name] : undefined;
  return local?.trim() ?? "";
}

export function turnstileSiteKey() {
  return runtimeValue("TURNSTILE_SITE_KEY") || null;
}

export function siteOrigin(request?: Request): string {
  const configured = runtimeValue("SITE_URL");
  const localDevelopment =
    typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  const vercelPreview =
    typeof process !== "undefined" && process.env.VERCEL_ENV === "preview";
  if (request && vercelPreview) {
    const requestUrl = new URL(request.url);
    if (
      requestUrl.protocol === "https:" &&
      (requestUrl.hostname.endsWith(".vercel.app") ||
        requestUrl.hostname === "localhost")
    ) {
      return requestUrl.origin;
    }
  }
  if (configured) {
    try {
      const url = new URL(configured);
      const localDevelopmentOrigin =
        localDevelopment &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
        (url.protocol === "http:" || url.protocol === "https:");
      if (
        (url.protocol === "https:" || localDevelopmentOrigin) &&
        !url.username &&
        !url.password
      ) {
        return url.origin;
      }
    } catch {
      // Invalid configured origins fail closed below.
    }
    throw new AuthSecurityError(
      503,
      "AUTH_ORIGIN_INVALID",
      "Secure account sign-in is still being configured.",
    );
  }
  if (request && localDevelopment) {
    const requestUrl = new URL(request.url);
    if (
      requestUrl.hostname === "localhost" ||
      requestUrl.hostname === "127.0.0.1" ||
      requestUrl.hostname === "terminal.local"
    ) {
      return requestUrl.origin;
    }
  }
  return "https://classicsgo.com";
}

export function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacIdentifier(value: string): Promise<string> {
  const pepper = runtimeValue("AUTH_HASH_PEPPER");
  if (pepper.length < 32) {
    throw new AuthSecurityError(
      503,
      "AUTH_SETUP_PENDING",
      "Secure account sign-in is still being configured.",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function timingSafeTextEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export type EmailLoginChallenge = {
  emailHash: string;
  expiresAt: number;
};

export async function createEmailLoginChallenge(
  email: string,
  now = Date.now(),
) {
  const expiresAt = Math.floor(now / 1_000) + 15 * 60;
  const nonce = randomToken(18);
  const emailHash = await hmacIdentifier(
    `email-login:${email.trim().toLowerCase()}`,
  );
  const unsigned = `v1.${expiresAt}.${nonce}.${emailHash}`;
  const signature = await hmacIdentifier(`email-login-cookie:${unsigned}`);
  return `${unsigned}.${signature}`;
}

export async function readEmailLoginChallenge(
  value: string | null,
  now = Date.now(),
): Promise<EmailLoginChallenge | null> {
  if (!value || value.length > 512) return null;
  const [version, expiresText, nonce, emailHash, signature, ...extra] =
    value.split(".");
  const expiresAt = Number(expiresText);
  const nowSeconds = Math.floor(now / 1_000);
  if (
    extra.length ||
    version !== "v1" ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < nowSeconds ||
    expiresAt > nowSeconds + 20 * 60 ||
    !/^[A-Za-z0-9_-]{20,40}$/.test(nonce ?? "") ||
    !/^[a-f0-9]{64}$/.test(emailHash ?? "") ||
    !/^[a-f0-9]{64}$/.test(signature ?? "")
  ) {
    return null;
  }
  const unsigned = `${version}.${expiresText}.${nonce}.${emailHash}`;
  const expected = await hmacIdentifier(`email-login-cookie:${unsigned}`);
  if (!timingSafeTextEqual(signature, expected)) return null;
  return { emailHash, expiresAt };
}

export async function emailLoginChallengeMatches(
  challenge: EmailLoginChallenge,
  email: string,
) {
  const expected = await hmacIdentifier(
    `email-login:${email.trim().toLowerCase()}`,
  );
  return timingSafeTextEqual(challenge.emailHash, expected);
}

export async function requireMutationSecurity(
  request: Request,
  expectedCsrfHash: string | null,
) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== siteOrigin(request)) {
    throw new AuthSecurityError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "For your security, please retry that action from this website.",
    );
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new AuthSecurityError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "For your security, please retry that action from this website.",
    );
  }

  if (!expectedCsrfHash) {
    throw new AuthSecurityError(
      401,
      "REAUTH_REQUIRED",
      "Please sign in again before making account changes.",
    );
  }

  const headerToken = request.headers.get(CSRF_HEADER) ?? "";
  const cookieToken =
    cookieValue(request.headers.get("cookie"), CSRF_COOKIE) ?? "";
  if (
    !headerToken ||
    !cookieToken ||
    !timingSafeTextEqual(headerToken, cookieToken) ||
    !timingSafeTextEqual(await sha256(headerToken), expectedCsrfHash)
  ) {
    throw new AuthSecurityError(
      403,
      "CSRF_CHECK_FAILED",
      "Your secure session needs to be refreshed. Please sign in again.",
    );
  }
}

export function requirePublicFormOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== siteOrigin(request)) {
    throw new AuthSecurityError(
      403,
      "CROSS_ORIGIN_REQUEST",
      "Please submit this form from the ClassicsGo website.",
    );
  }
}

export async function verifyTurnstileToken(
  request: Request,
  token: string,
  expectedAction: string,
) {
  const secret = runtimeValue("TURNSTILE_SECRET_KEY");
  if (!secret || !turnstileSiteKey()) {
    throw new AuthSecurityError(
      503,
      "BOT_PROTECTION_SETUP_PENDING",
      "This form is temporarily unavailable while its security check is configured.",
    );
  }
  if (!token || token.length > 2048) {
    throw new AuthSecurityError(
      400,
      "BOT_CHECK_REQUIRED",
      "Complete the security check and try again.",
    );
  }
  let result: { success?: boolean; action?: string; hostname?: string };
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    result = (await response.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
  } catch {
    throw new AuthSecurityError(
      502,
      "BOT_CHECK_UNAVAILABLE",
      "The security check could not be verified. Please try again.",
    );
  }
  const expectedHostname = new URL(siteOrigin(request)).hostname;
  if (
    !result.success ||
    result.action !== expectedAction ||
    result.hostname !== expectedHostname
  ) {
    throw new AuthSecurityError(
      400,
      "BOT_CHECK_FAILED",
      "The security check expired or could not be verified. Please try again.",
    );
  }
}

function requestIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function checkDurableAuthRateLimit(input: {
  request: Request;
  scope: string;
  subject?: string;
  includeIp?: boolean;
  consume?: boolean;
  limit: number;
  windowSeconds: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / input.windowSeconds);
  const ipHash = input.includeIp === false
    ? "all-connections"
    : await hmacIdentifier(`ip:${requestIp(input.request)}`);
  const subjectHash = input.subject
    ? await hmacIdentifier(`subject:${input.subject}`)
    : "anonymous";
  const bucketKey = `${input.scope}:${window}:${ipHash}:${subjectHash}`;
  const store = globalThis as typeof globalThis & {
    __classicsGoRateLimits?: Map<string, number>;
  };
  const buckets = store.__classicsGoRateLimits ?? new Map<string, number>();
  store.__classicsGoRateLimits = buckets;
  const current = buckets.get(bucketKey) ?? 0;
  const hits = input.consume === false ? current : current + 1;
  if (input.consume !== false) buckets.set(bucketKey, hits);
  if (buckets.size > 5_000) {
    for (const key of buckets.keys()) {
      if (!key.includes(`:${window}:`)) buckets.delete(key);
    }
  }
  return {
    allowed: input.consume === false ? hits < input.limit : hits <= input.limit,
    retryAfter: Math.max(1, (window + 1) * input.windowSeconds - now),
  };
}

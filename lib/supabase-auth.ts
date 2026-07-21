import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  SUPABASE_AUTH_COOKIE_NAME,
  supabasePublicConfig,
  supabaseSecretKey,
} from "@/lib/supabase-config";

export type SupabaseAuthConfig = {
  url: string;
  publishableKey: string;
  secretKey: string | null;
  turnstileSiteKey: string | null;
  turnstileSecretConfigured: boolean;
};

export type SupportedSupabaseAuthProvider = "google" | "email";

export class SupabaseAuthConfigurationError extends Error {
  constructor() {
    super("Google and email sign-in are still being configured.");
    this.name = "SupabaseAuthConfigurationError";
  }
}

function readValue(name: string): string {
  const runtime = getRuntimeEnv() as Record<string, unknown> | undefined;
  const runtimeValue = runtime?.[name];
  if (typeof runtimeValue === "string" && runtimeValue.trim()) {
    return runtimeValue.trim();
  }
  return typeof process !== "undefined" ? process.env[name]?.trim() ?? "" : "";
}

export function passwordAuthEnabled() {
  return readValue("AUTH_PASSWORD_ENABLED").toLowerCase() === "true";
}

export function getSupabaseAuthConfig(): SupabaseAuthConfig {
  const publicConfig = supabasePublicConfig();
  const url = publicConfig.url;
  const publishableKey = publicConfig.publishableKey;
  if (!url || !publishableKey) throw new SupabaseAuthConfigurationError();
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new SupabaseAuthConfigurationError();
  return {
    url: parsed.origin,
    publishableKey,
    secretKey: supabaseSecretKey() || null,
    turnstileSiteKey: readValue("TURNSTILE_SITE_KEY") || null,
    turnstileSecretConfigured: Boolean(readValue("TURNSTILE_SECRET_KEY")),
  };
}

export function publicAuthAvailability() {
  try {
    const config = getSupabaseAuthConfig();
    return {
      google: true,
      email:
        passwordAuthEnabled() &&
        Boolean(config.turnstileSiteKey) &&
        config.turnstileSecretConfigured,
      turnstileSiteKey: config.turnstileSiteKey,
    };
  } catch {
    return { google: false, email: false, turnstileSiteKey: null };
  }
}

export async function createSupabaseRouteClient() {
  const config = getSupabaseAuthConfig();
  const cookieStore = await cookies();
  const client = createServerClient(config.url, config.publishableKey, {
    cookieOptions: {
      name: SUPABASE_AUTH_COOKIE_NAME,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
  return { client, config };
}

export async function clearSupabaseAuthCookies() {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (
      cookie.name === SUPABASE_AUTH_COOKIE_NAME ||
      cookie.name.startsWith(`${SUPABASE_AUTH_COOKIE_NAME}.`) ||
      cookie.name.startsWith(`${SUPABASE_AUTH_COOKIE_NAME}-`) ||
      cookie.name === "cme-supabase-pkce" ||
      cookie.name.startsWith("cme-supabase-pkce.") ||
      cookie.name.startsWith("cme-supabase-pkce-")
    ) {
      cookieStore.set(cookie.name, "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
  }
}

export async function bestEffortLocalSupabaseSignOut(
  client: SupabaseClient,
) {
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error && error.name !== "AuthSessionMissingError") {
      console.error("Supabase session cleanup failed", {
        operation: "provider-session-cleanup",
        errorCode: typeof error.code === "string" ? error.code.slice(0, 80) : "unknown",
        status: typeof error.status === "number" ? error.status : null,
      });
    }
  } catch (error) {
    console.error("Supabase session cleanup failed", {
      operation: "provider-session-cleanup",
      errorClass: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function bestEffortWelcomeEmail(
  client: SupabaseClient,
  user: User,
) {
  if (!user.id || !user.email || !user.email_confirmed_at) return;
  try {
    const { error } = await client.functions.invoke("send-welcome-email", {
      method: "POST",
      body: {},
    });
    if (error) {
      console.error("Welcome email request failed", {
        operation: "welcome-email",
        errorClass: error.name,
      });
    }
  } catch (error) {
    console.error("Welcome email request failed", {
      operation: "welcome-email",
      errorClass: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function deleteSupabaseIdentity(userId: string) {
  const config = getSupabaseAuthConfig();
  if (!config.secretKey) return false;
  const admin = createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) throw error;
  return true;
}

export function principalFromSupabaseUser(
  user: User,
  expectedProvider?: SupportedSupabaseAuthProvider | "password",
) {
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email || !user.email_confirmed_at) {
    throw new Error("A verified email address is required.");
  }
  const provider =
    typeof user.app_metadata?.provider === "string"
      ? user.app_metadata.provider
      : "supabase";
  if (
    expectedProvider &&
    expectedProvider !== "password" &&
    !user.identities?.some(
      (identity) => identity.provider === expectedProvider,
    )
  ) {
    throw new Error("The identity provider did not match this sign-in flow.");
  }
  const authenticatedProvider = expectedProvider === "password"
    ? "email"
    : expectedProvider ?? provider;
  const nameValue = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const displayName =
    typeof nameValue === "string" && nameValue.trim()
      ? nameValue.trim().slice(0, 120)
      : email;
  const googleIdentity = user.identities?.find(
    (identity) => identity.provider === "google",
  );
  const hostedDomain = googleIdentity?.identity_data?.hd;
  const googleAuthoritative =
    authenticatedProvider !== "google" ||
    email.endsWith("@gmail.com") ||
    email.endsWith("@googlemail.com") ||
    (typeof hostedDomain === "string" && hostedDomain.length > 0);

  return {
    issuer: `${getSupabaseAuthConfig().url}/auth/v1`,
    subject: user.id,
    provider: authenticatedProvider,
    email,
    emailVerified: true,
    displayName,
    allowLegacyClaim: authenticatedProvider === "email" || googleAuthoritative,
  };
}

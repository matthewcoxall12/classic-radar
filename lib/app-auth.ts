import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import { AuthSecurityError, hmacIdentifier } from "@/lib/auth-security";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const FRESH_AUTH_SECONDS = 10 * 60;
const DELETION_RECEIPT_SECONDS = 15 * 60;
export const DELETION_RECEIPT_COOKIE = "__Host-cme_deletion_receipt";

export type AuthPrincipalInput = {
  issuer: string;
  subject: string;
  provider: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  allowLegacyClaim: boolean;
};

export type AuthenticatedUser = {
  memberId: string;
  email: string;
  authenticatedEmail: string;
  displayName: string;
  provider: string;
  issuer: string;
  subject: string;
  sessionId: string | null;
  csrfHash: string | null;
  authenticatedAt: number | null;
};

export type DeletionReceipt = {
  deletionId: string;
  providerCleanupQueued: boolean;
};

export class AccountClaimVerificationError extends Error {
  constructor() {
    super("That email is already linked to a ClassicsGo account. Sign in with Google.");
    this.name = "AccountClaimVerificationError";
  }
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function cleanName(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, 120)
    : fallback;
}

export async function identityPrivacyHash(issuer: string, subject: string) {
  return hmacIdentifier(`identity:${issuer}:${subject}`);
}

export async function createDeletionReceipt(
  deletionId: string,
  providerCleanupQueued: boolean,
) {
  const state = providerCleanupQueued ? "queued" : "local-complete";
  const createdAt = Math.floor(Date.now() / 1000);
  const signature = await hmacIdentifier(
    `deletion-receipt:${deletionId}:${state}:${createdAt}`,
  );
  return `${deletionId}.${state}.${createdAt}.${signature}`;
}

export async function readDeletionReceipt(): Promise<DeletionReceipt | null> {
  const value = (await cookies()).get(DELETION_RECEIPT_COOKIE)?.value;
  if (!value) return null;
  const [deletionId, state, createdAtText, signature, extra] = value.split(".");
  const createdAt = Number(createdAtText);
  if (
    extra !== undefined ||
    !/^del_[0-9a-f-]{36}$/i.test(deletionId ?? "") ||
    !["queued", "local-complete"].includes(state ?? "") ||
    !Number.isSafeInteger(createdAt) ||
    Math.abs(Math.floor(Date.now() / 1000) - createdAt) > DELETION_RECEIPT_SECONDS
  ) return null;
  const expected = await hmacIdentifier(
    `deletion-receipt:${deletionId}:${state}:${createdAt}`,
  );
  if (signature !== expected) return null;
  return { deletionId, providerCleanupQueued: state === "queued" };
}

export async function resolveAuthPrincipal(
  input: AuthPrincipalInput,
): Promise<AuthenticatedUser> {
  if (!input.emailVerified) {
    throw new AuthSecurityError(
      403,
      "VERIFIED_EMAIL_REQUIRED",
      "A verified email address is required.",
    );
  }
  const email = normalizedEmail(input.email);
  return {
    memberId: input.subject,
    email,
    authenticatedEmail: email,
    displayName: cleanName(input.displayName, email.split("@")[0] || "Member"),
    provider: input.provider,
    issuer: input.issuer,
    subject: input.subject,
    sessionId: null,
    csrfHash: null,
    authenticatedAt: Math.floor(Date.now() / 1000),
  };
}

export async function getSessionUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  const authUser = data.user;
  if (error || !authUser?.id || !authUser.email || !authUser.email_confirmed_at) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", authUser.id)
    .maybeSingle();
  const email = normalizedEmail(authUser.email);
  const provider =
    typeof authUser.app_metadata?.provider === "string"
      ? authUser.app_metadata.provider
      : "google";
  const signedInAt = authUser.last_sign_in_at
    ? Math.floor(Date.parse(authUser.last_sign_in_at) / 1000)
    : null;
  return {
    memberId: authUser.id,
    email,
    authenticatedEmail: email,
    displayName: cleanName(
      profile?.display_name ?? authUser.user_metadata?.full_name ?? authUser.user_metadata?.name,
      email.split("@")[0] || "Member",
    ),
    provider,
    issuer: `${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rnayhhsurmztrohtftqo.supabase.co").origin}/auth/v1`,
    subject: authUser.id,
    sessionId:
      typeof authUser.app_metadata?.session_id === "string"
        ? authUser.app_metadata.session_id
        : null,
    csrfHash: null,
    authenticatedAt: Number.isFinite(signedInAt) ? signedInAt : null,
  };
}

export async function requireAuthenticatedPageUser(returnTo: string) {
  const user = await getSessionUser();
  if (user) return user;
  redirect(`/sign-in?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`);
}

export async function requireAuthenticatedMutation(request: Request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;
  if (origin !== expectedOrigin) {
    throw new AuthSecurityError(
      403,
      "CSRF_CHECK_FAILED",
      "For your security, please retry that action from the ClassicsGo website.",
    );
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    throw new AuthSecurityError(
      403,
      "CSRF_CHECK_FAILED",
      "For your security, please retry that action from the ClassicsGo website.",
    );
  }
  const user = await getSessionUser();
  if (!user) {
    throw new AuthSecurityError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }
  return user;
}

export function requireFreshAuthentication(user: AuthenticatedUser) {
  const now = Math.floor(Date.now() / 1000);
  if (!user.authenticatedAt || user.authenticatedAt < now - FRESH_AUTH_SECONDS) {
    throw new AuthSecurityError(
      401,
      "FRESH_AUTH_REQUIRED",
      "Please sign in again before making this security-sensitive change.",
    );
  }
}

// Supabase owns the session cookies. OAuth callback exchange is the session
// creation boundary, so the legacy Sites session shim intentionally does no
// additional cookie or database work on Vercel.
export async function createAppSession(
  _user: AuthenticatedUser,
  _request: Request,
) {
  return null;
}

export async function beginReauthentication(_user: AuthenticatedUser) {}
export async function hasPendingReauthentication() { return false; }
export async function assertReauthenticationPrincipal(_input: AuthPrincipalInput) { return false; }
export async function assertReauthenticationMember(_user: AuthenticatedUser) { return false; }

export async function revokeCurrentSession() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
}

export async function revokeAllAppSessionsForIdentity(
  _issuer: string,
  _subject: string,
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  return error ? 0 : 1;
}

export function clearAppSessionCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  cookieStore.set(DELETION_RECEIPT_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function recordAuthEvent(
  _memberId: string | null,
  _eventType: string,
  _provider: string | null,
  _sessionId: string | null = null,
) {}

export function signOutRedirect(returnTo = "/") {
  return safeRelativeReturnPath(returnTo);
}

export function publicSignInPath(returnTo = "/account") {
  return `/sign-in?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export async function memberPrivacyHashes(user: AuthenticatedUser) {
  return {
    memberHash: await hmacIdentifier(`member:${user.memberId}`),
    identityHash: await identityPrivacyHash(user.issuer, user.subject),
    emailHash: await hmacIdentifier(`email:${normalizedEmail(user.email)}`),
  };
}

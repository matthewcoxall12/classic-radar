import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import {
  AuthSecurityError,
  hmacIdentifier,
  randomToken,
  REAUTH_COOKIE,
  timingSafeTextEqual,
} from "@/lib/auth-security";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const FRESH_AUTH_SECONDS = 10 * 60;
const DELETION_RECEIPT_SECONDS = 15 * 60;
const REAUTH_SECONDS = 10 * 60;
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
  if (!timingSafeTextEqual(signature, expected)) return null;
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
  const claimsResult = await supabase.auth.getClaims();
  const claims = claimsResult.data?.claims;
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
      typeof claims?.session_id === "string" ? claims.session_id : null,
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
  user: AuthenticatedUser,
  _request: Request,
) {
  void _request;
  await recordAuthEvent(
    user.memberId,
    "signed_in",
    user.provider,
    user.sessionId,
  );
}

type ReauthenticationState = {
  expiresAt: number;
  nonce: string;
  memberHash: string;
  identityHash: string;
};

async function parseReauthenticationState(
  value: string | undefined,
): Promise<ReauthenticationState | null> {
  if (!value) return null;
  if (value.length > 512) {
    throw new AuthSecurityError(
      401,
      "REAUTH_EXPIRED",
      "That security check has expired. Start it again from your account page.",
    );
  }
  const [version, expiresText, nonce, memberHash, identityHash, signature, extra] =
    value.split(".");
  const expiresAt = Number(expiresText);
  const now = Math.floor(Date.now() / 1_000);
  if (
    extra !== undefined ||
    version !== "v1" ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < now ||
    expiresAt > now + REAUTH_SECONDS + 60 ||
    !/^[A-Za-z0-9_-]{20,64}$/.test(nonce ?? "") ||
    !/^[a-f0-9]{64}$/.test(memberHash ?? "") ||
    !/^[a-f0-9]{64}$/.test(identityHash ?? "") ||
    !/^[a-f0-9]{64}$/.test(signature ?? "")
  ) {
    throw new AuthSecurityError(
      401,
      "REAUTH_EXPIRED",
      "That security check has expired. Start it again from your account page.",
    );
  }
  const unsigned = `${version}.${expiresText}.${nonce}.${memberHash}.${identityHash}`;
  const expected = await hmacIdentifier(`reauth-cookie:${unsigned}`);
  if (!timingSafeTextEqual(signature, expected)) {
    throw new AuthSecurityError(
      401,
      "REAUTH_INVALID",
      "That security check could not be verified. Start it again from your account page.",
    );
  }
  return { expiresAt, nonce, memberHash, identityHash };
}

async function pendingReauthentication() {
  const cookieStore = await cookies();
  return parseReauthenticationState(cookieStore.get(REAUTH_COOKIE)?.value);
}

export async function beginReauthentication(user: AuthenticatedUser) {
  const expiresAt = Math.floor(Date.now() / 1_000) + REAUTH_SECONDS;
  const nonce = randomToken(24);
  const memberHash = await hmacIdentifier(`reauth-member:${user.memberId}`);
  const identityHash = await identityPrivacyHash(user.issuer, user.subject);
  const unsigned = `v1.${expiresAt}.${nonce}.${memberHash}.${identityHash}`;
  const signature = await hmacIdentifier(`reauth-cookie:${unsigned}`);
  (await cookies()).set(REAUTH_COOKIE, `${unsigned}.${signature}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: REAUTH_SECONDS,
  });
}

export async function hasPendingReauthentication() {
  try {
    return Boolean(await pendingReauthentication());
  } catch {
    (await cookies()).set(REAUTH_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return false;
  }
}

export async function assertReauthenticationPrincipal(input: AuthPrincipalInput) {
  const pending = await pendingReauthentication();
  if (!pending) return false;
  const identityHash = await identityPrivacyHash(input.issuer, input.subject);
  if (!timingSafeTextEqual(identityHash, pending.identityHash)) {
    throw new AuthSecurityError(
      401,
      "REAUTH_PRINCIPAL_MISMATCH",
      "Use the same account that requested this security check.",
    );
  }
  return true;
}

export async function assertReauthenticationMember(user: AuthenticatedUser) {
  const pending = await pendingReauthentication();
  if (!pending) return false;
  const memberHash = await hmacIdentifier(`reauth-member:${user.memberId}`);
  const identityHash = await identityPrivacyHash(user.issuer, user.subject);
  if (
    !timingSafeTextEqual(memberHash, pending.memberHash) ||
    !timingSafeTextEqual(identityHash, pending.identityHash)
  ) {
    throw new AuthSecurityError(
      401,
      "REAUTH_PRINCIPAL_MISMATCH",
      "Use the same account that requested this security check.",
    );
  }
  (await cookies()).set(REAUTH_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  await recordAuthEvent(
    user.memberId,
    "reauthenticated",
    user.provider,
    user.sessionId,
  );
  return true;
}

export async function revokeCurrentSession() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
}

export async function revokeAllAppSessionsForIdentity(
  _issuer: string,
  _subject: string,
) {
  void _issuer;
  void _subject;
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
  memberId: string | null,
  eventType: string,
  provider: string | null,
  sessionId: string | null = null,
) {
  const allowedEvents = new Set([
    "signed_in",
    "signed_out",
    "reauthenticated",
    "other_sessions_revoked",
    "account_exported",
    "account_deleted",
  ]);
  const safeEventType = allowedEvents.has(eventType) ? eventType : "auth_event";
  console.info("ClassicsGo authentication event", {
    eventType: safeEventType,
    provider: provider?.slice(0, 40) ?? null,
    memberPresent: Boolean(memberId),
    sessionPresent: Boolean(sessionId),
    occurredAt: new Date().toISOString(),
  });

  try {
    const memberHash = memberId
      ? await hmacIdentifier(`auth-audit-member:${memberId}`)
      : null;
    const sessionHash = sessionId
      ? await hmacIdentifier(`auth-audit-session:${sessionId}`)
      : null;
    const { error } = await createSupabaseAdminClient()
      .from("auth_audit_events")
      .insert({
        event_type: safeEventType,
        provider: provider?.slice(0, 40) ?? null,
        member_hash: memberHash,
        session_hash: sessionHash,
      });
    if (error) throw error;
  } catch (error) {
    // Authentication must not be made unavailable by an audit sink outage.
    // Vercel's structured server log above remains the secondary audit trail.
    console.error("ClassicsGo authentication audit persistence failed", {
      eventType: safeEventType,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

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

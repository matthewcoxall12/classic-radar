import { notFound, redirect } from "next/navigation";
import {
  getSessionUser,
  requireAuthenticatedMutation,
  requireFreshAuthentication,
  type AuthenticatedUser,
} from "@/lib/app-auth";
import { AuthSecurityError } from "@/lib/auth-security";
import { getRuntimeEnv } from "@/lib/runtime-env";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function adminEmailsValue() {
  const runtimeValue = getRuntimeEnv()?.ADMIN_EMAILS;
  if (typeof runtimeValue === "string" && runtimeValue.trim()) {
    return runtimeValue.trim();
  }
  return typeof process !== "undefined"
    ? process.env.ADMIN_EMAILS?.trim() ?? ""
    : "";
}

export function configuredAdminEmails() {
  const raw = adminEmailsValue();
  if (!raw) {
    throw new AuthSecurityError(
      503,
      "ADMIN_SETUP_PENDING",
      "The operations area is not configured.",
    );
  }

  const values = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (
    values.length === 0 ||
    values.length > 50 ||
    values.some((email) => !emailPattern.test(email))
  ) {
    throw new AuthSecurityError(
      503,
      "ADMIN_SETUP_INVALID",
      "The operations area is not configured.",
    );
  }
  return [...new Set(values)];
}

async function assertVerifiedAdmin(user: AuthenticatedUser) {
  const adminEmails = configuredAdminEmails();
  const email = user.authenticatedEmail.trim().toLowerCase();
  if (!adminEmails.includes(email)) {
    throw new AuthSecurityError(
      403,
      "ADMIN_REQUIRED",
      "This account cannot access the operations area.",
    );
  }

  return { user, adminEmails };
}

export async function requireAdminApiUser(request?: Request) {
  const isMutation =
    request && !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  const user = isMutation
    ? await requireAuthenticatedMutation(request)
    : await getSessionUser();
  if (!user) {
    throw new AuthSecurityError(401, "AUTH_REQUIRED", "Sign in to continue.");
  }
  if (isMutation) requireFreshAuthentication(user);
  return assertVerifiedAdmin(user);
}

export async function requireAdminPageUser() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?return_to=%2Fadmin");
  try {
    return await assertVerifiedAdmin(user);
  } catch {
    notFound();
  }
}

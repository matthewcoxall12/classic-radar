import { cookies } from "next/headers";
import { hmacIdentifier } from "@/lib/auth-security";
import { RequestError } from "@/lib/request-safety";

export const PASSWORD_RECOVERY_COOKIE = "__Host-cme_password_recovery";

export function reportAuthDeliveryFailure(operation: string, error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const rawCode = typeof record.code === "string"
    ? record.code
    : typeof record.name === "string"
      ? record.name
      : "ProviderError";
  const errorCode = rawCode.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
  const status = typeof record.status === "number" ? record.status : null;
  console.error("Supabase authentication email delivery failed", {
    operation: operation.slice(0, 40),
    errorCode,
    status,
  });
}
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function normalizeAuthEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!emailPattern.test(email) || email.length > 254) {
    throw new RequestError("Enter a valid email address.", 400);
  }
  return email;
}

export function validateNewPassword(value: unknown) {
  if (typeof value !== "string") {
    throw new RequestError("Enter a password.", 400);
  }
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    throw new RequestError(
      `Use between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      400,
    );
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new RequestError("Use at least one letter and one number.", 400);
  }
  return value;
}

export function validateCurrentPassword(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > PASSWORD_MAX_LENGTH
  ) {
    throw new RequestError("Enter your password.", 400);
  }
  return value;
}

export function validateCaptchaToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!token || token.length > 2_048) {
    throw new RequestError("Complete the security check and try again.", 400);
  }
  return token;
}

export function cleanDisplayName(value: unknown) {
  const name = typeof value === "string"
    ? value.normalize("NFC").replace(/\s+/g, " ").trim()
    : "";
  if (name.length < 2 || name.length > 120 || /[<>\u0000-\u001f\u007f]/.test(name)) {
    throw new RequestError("Enter your name using 2 to 120 characters.", 400);
  }
  return name;
}

export async function createPasswordRecoveryState(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("The recovery identity is invalid.");
  }
  const expiresAt = Math.floor(Date.now() / 1_000) + 15 * 60;
  const payload = `${userId}.${expiresAt}`;
  const signature = await hmacIdentifier(`password-recovery:${payload}`);
  return `${payload}.${signature}`;
}

export async function readPasswordRecoveryState(token?: string | null) {
  const value = token ?? (await cookies()).get(PASSWORD_RECOVERY_COOKIE)?.value;
  if (!value) return null;
  const [userId, expiresText, signature, extra] = value.split(".");
  const expiresAt = Number(expiresText);
  if (
    extra !== undefined ||
    !/^[0-9a-f-]{36}$/i.test(userId ?? "") ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1_000) ||
    expiresAt > Math.floor(Date.now() / 1_000) + 16 * 60 ||
    !/^[0-9a-f]{64}$/i.test(signature ?? "")
  ) {
    return null;
  }
  const expected = await hmacIdentifier(
    `password-recovery:${userId}.${expiresText}`,
  );
  return timingSafeEqual(signature, expected) ? { userId, expiresAt } : null;
}

export async function clearPasswordRecoveryState() {
  (await cookies()).set(PASSWORD_RECOVERY_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

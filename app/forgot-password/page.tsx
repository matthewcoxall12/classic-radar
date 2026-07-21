import type { Metadata } from "next";
import SignInPanel from "@/components/sign-in-panel";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import { publicAuthAvailability } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset password | ClassicsGo",
  description: "Request a secure ClassicsGo password reset link.",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(
    typeof params.return_to === "string" ? params.return_to : "/account",
  );
  const availability = publicAuthAvailability();
  return (
    <SignInPanel
      mode="forgot"
      returnTo={returnTo}
      error={typeof params.error === "string" ? params.error : ""}
      googleEnabled={availability.google}
      emailEnabled={availability.email}
      turnstileSiteKey={availability.turnstileSiteKey}
    />
  );
}

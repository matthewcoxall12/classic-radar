import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/app-auth";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import { publicAuthAvailability } from "@/lib/supabase-auth";
import SignInPanel from "@/components/sign-in-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in | ClassicsGo",
  description:
    "Sign in securely to sync saved classic-car events and manage your roadbook.",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(
    typeof params.return_to === "string" ? params.return_to : "/account",
  );
  const reauthenticate = params.reauth === "1";
  const existing = await getSessionUser();
  if (existing && !reauthenticate) redirect(returnTo);
  const error = typeof params.error === "string" ? params.error : "";
  const notice = typeof params.notice === "string" ? params.notice : "";
  const availability = publicAuthAvailability();

  return (
    <SignInPanel
      mode="sign-in"
      returnTo={returnTo}
      error={error}
      notice={notice}
      googleEnabled={availability.google}
      emailEnabled={availability.email}
      turnstileSiteKey={availability.turnstileSiteKey}
      reauthenticate={reauthenticate}
    />
  );
}

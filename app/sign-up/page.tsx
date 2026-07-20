import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignInPanel from "@/components/sign-in-panel";
import { getSessionUser } from "@/lib/app-auth";
import { safeRelativeReturnPath } from "@/lib/auth-return-path";
import { publicAuthAvailability } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create account | ClassicsGo",
  description: "Create a free ClassicsGo account for saved events and your roadbook.",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(
    typeof params.return_to === "string" ? params.return_to : "/account",
  );
  if (await getSessionUser()) redirect(returnTo);
  const availability = publicAuthAvailability();
  return (
    <SignInPanel
      mode="sign-up"
      returnTo={returnTo}
      googleEnabled={availability.google}
      emailEnabled={availability.email}
      turnstileSiteKey={availability.turnstileSiteKey}
    />
  );
}

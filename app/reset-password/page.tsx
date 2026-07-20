import type { Metadata } from "next";
import SignInPanel from "@/components/sign-in-panel";
import { publicAuthAvailability } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a new password | ClassicsGo",
  description: "Set a new password for your ClassicsGo account.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  const availability = publicAuthAvailability();
  return (
    <SignInPanel
      mode="reset"
      googleEnabled={availability.google}
      emailEnabled={availability.email}
      turnstileSiteKey={availability.turnstileSiteKey}
    />
  );
}

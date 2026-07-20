import type { Metadata } from "next";
import SignInPanel from "@/components/sign-in-panel";
import { publicAuthAvailability } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check your email | ClassicsGo",
  description: "Confirm your email address to finish creating your ClassicsGo account.",
  robots: { index: false, follow: false },
};

export default function CheckEmailPage() {
  const availability = publicAuthAvailability();
  return (
    <SignInPanel
      mode="check-email"
      googleEnabled={availability.google}
      emailEnabled={availability.email}
      turnstileSiteKey={availability.turnstileSiteKey}
    />
  );
}

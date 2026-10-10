import { redirect } from "next/navigation";
import { safeReturnPath } from "./supabase/return-path";
import { createClient } from "@/lib/supabase/server";
import { hasRoadbook } from "@/lib/entitlements";

export type Viewer = {
  id: string;
  email: string;
  displayName: string;
  tier: "free" | "roadbook";
  isAdmin: boolean;
  canUseRoadbook: boolean;
};

export { safeReturnPath } from "./supabase/return-path";

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const id = claims?.sub;
  if (error || !claims || typeof id !== "string") return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,tier,is_admin,subscription_status,subscription_expires_at")
    .eq("id", id)
    .maybeSingle();

  const email = typeof claims.email === "string" ? claims.email : "";
  const fallbackName = email ? email.split("@")[0] : "Member";

  return {
    id,
    email,
    displayName: profile?.display_name?.trim() || fallbackName,
    tier: profile?.tier === "roadbook" ? "roadbook" : "free",
    isAdmin: profile?.is_admin === true,
    canUseRoadbook: hasRoadbook(profile),
  };
}

export async function requireViewer(returnTo = "/account") {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(`/sign-in?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }
  return viewer;
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string;
  displayName: string;
  tier: "free" | "roadbook";
  isAdmin: boolean;
};

export function safeReturnPath(value: string | null | undefined, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://classicsgo.com");
    if (parsed.origin !== "https://classicsgo.com") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const id = claims?.sub;
  if (error || !claims || typeof id !== "string") return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,tier,is_admin")
    .eq("id", id)
    .maybeSingle();

  const email = typeof claims.email === "string" ? claims.email : "";
  const fallbackName = email ? email.split("@")[0] : "Member";

  return {
    id,
    email,
    displayName: profile?.display_name?.trim() || fallbackName,
    tier: profile?.tier === "roadbook" ? "roadbook" : "free",
    isAdmin: profile?.is_admin === true
  };
}

export async function requireViewer(returnTo = "/account") {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(`/sign-in?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
  }
  return viewer;
}

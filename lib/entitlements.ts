type MembershipProfile = { tier?: string | null; is_admin?: boolean | null; subscription_status?: string | null; subscription_expires_at?: string | null };

// Manual early-access grants have no billing status. Billing-driven grants must
// be active or within their trial, and an expiry always limits access.
export function hasRoadbook(profile: MembershipProfile | null | undefined, now = Date.now()): boolean {
  if (profile?.is_admin === true) return true;
  if (profile?.tier !== "roadbook") return false;
  const status = profile.subscription_status;
  if (status != null && status !== "active" && status !== "trialing") return false;
  const expiry = profile.subscription_expires_at;
  if (expiry != null && (!Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= now)) return false;
  return status !== "trialing" || expiry != null;
}

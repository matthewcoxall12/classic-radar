import { SourceRegistryManager } from "@/components/admin/SourceRegistryManager";
import { getSourceRegistry } from "@/lib/events";

export default async function AdminSettingsPage() {
  const entries = await getSourceRegistry();
  return (
    <div className="grid gap-5">
      <div className="rounded-lg border border-ink/10 bg-paper p-5 shadow-soft">
        <h2 className="text-xl font-black">Settings</h2>
        <div className="mt-4 grid gap-3 text-sm text-muted">
          <p><strong className="text-ink">Scheduler:</strong> the GitHub workflow runs daily at 03:17 UTC and authenticates to Supabase with a short-lived OIDC token.</p>
          <p><strong className="text-ink">Core discovery:</strong> official public pages are scanned with robots-aware, bounded traversal. Schema.org event data is preferred, with conservative page metadata as a review-only fallback.</p>
          <p><strong className="text-ink">Publication:</strong> machine discoveries always enter the private review queue. Only an authorised administrator can publish a listing.</p>
          <p><strong className="text-ink">Admin users:</strong> update profiles.is_admin to true for trusted accounts.</p>
        </div>
      </div>
      <SourceRegistryManager entries={entries} />
    </div>
  );
}

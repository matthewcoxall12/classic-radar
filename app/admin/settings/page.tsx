import { SourceRegistryManager } from "@/components/admin/SourceRegistryManager";
import { getSourceRegistry } from "@/lib/events";

export default async function AdminSettingsPage() {
  const entries = await getSourceRegistry();
  return (
    <div className="grid gap-5">
      <div className="rounded-lg border border-ink/10 bg-paper p-5 shadow-soft">
        <h2 className="text-xl font-black">Settings</h2>
        <div className="mt-4 grid gap-3 text-sm text-muted">
          <p><strong className="text-ink">Agent secret:</strong> set AGENT_SECRET in Vercel and Supabase Edge Function secrets.</p>
          <p><strong className="text-ink">Search provider:</strong> SEARCH_PROVIDER_API_KEY is optional. Local discovery uses bundled development results until a provider key is added.</p>
          <p><strong className="text-ink">Geocoding:</strong> GEOCODING_API_KEY is optional. Local development recognises common UK towns and seeded event postcodes.</p>
          <p><strong className="text-ink">Admin users:</strong> update profiles.is_admin to true for trusted accounts.</p>
        </div>
      </div>
      <SourceRegistryManager entries={entries} />
    </div>
  );
}

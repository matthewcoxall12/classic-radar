import type { AgentRun } from "@/lib/types";

export function AgentRunLog({ runs }: { runs: AgentRun[] }) {
  return (
    <div className="grid gap-3">
      {runs.map((run) => (
        <article key={run.id} className="rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-black">{run.run_type ?? "manual"} run</h2>
              <p className="text-sm text-muted">{new Date(run.started_at).toLocaleString("en-GB")}</p>
            </div>
            <span className="rounded-full bg-racing/10 px-3 py-1 text-xs font-black text-racing">{run.status}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-8">
            <Stat label="Sources" value={run.sources_checked ?? 0} />
            <Stat label="Pages" value={run.pages_fetched ?? 0} />
            <Stat label="Candidates" value={run.candidates_found ?? 0} />
            <Stat label="Queries" value={run.searches_performed} />
            <Stat label="Results" value={run.results_found} />
            <Stat label="Created" value={run.events_created} />
            <Stat label="Updated" value={run.events_updated} />
            <Stat label="Review" value={run.review_queue_created ?? 0} />
            <Stat label="Duplicates" value={run.duplicates_found} />
            <Stat label="Errors" value={Array.isArray(run.errors) ? run.errors.length : 0} />
          </div>
          {run.notes ? <p className="mt-3 text-sm text-muted">{run.notes}</p> : null}
        </article>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-cream p-3">
      <div className="text-xs font-black uppercase text-muted">{label}</div>
      <div className="mt-1 text-lg font-black text-ink">{value}</div>
    </div>
  );
}

import { AgentRunLog } from "@/components/admin/AgentRunLog";
import { getAgentRuns } from "@/lib/events";

export default async function AdminAgentRunsPage({ searchParams }: { searchParams: Promise<{ runType?: string }> }) {
  const params = await searchParams;
  const runs = await getAgentRuns();
  const filteredRuns = params.runType ? runs.filter((run) => run.run_type === params.runType) : runs;
  return (
    <div className="grid gap-4">
      <form className="rounded-lg border border-ink/10 bg-paper p-4 shadow-soft">
        <label className="grid gap-1 text-sm font-bold md:max-w-xs">
          Run type filter
          <select name="runType" defaultValue={params.runType ?? ""} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3">
            <option value="">All run types</option>
            <option value="scheduled_deep">Scheduled deep</option>
            <option value="manual_deep">Manual deep</option>
          </select>
        </label>
        <button className="focus-ring mt-3 rounded-md bg-racing px-4 py-2 text-sm font-black text-paper">Apply</button>
      </form>
      <AgentRunLog runs={filteredRuns} />
    </div>
  );
}

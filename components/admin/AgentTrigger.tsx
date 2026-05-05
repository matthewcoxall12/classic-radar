"use client";

import { useState } from "react";

type TriggerResult = {
  ok?: boolean;
  status?: number;
  message?: string;
  runType?: string;
  runId?: string;
  searches_performed?: number;
  results_found?: number;
  events_created?: number;
  events_updated?: number;
  duplicates_found?: number;
  queryCount?: number;
  mock_preview_results?: number;
  mode?: string;
  providerStatus?: string;
  notes?: string[];
  errors?: string[];
};

export function AgentTrigger() {
  const [runType, setRunType] = useState("manual_deep");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TriggerResult | null>(null);

  async function triggerAgent() {
    setPending(true);
    setResult(null);
    const formData = new FormData();
    formData.set("runType", runType);
    const response = await fetch("/api/admin/trigger-agent", { method: "POST", body: formData });
    const body = (await response.json().catch(() => ({ ok: false, message: "Agent response could not be read." }))) as TriggerResult;
    setResult({ ...body, status: response.status });
    setPending(false);
  }

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <select value={runType} onChange={(event) => setRunType(event.target.value)} className="focus-ring min-h-11 rounded-md border border-ink/15 bg-paper px-3 font-bold">
          <option value="manual_deep">Manual deep</option>
          <option value="morning_broad">Morning broad search</option>
          <option value="midday_near_term">Midday near-term</option>
          <option value="evening_social">Evening social</option>
        </select>
        <button type="button" onClick={triggerAgent} disabled={pending} className="focus-ring rounded-md bg-racing px-4 py-2 text-sm font-black text-paper disabled:opacity-60">
          {pending ? "Running..." : "Trigger agent"}
        </button>
      </div>
      {result ? (
        <div className={`rounded-md p-4 text-sm font-semibold ${result.ok ? "bg-racing/10 text-racing" : "bg-oxblood/10 text-oxblood"}`}>
          <p>{result.message ?? (result.ok ? "Agent run completed." : "Agent run failed.")}</p>
          {result.providerStatus === "mock_only" ? (
            <p className="mt-2 rounded-md bg-brass/20 p-3 text-ink">
              Mock mode: generated {result.queryCount ?? result.searches_performed} queries, but no live search provider is connected. Preview results: {result.mock_preview_results ?? 0}.
            </p>
          ) : null}
          {result.runId ? <p className="mt-1">Run ID: {result.runId}</p> : null}
          {typeof result.searches_performed === "number" ? (
            <p className="mt-1">
              Searches {result.searches_performed}, results {result.results_found}, created {result.events_created}, updated {result.events_updated}, duplicates {result.duplicates_found}.
            </p>
          ) : null}
          {result.notes?.length ? (
            <ul className="mt-2 list-disc pl-5">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

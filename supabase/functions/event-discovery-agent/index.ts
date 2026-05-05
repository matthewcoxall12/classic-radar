import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { scoreCandidate } from "../../../lib/agent/confidence.ts";
import { findPotentialDuplicate } from "../../../lib/agent/dedupe.ts";
import { extractCandidateFromSearchResult, normaliseCandidate } from "../../../lib/agent/event-extractor.ts";
import { DirectSourceProvider } from "../../../lib/agent/providers/direct-source-provider.ts";
import { MockSearchProvider } from "../../../lib/agent/providers/mock-search-provider.ts";
import type { SearchProvider, SearchResult } from "../../../lib/agent/providers/types.ts";
import { generateSearchPlan, type AgentRunType } from "../../../lib/agent/query-engine.ts";
import { classifySource, type SourceClassification } from "../../../lib/agent/source-weights.ts";

const allowedRunTypes: AgentRunType[] = ["morning_broad", "midday_near_term", "evening_social", "manual_deep"];

class WebSearchProvider implements SearchProvider {
  name = Deno.env.get("SEARCH_PROVIDER_NAME") || "web-search";

  async search(): Promise<SearchResult[]> {
    // Connect a compliant public search provider here when SEARCH_PROVIDER_API_KEY is configured.
    return new MockSearchProvider().search();
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

async function classifyWithRegistry(supabase: ReturnType<typeof createClient>, url: string): Promise<SourceClassification> {
  const fallback = classifySource(url);
  const domain = getDomain(url);
  if (!domain) return fallback;
  const { data } = await supabase
    .from("source_registry")
    .select("source_type, priority_weight, notes, is_active")
    .eq("domain", domain)
    .maybeSingle();

  if (!data || data.is_active === false) return fallback;
  return {
    sourceType: data.source_type ?? fallback.sourceType,
    baseWeight: data.priority_weight ?? fallback.baseWeight,
    reason: data.notes ?? `Registry override for ${domain}.`
  } as SourceClassification;
}

function shouldUseNewData(existing: Record<string, unknown>, candidate: Record<string, unknown>) {
  const update: Record<string, unknown> = {
    last_checked_at: new Date().toISOString()
  };
  for (const key of ["description", "venue_name", "town", "county", "postcode", "latitude", "longitude", "booking_url", "image_url", "start_time", "end_date"]) {
    if (!existing[key] && candidate[key]) update[key] = candidate[key];
  }
  if (Number(candidate.confidence_score ?? 0) > Number(existing.confidence_score ?? 0)) {
    update.confidence_score = candidate.confidence_score;
  }
  return update;
}

Deno.serve(async (request) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-agent-secret, content-type" };
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: corsHeaders });

  const secret = Deno.env.get("AGENT_SECRET");
  if (secret && request.headers.get("x-agent-secret") !== secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase service configuration missing" }), { status: 500, headers: corsHeaders });
  }

  const payload = await request.json().catch(() => ({}));
  const runType = allowedRunTypes.includes(payload.runType) ? (payload.runType as AgentRunType) : "manual_deep";
  const plan = generateSearchPlan(runType);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const providerMode = Deno.env.get("SEARCH_PROVIDER_MODE") ?? "direct";
  const provider: SearchProvider = Deno.env.get("SEARCH_PROVIDER_API_KEY")
    ? new WebSearchProvider()
    : providerMode === "mock"
      ? new MockSearchProvider()
      : new DirectSourceProvider();
  const stats = { searches_performed: 0, results_found: 0, events_created: 0, events_updated: 0, review_queue_created: 0, duplicates_found: 0 };
  const errors: string[] = [];

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({ run_type: runType, status: "running", notes: plan.notes.join(" ") })
    .select("*")
    .single();
  const runId = run?.id;

  try {
    for (const query of plan.queries) {
      stats.searches_performed += 1;
      let results: SearchResult[] = [];
      try {
        results = (await provider.search(query)).slice(0, plan.maxResultsPerQuery);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      stats.results_found += results.length;

      for (const result of results) {
        const candidate = extractCandidateFromSearchResult(result);
        if (!candidate) continue;

        const normalised = normaliseCandidate(candidate);
        const source = await classifyWithRegistry(supabase, candidate.sourceUrl);
        const confidence = scoreCandidate(
          {
            ...normalised,
            sourceUrl: candidate.sourceUrl,
            sourceTitle: candidate.sourceTitle,
            rawText: [result.title, result.snippet, result.dateText, result.locationText].filter(Boolean).join(" ")
          },
          source
        );
        const eventPayload = {
          ...normalised,
          slug: `${slugify(normalised.title)}-${normalised.start_date ?? "review"}`,
          confidence_score: confidence.score,
          booking_url: normalised.booking_url ?? candidate.sourceUrl,
          organiser_url: candidate.sourceUrl,
          last_checked_at: new Date().toISOString()
        };

        const { data: existingEvents } = await supabase
          .from("events")
          .select("id,title,start_date,town,latitude,longitude,confidence_score,source_count,description,venue_name,county,postcode,booking_url,image_url")
          .gte("start_date", normalised.start_date ?? "1900-01-01")
          .limit(200);
        const duplicate = findPotentialDuplicate(normalised, existingEvents ?? []);

        if (duplicate) {
          stats.duplicates_found += 1;
          const update = shouldUseNewData(duplicate.event as unknown as Record<string, unknown>, eventPayload);
          await supabase
            .from("events")
            .update({
              ...update,
              source_count: ((duplicate.event as { source_count?: number }).source_count ?? 0) + 1
            })
            .eq("id", duplicate.event.id);
          await supabase.from("event_sources").upsert(
            {
              event_id: duplicate.event.id,
              source_url: candidate.sourceUrl,
              source_title: candidate.sourceTitle,
              source_type: source.sourceType,
              raw_excerpt: result.snippet,
              last_seen_at: new Date().toISOString(),
              confidence_score: confidence.score
            },
            { onConflict: "event_id,source_url" }
          );
          stats.events_updated += 1;
          continue;
        }

        if (confidence.canAutoPublish) {
          const { data: created, error } = await supabase
            .from("events")
            .upsert(
              {
                ...eventPayload,
                status: "published",
                is_verified: false,
                source_count: 1
              },
              { onConflict: "slug" }
            )
            .select("id")
            .single();
          if (error) {
            errors.push(error.message);
            continue;
          }
          if (created?.id) {
            await supabase.from("event_sources").upsert(
              {
                event_id: created.id,
                source_url: candidate.sourceUrl,
                source_title: candidate.sourceTitle,
                source_type: source.sourceType,
                raw_excerpt: result.snippet,
                discovered_at: new Date().toISOString(),
                last_seen_at: new Date().toISOString(),
                confidence_score: confidence.score
              },
              { onConflict: "event_id,source_url" }
            );
          }
          stats.events_created += 1;
        } else {
          await supabase.from("review_queue").insert({
            proposed_event: {
              ...eventPayload,
              source_type: source.sourceType,
              source_reason: source.reason,
              raw_snippet: result.snippet,
              confidence_reasons: confidence.reasons
            },
            source_url: candidate.sourceUrl,
            reason: "Confidence below threshold or date/location uncertainty.",
            confidence_score: confidence.score
          });
          stats.review_queue_created += 1;
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("events").update({ status: "expired" }).lt("end_date", today).neq("status", "expired");
    await supabase.from("events").update({ status: "expired" }).is("end_date", null).lt("start_date", today).neq("status", "expired");
    if (runId) {
      await supabase
        .from("agent_runs")
        .update({ ...stats, status: "completed", finished_at: new Date().toISOString(), errors, notes: `${plan.notes.join(" ")} Provider: ${provider.name}.` })
        .eq("id", runId);
    }
    return new Response(JSON.stringify({ ok: true, runId, runType, queryCount: plan.queries.length, ...stats, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    if (runId) await supabase.from("agent_runs").update({ ...stats, status: "failed", finished_at: new Date().toISOString(), errors }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, runId, errors }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

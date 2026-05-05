import { scoreCandidate } from "./confidence.ts";
import { findPotentialDuplicate } from "./dedupe.ts";
import { normaliseCandidate } from "./event-extractor.ts";
import { crawlSource, type SourceRegistryRow } from "./source-crawler.ts";
import type { SourceClassification } from "./source-weights.ts";
import { slugify } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseServiceClient = SupabaseClient;

export type VercelAgentRunType = "morning_broad" | "midday_near_term" | "evening_social" | "manual_deep";

export type SourceAgentStats = {
  ok: boolean;
  runId?: string;
  runType: VercelAgentRunType;
  sources_checked: number;
  pages_fetched: number;
  candidates_found: number;
  events_created: number;
  events_updated: number;
  review_queue_created: number;
  duplicates_found: number;
  errors: string[];
};

function sourceClassification(source: SourceRegistryRow): SourceClassification {
  return {
    sourceType: source.source_type as SourceClassification["sourceType"],
    baseWeight: source.priority_weight,
    reason: `Source registry weight for ${source.domain}.`
  };
}

function runLimit(runType: VercelAgentRunType) {
  if (runType === "manual_deep") return 50;
  if (runType === "morning_broad") return 35;
  if (runType === "midday_near_term") return 25;
  return 20;
}

function sourceOrder(runType: VercelAgentRunType) {
  if (runType === "evening_social") return "source_type";
  return "priority_weight";
}

async function loadSources(supabase: SupabaseServiceClient, runType: VercelAgentRunType, sourceId?: string) {
  let query = supabase
    .from("source_registry")
    .select("id,source_name,domain,start_url,source_type,priority_weight,requires_review,is_active")
    .eq("is_active", true);
  if (sourceId) query = query.eq("id", sourceId);
  const { data, error } = await query.order(sourceOrder(runType), { ascending: runType === "evening_social" }).limit(sourceId ? 1 : runLimit(runType));
  if (error) throw error;
  return (data ?? []) as SourceRegistryRow[];
}

function eventPayload(normalised: ReturnType<typeof normaliseCandidate>, confidenceScore: number, sourceUrl: string) {
  return {
    ...normalised,
    slug: `${slugify(normalised.title)}-${normalised.start_date ?? "review"}`,
    booking_url: normalised.booking_url ?? sourceUrl,
    organiser_url: sourceUrl,
    confidence_score: confidenceScore,
    last_checked_at: new Date().toISOString()
  };
}

async function storeSource(supabase: SupabaseServiceClient, eventId: string, candidate: { sourceUrl: string; sourceTitle?: string; description?: string }, sourceType: string, confidenceScore: number) {
  await supabase.from("event_sources").upsert(
    {
      event_id: eventId,
      source_url: candidate.sourceUrl,
      source_title: candidate.sourceTitle,
      source_type: sourceType,
      raw_excerpt: candidate.description,
      confidence_score: confidenceScore,
      last_seen_at: new Date().toISOString()
    },
    { onConflict: "event_id,source_url" }
  );
}

export async function runSourceDiscoveryAgent(
  supabase: SupabaseServiceClient,
  options: { runType: VercelAgentRunType; sourceId?: string }
): Promise<SourceAgentStats> {
  const stats: SourceAgentStats = {
    ok: true,
    runType: options.runType,
    sources_checked: 0,
    pages_fetched: 0,
    candidates_found: 0,
    events_created: 0,
    events_updated: 0,
    review_queue_created: 0,
    duplicates_found: 0,
    errors: []
  };

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({ run_type: options.runType, status: "running", notes: "Vercel source-first discovery run." })
    .select("id")
    .single();
  stats.runId = run?.id;

  try {
    const sources = await loadSources(supabase, options.runType, options.sourceId);
    for (const source of sources) {
      stats.sources_checked += 1;
      const crawl = await crawlSource(source, {
        maxDetailPages: options.runType === "manual_deep" ? 8 : 4,
        politeDelayMs: 450
      });
      stats.pages_fetched += crawl.pagesFetched;
      stats.candidates_found += crawl.candidates.length;
      stats.errors.push(...crawl.errors.map((error) => `${source.domain}: ${error}`));

      await supabase
        .from("source_registry")
        .update({
          last_checked_at: new Date().toISOString(),
          last_error: crawl.errors[0] ?? null
        })
        .eq("id", source.id);

      for (const candidate of crawl.candidates) {
        const normalised = normaliseCandidate(candidate);
        const confidence = scoreCandidate(
          {
            ...normalised,
            sourceUrl: candidate.sourceUrl,
            sourceTitle: candidate.sourceTitle,
            rawText: candidate.description
          },
          sourceClassification(source)
        );
        const payload = eventPayload(normalised, confidence.score, candidate.sourceUrl);
        const mustReview = source.requires_review || ["facebook", "social", "unknown"].includes(source.source_type) || !confidence.canAutoPublish;

        const { data: existing } = await supabase
          .from("events")
          .select("id,title,start_date,town,latitude,longitude,confidence_score,source_count")
          .limit(250);
        const duplicate = findPotentialDuplicate(normalised, existing ?? []);

        if (duplicate) {
          stats.duplicates_found += 1;
          await supabase
            .from("events")
            .update({
              confidence_score: Math.max(Number(duplicate.event.confidence_score ?? 0), confidence.score),
              source_count: Number((duplicate.event as { source_count?: number }).source_count ?? 0) + 1,
              last_checked_at: new Date().toISOString()
            })
            .eq("id", duplicate.event.id);
          await storeSource(supabase, duplicate.event.id, candidate, source.source_type, confidence.score);
          stats.events_updated += 1;
          continue;
        }

        if (!mustReview) {
          const { data: created, error } = await supabase
            .from("events")
            .upsert({ ...payload, status: "published", source_count: 1, is_verified: false }, { onConflict: "slug" })
            .select("id")
            .single();
          if (error) {
            stats.errors.push(`${source.domain}: ${error.message}`);
            continue;
          }
          if (created?.id) await storeSource(supabase, created.id, candidate, source.source_type, confidence.score);
          stats.events_created += 1;
        } else {
          await supabase.from("review_queue").insert({
            proposed_event: {
              ...payload,
              source_type: source.source_type,
              source_name: source.source_name,
              raw_snippet: candidate.description,
              confidence_reasons: confidence.reasons
            },
            source_url: candidate.sourceUrl,
            reason: "Manual review required for source trust, missing data or confidence threshold.",
            confidence_score: confidence.score
          });
          stats.review_queue_created += 1;
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("events").update({ status: "expired" }).lt("end_date", today).neq("status", "expired");
    await supabase.from("events").update({ status: "expired" }).is("end_date", null).lt("start_date", today).neq("status", "expired");

    if (stats.runId) {
      await supabase
        .from("agent_runs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          sources_checked: stats.sources_checked,
          pages_fetched: stats.pages_fetched,
          candidates_found: stats.candidates_found,
          events_created: stats.events_created,
          events_updated: stats.events_updated,
          review_queue_created: stats.review_queue_created,
          duplicates_found: stats.duplicates_found,
          errors: stats.errors
        })
        .eq("id", stats.runId);
    }
  } catch (error) {
    stats.ok = false;
    stats.errors.push(error instanceof Error ? error.message : String(error));
    if (stats.runId) {
      await supabase
        .from("agent_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), errors: stats.errors })
        .eq("id", stats.runId);
    }
  }

  return stats;
}

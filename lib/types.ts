export type EventStatus = "draft" | "review" | "published" | "rejected" | "expired";

export type ClassicEvent = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  event_type: string;
  start_date: string;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  venue_name: string | null;
  address: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  price_text: string | null;
  booking_required: boolean | null;
  booking_url: string | null;
  organiser_name: string | null;
  organiser_url: string | null;
  image_url: string | null;
  status: EventStatus;
  confidence_score: number;
  is_verified: boolean;
  source_count: number;
  last_checked_at: string | null;
  created_at?: string;
  updated_at?: string;
  distance_miles?: number | null;
};

export type AgentRun = {
  id: string;
  run_type: string | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  searches_performed: number;
  results_found: number;
  events_created: number;
  events_updated: number;
  review_queue_created?: number;
  duplicates_found: number;
  sources_checked?: number;
  pages_fetched?: number;
  candidates_found?: number;
  errors?: unknown[];
  notes: string | null;
};

export type ReviewQueueItemType = {
  id: string;
  proposed_event: Record<string, unknown>;
  source_url: string | null;
  reason: string | null;
  confidence_score: number;
  status: string;
  created_at: string;
};

export type SourceRegistryEntry = {
  id: string;
  domain: string;
  source_name: string;
  start_url: string;
  source_type: string;
  priority_weight: number;
  crawl_frequency?: string | null;
  is_active: boolean;
  requires_review?: boolean | null;
  notes: string | null;
  last_checked_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at?: string;
};

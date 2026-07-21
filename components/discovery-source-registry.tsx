"use client";

import {
  CheckCircle2,
  ChevronDown,
  DatabaseZap,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "@/components/discovery-source-registry.module.css";

type Endpoint = {
  id: string;
  adapter: string;
  url: string;
  status: string;
  scheduleHours: number;
  countryCode: string;
  locale: string;
  timezone: string;
  maxPages: number;
  maxRecords: number;
  nextRunAt: number;
  failureCount: number;
  lastSuccessAt: number | null;
  lastErrorCode: string | null;
  lastRun: {
    status: string;
    startedAt: number;
    findingsCount: number;
    candidatesCount: number;
  } | null;
};

type Source = {
  id: string;
  key: string;
  name: string;
  type: string;
  canonicalUrl: string;
  permissionBasis: string;
  status: "pending" | "active" | "paused" | "revoked";
  trustLevel: "unverified" | "organizer" | "partner" | "official";
  lastSeenAt: string;
  updatedAt: string;
  endpoints: Endpoint[];
};

type RegistryResponse = {
  ok: boolean;
  data?: {
    sources: Source[];
    counts: Record<string, number>;
    nextCursor?: string | null;
  };
  error?: { code?: string; message?: string };
};

function csrfToken() {
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-cme_csrf="));
  return item ? decodeURIComponent(item.slice("__Host-cme_csrf=".length)) : "";
}

function needsReauth(code: string | undefined) {
  return ["REAUTH_REQUIRED", "FRESH_AUTH_REQUIRED", "CSRF_CHECK_FAILED"].includes(code ?? "");
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function epochDate(value: number | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value * 1_000));
}

function SourceControl({ source, onSaved }: { source: Source; onSaved: () => void }) {
  const [status, setStatus] = useState(source.status);
  const [trustLevel, setTrustLevel] = useState(source.trustLevel);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const changed = status !== source.status || trustLevel !== source.trustLevel;

  const save = async () => {
    const csrf = csrfToken();
    if (!csrf) {
      window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
      return;
    }
    setState("saving");
    setMessage("Saving audited source controls…");
    try {
      const response = await fetch("/api/admin/discovery/source", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CME-CSRF": csrf },
        body: JSON.stringify({
          sourceId: source.id,
          expectedUpdatedAt: source.updatedAt,
          status,
          trustLevel,
          reason: reason.trim(),
        }),
      });
      const payload = await response.json() as RegistryResponse;
      if (!response.ok || !payload.ok) {
        if (payload.error?.code === "AUTH_REQUIRED") {
          window.location.assign("/sign-in?return_to=%2Fadmin");
          return;
        }
        if (needsReauth(payload.error?.code)) {
          window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
          return;
        }
        throw new Error(payload.error?.message || "The source could not be updated.");
      }
      setReason("");
      setState("idle");
      onSaved();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  };

  return (
    <article className={styles.sourceCard}>
      <div className={styles.sourceHeading}>
        <div>
          <span className={`${styles.status} ${styles[source.status]}`}>{label(source.status)}</span>
          <h3>{source.name}</h3>
          <p>{label(source.type)} · {label(source.permissionBasis)}</p>
        </div>
        <a href={source.canonicalUrl} target="_blank" rel="noreferrer">
          Review source <ExternalLink size={14} />
        </a>
      </div>
      <div className={styles.endpointList}>
        {source.endpoints.map((endpoint) => (
          <div key={endpoint.id} className={styles.endpoint}>
            <strong>{label(endpoint.adapter)}</strong>
            <span>{endpoint.countryCode} · every {endpoint.scheduleHours}h · {endpoint.maxRecords} records</span>
            <span>Last success: {epochDate(endpoint.lastSuccessAt)}</span>
            {endpoint.lastErrorCode && <span className={styles.endpointError}>{label(endpoint.lastErrorCode)}</span>}
          </div>
        ))}
      </div>
      <div className={styles.controls}>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as Source["status"])}>
            {(["pending", "active", "paused", "revoked"] as const).map((value) => (
              <option key={value} value={value}>{label(value)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Trust</span>
          <select value={trustLevel} onChange={(event) => setTrustLevel(event.target.value as Source["trustLevel"])}>
            {(["unverified", "organizer", "partner", "official"] as const).map((value) => (
              <option key={value} value={value}>{label(value)}</option>
            ))}
          </select>
        </label>
        <label className={styles.reason}>
          <span>Immutable review reason</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Terms/robots review, organizer permission, expiry or suspension evidence."
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed || reason.trim().length < 10 || state === "saving"}
        >
          {state === "saving" ? <LoaderCircle className={styles.spin} size={16} /> : <ShieldCheck size={16} />}
          Save source
        </button>
      </div>
      {message && <p className={state === "error" ? styles.error : styles.message} role={state === "error" ? "alert" : "status"}>{message}</p>}
      {(status === "paused" || status === "revoked") && status !== source.status && (
        <p className={styles.warning}>Saving will withdraw every published listing linked to this source and return its candidates to review.</p>
      )}
    </article>
  );
}

function OnboardSource({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    adapter: "rss",
    endpointUrl: "",
    countryCode: "GB",
    locale: "en-GB",
    timezone: "Europe/London",
    scheduleHours: 24,
    maxPages: 20,
    maxRecords: 25,
    permissionBasis: "manual_review",
    reason: "",
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const csrf = csrfToken();
    if (!csrf) {
      window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
      return;
    }
    setState("saving");
    setMessage("Adding the source in Pending state…");
    try {
      const response = await fetch("/api/admin/discovery/endpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CME-CSRF": csrf },
        body: JSON.stringify(form),
      });
      const payload = await response.json() as RegistryResponse;
      if (!response.ok || !payload.ok) {
        if (needsReauth(payload.error?.code)) {
          window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
          return;
        }
        throw new Error(payload.error?.message || "The source could not be added.");
      }
      setState("saved");
      setMessage("Source added safely. Review it below, then activate it when permission is confirmed.");
      setForm((current) => ({ ...current, name: "", endpointUrl: "", reason: "" }));
      onCreated();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  };

  return (
    <div className={styles.onboard}>
      <button type="button" className={styles.onboardToggle} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Plus size={17} /> Onboard a public feed or crawl target <ChevronDown size={17} />
      </button>
      {open && (
        <form onSubmit={submit} className={styles.onboardForm}>
          <p>No credentials are accepted here. New targets stay Pending until you record a separate permission review.</p>
          <label><span>Source name</span><input required minLength={3} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>
            <span>Adapter</span>
            <select value={form.adapter} onChange={(event) => setForm({ ...form, adapter: event.target.value })}>
              <option value="rss">RSS / Atom</option>
              <option value="ical">ICS calendar</option>
              <option value="firecrawl_map">Firecrawl map</option>
              <option value="firecrawl_crawl">Firecrawl crawl</option>
              <option value="firecrawl_scrape">Firecrawl scrape</option>
            </select>
          </label>
          <label className={styles.wide}><span>Public HTTPS endpoint</span><input required type="url" maxLength={1500} placeholder="https://club.example/events/feed" value={form.endpointUrl} onChange={(event) => setForm({ ...form, endpointUrl: event.target.value })} /></label>
          <label><span>Country code</span><input required minLength={2} maxLength={2} value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value.toUpperCase() })} /></label>
          <label><span>Locale</span><input required maxLength={35} value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value })} /></label>
          <label><span>IANA timezone</span><input required maxLength={80} value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></label>
          <label><span>Run every (hours)</span><input required type="number" min={6} max={24} value={form.scheduleHours} onChange={(event) => setForm({ ...form, scheduleHours: Number(event.target.value) })} /></label>
          <label><span>Page limit</span><input required type="number" min={1} max={100} value={form.maxPages} onChange={(event) => setForm({ ...form, maxPages: Number(event.target.value) })} /></label>
          <label><span>Record limit</span><input required type="number" min={1} max={100} value={form.maxRecords} onChange={(event) => setForm({ ...form, maxRecords: Number(event.target.value) })} /></label>
          <label>
            <span>Permission basis</span>
            <select value={form.permissionBasis} onChange={(event) => setForm({ ...form, permissionBasis: event.target.value })}>
              <option value="manual_review">Review still required</option>
              <option value="organizer_authorized">Organizer authorized</option>
            </select>
          </label>
          <label className={styles.wide}><span>Onboarding rationale</span><textarea required minLength={10} maxLength={500} rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
          <button type="submit" disabled={state === "saving"}>
            {state === "saving" ? <LoaderCircle className={styles.spin} size={17} /> : <CheckCircle2 size={17} />}
            Add as Pending
          </button>
          {message && <p className={state === "error" ? styles.error : styles.message} role={state === "error" ? "alert" : "status"}>{message}</p>}
        </form>
      )}
    </div>
  );
}

export default function DiscoverySourceRegistry({ onChanged }: { onChanged?: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (status !== "all") params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/admin/discovery/source?${params}`, { cache: "no-store" });
      const payload = await response.json() as RegistryResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error?.message || "The source registry could not be loaded.");
      }
      setSources((current) => {
        if (!cursor) return payload.data?.sources ?? [];
        const merged = new Map(current.map((source) => [source.id, source]));
        (payload.data?.sources ?? []).forEach((source) => merged.set(source.id, source));
        return [...merged.values()];
      });
      setCounts(payload.data.counts);
      setNextCursor(payload.data.nextCursor ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changed = () => {
    void load();
    onChanged?.();
  };

  return (
    <details className={styles.registry}>
      <summary>
        <span><DatabaseZap size={20} /> Discovery source registry</span>
        <span>{Object.values(counts).reduce((sum, value) => sum + value, 0) || "—"} sources · {counts.pending ?? 0} awaiting review</span>
      </summary>
      <div className={styles.body}>
        <div className={styles.intro}>
          <div>
            <h2>Permission-gated event sources</h2>
            <p>Agents only run sources marked Active. Candidates still require a separate human review before publication.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? styles.spin : ""} size={16} /> Refresh
          </button>
        </div>
        <OnboardSource onCreated={changed} />
        <div className={styles.filters}>
          <label><Search size={16} /><span className={styles.srOnly}>Search sources</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Club, museum, feed or URL" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Source status">
            <option value="all">All statuses ({Object.values(counts).reduce((sum, value) => sum + value, 0)})</option>
            {(["pending", "active", "paused", "revoked"] as const).map((value) => <option key={value} value={value}>{label(value)} ({counts[value] ?? 0})</option>)}
          </select>
        </div>
        {loading && <div className={styles.state}><LoaderCircle className={styles.spin} /> Loading sources…</div>}
        {error && <div className={`${styles.state} ${styles.error}`} role="alert">{error}</div>}
        {!loading && !error && sources.length === 0 && <div className={styles.state}>No sources match this view.</div>}
        {!error && <div className={styles.list}>{sources.map((source) => <SourceControl key={`${source.id}-${source.updatedAt}`} source={source} onSaved={changed} />)}</div>}
        {!loading && !error && nextCursor && (
          <button type="button" className={styles.onboardToggle} onClick={() => void load(nextCursor)}>
            Load more sources
          </button>
        )}
      </div>
    </details>
  );
}

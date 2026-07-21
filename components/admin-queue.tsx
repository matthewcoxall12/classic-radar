"use client";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Mail,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/components/admin-queue.module.css";
import DiscoverySourceRegistry from "@/components/discovery-source-registry";
import {
  type AdminQueueItem,
  type QueueKind,
  queueStatuses,
} from "@/lib/operations-queue";

type QueueFilter = "all" | QueueKind;
type QueueLoadResponse = {
  ok: boolean;
  data?: {
    items: AdminQueueItem[];
    adminEmails: string[];
    nextDiscoveryCursor?: string | null;
  };
  error?: { code?: string; message?: string };
};

type QueueMutationResponse = {
  ok: boolean;
  data?: {
    updatedAt?: string;
    status?: string;
    eventId?: string;
    reviewRequired?: boolean;
    publication?: AdminQueueItem["publication"];
    candidate?: AdminQueueItem["editableCandidate"];
    sourceReview?: AdminQueueItem["sourceReview"];
    linkedPublicEventsAffected?: number;
    candidateState?: {
      status: string;
      reviewRequired: boolean;
      updatedAt: string;
    } | null;
  };
  error?: { code?: string; message?: string };
};

function needsAdminReauth(code: string | undefined) {
  return (
    code === "REAUTH_REQUIRED" ||
    code === "FRESH_AUTH_REQUIRED" ||
    code === "CSRF_CHECK_FAILED"
  );
}

function csrfToken() {
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-cme_csrf="));
  return item ? decodeURIComponent(item.slice("__Host-cme_csrf=".length)) : "";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formattedDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isSafeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function QueueCard({
  item,
  adminEmails,
  onSaved,
}: {
  item: AdminQueueItem;
  adminEmails: string[];
  onSaved: (updated: AdminQueueItem) => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [assignedTo, setAssignedTo] = useState(item.assignedTo);
  const [internalNotes, setInternalNotes] = useState(item.internalNotes);
  const [candidate, setCandidate] = useState(item.editableCandidate);
  const [sourceReview, setSourceReview] = useState(item.sourceReview);
  const [sourceReason, setSourceReason] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const dirty =
    status !== item.status ||
    assignedTo !== item.assignedTo ||
    internalNotes !== item.internalNotes;
  const candidateDirty =
    JSON.stringify(candidate) !== JSON.stringify(item.editableCandidate);
  const sourceDirty =
    JSON.stringify(sourceReview) !== JSON.stringify(item.sourceReview);
  const hasChanges =
    dirty ||
    candidateDirty ||
    (item.kind === "discovery" && item.status === "published" && item.reviewRequired);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const csrf = csrfToken();
    if (!csrf) {
      window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
      return;
    }
    setSaveState("saving");
    setSaveMessage("Saving queue item…");
    try {
      const response = await fetch("/api/admin/queue", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CME-CSRF": csrf,
        },
        body: JSON.stringify({
          kind: item.kind,
          id: item.id,
          expectedUpdatedAt: item.updatedAt,
          status,
          assignedTo,
          internalNotes,
          ...(item.kind === "discovery" ? { candidate } : {}),
          ...(item.kind === "discovery" ? { sourceReview } : {}),
        }),
      });
      const payload = (await response.json()) as QueueMutationResponse;
      if (!response.ok || !payload.ok) {
        if (payload.error?.code === "AUTH_REQUIRED") {
          window.location.assign("/sign-in?return_to=%2Fadmin");
          return;
        }
        if (needsAdminReauth(payload.error?.code)) {
          window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
          return;
        }
        throw new Error(payload.error?.message || "The queue item could not be saved.");
      }
      const updated = {
        ...item,
        status,
        assignedTo,
        internalNotes: internalNotes.trim(),
        updatedAt: payload.data?.updatedAt ?? item.updatedAt,
        reviewRequired: payload.data?.reviewRequired ?? item.reviewRequired,
        publication: payload.data?.publication ?? item.publication,
        editableCandidate: payload.data?.candidate ?? candidate,
        sourceReview: payload.data?.sourceReview ?? sourceReview,
        title: payload.data?.candidate?.title ?? item.title,
      };
      setInternalNotes(updated.internalNotes);
      onSaved(updated);
      setSaveState("saved");
      setSaveMessage(`Saved ${item.reference}.`);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Please try again.");
    }
  };

  const saveSource = async () => {
    if (!sourceReview || !sourceDirty) return;
    const reason = sourceReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setSaveState("error");
      setSaveMessage("Give a source-control reason between 10 and 500 characters.");
      return;
    }
    const csrf = csrfToken();
    if (!csrf) {
      window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
      return;
    }
    setSaveState("saving");
    setSaveMessage("Applying source control across linked listings…");
    try {
      const response = await fetch("/api/admin/discovery/source", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CME-CSRF": csrf },
        body: JSON.stringify({
          sourceId: sourceReview.id,
          candidateId: item.id,
          expectedUpdatedAt: sourceReview.updatedAt,
          status: sourceReview.status,
          trustLevel: sourceReview.trustLevel,
          reason,
        }),
      });
      const payload = (await response.json()) as QueueMutationResponse;
      if (!response.ok || !payload.ok || !payload.data?.sourceReview) {
        if (payload.error?.code === "AUTH_REQUIRED") {
          window.location.assign("/sign-in?return_to=%2Fadmin");
          return;
        }
        if (needsAdminReauth(payload.error?.code)) {
          window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
          return;
        }
        throw new Error(payload.error?.message || "The source controls could not be saved.");
      }
      const nextSource = payload.data.sourceReview;
      const candidateState = payload.data.candidateState;
      setSourceReview(nextSource);
      setSourceReason("");
      onSaved({
        ...item,
        sourceReview: nextSource,
        ...(candidateState
          ? {
              status: candidateState.status,
              reviewRequired: candidateState.reviewRequired,
              updatedAt: candidateState.updatedAt,
              publication:
                candidateState.status === "reviewing"
                  ? {
                      ready: false,
                      missing: ["review after source suspension", "active reviewed source"],
                    }
                  : item.publication,
            }
          : {}),
      });
      setSaveState("saved");
      setSaveMessage(
        `Source controls saved; ${payload.data.linkedPublicEventsAffected ?? 0} linked public event(s) withdrawn.`,
      );
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Please try again.");
    }
  };

  const publish = async () => {
    const csrf = csrfToken();
    if (!csrf) {
      window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
      return;
    }
    setSaveState("saving");
    setSaveMessage("Publishing validated event…");
    try {
      const response = await fetch("/api/admin/discovery/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CME-CSRF": csrf },
        body: JSON.stringify({ id: item.id, expectedUpdatedAt: item.updatedAt }),
      });
      const payload = (await response.json()) as QueueMutationResponse;
      if (!response.ok || !payload.ok) {
        if (payload.error?.code === "AUTH_REQUIRED") {
          window.location.assign("/sign-in?return_to=%2Fadmin");
          return;
        }
        if (needsAdminReauth(payload.error?.code)) {
          window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
          return;
        }
        throw new Error(payload.error?.message || "The candidate could not be published.");
      }
      onSaved({
        ...item,
        status: "published",
        reviewRequired: false,
        updatedAt: payload.data?.updatedAt ?? item.updatedAt,
        publication: {
          ready: false,
          missing: ["candidate is already published"],
          eventId: payload.data?.eventId,
        },
      });
      setSaveState("saved");
      setSaveMessage(`Published ${item.reference} with preserved provenance.`);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Please try again.");
    }
  };

  const withdraw = async () => {
    const reason = window.prompt(
      "Why must this event be removed? This is audited and the public record will be hidden immediately.",
    )?.trim();
    if (!reason) return;
    if (reason.length < 10 || reason.length > 500) {
      setSaveState("error");
      setSaveMessage("Give a withdrawal reason between 10 and 500 characters.");
      return;
    }
    const csrf = csrfToken();
    if (!csrf) {
      window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
      return;
    }
    setSaveState("saving");
    setSaveMessage("Withdrawing public event…");
    try {
      const response = await fetch("/api/admin/discovery/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CME-CSRF": csrf },
        body: JSON.stringify({ id: item.id, expectedUpdatedAt: item.updatedAt, reason }),
      });
      const payload = (await response.json()) as QueueMutationResponse;
      if (!response.ok || !payload.ok) {
        if (payload.error?.code === "AUTH_REQUIRED") {
          window.location.assign("/sign-in?return_to=%2Fadmin");
          return;
        }
        if (needsAdminReauth(payload.error?.code)) {
          window.location.assign("/api/auth/reauth?return_to=%2Fadmin");
          return;
        }
        throw new Error(payload.error?.message || "The event could not be withdrawn.");
      }
      onSaved({
        ...item,
        status: "reviewing",
        reviewRequired: true,
        updatedAt: payload.data?.updatedAt ?? item.updatedAt,
        publication: {
          ready: false,
          missing: ["review of the withdrawn listing", "editorial approval"],
          eventId: payload.data?.eventId,
        },
      });
      setSaveState("saved");
      setSaveMessage(`Withdrew ${item.reference}; provenance and audit history were preserved.`);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Please try again.");
    }
  };

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.referenceLine}>
            <span>{item.reference}</span>
            <span className={`${styles.kind} ${styles[item.kind]}`}>{item.kind}</span>
          </div>
          <h2>{item.title}</h2>
          <p>{item.subtitle}</p>
        </div>
        <time dateTime={item.createdAt}>{formattedDate(item.createdAt)}</time>
      </div>

      <div className={styles.contactLine}>
        <Users size={16} aria-hidden="true" />
        <span>{item.contactName}</span>
        {item.email && <a href={`mailto:${item.email}`}><Mail size={15} aria-hidden="true" /> {item.email}</a>}
      </div>

      <dl className={styles.details}>
        {item.fields.map((field) => (
          <div key={`${field.label}-${field.value}`}>
            <dt>{field.label}</dt>
            <dd>
              {field.url && isSafeExternalUrl(field.url) ? (
                <a href={field.url} target="_blank" rel="noreferrer">
                  {field.value} <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : (
                field.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      <form className={styles.controls} onSubmit={save}>
        {candidate && (
          <fieldset className={styles.candidateEditor}>
            <legend>Normalized public event facts</legend>
            <label className={styles.wideField}>
              <span>Title</span>
              <input value={candidate.title} maxLength={160} onChange={(event) => setCandidate({ ...candidate, title: event.target.value })} />
            </label>
            <label className={styles.wideField}>
              <span>Facts-only description</span>
              <textarea value={candidate.description} maxLength={1500} rows={4} onChange={(event) => setCandidate({ ...candidate, description: event.target.value })} />
            </label>
            <label><span>Organiser</span><input value={candidate.organiserName} maxLength={160} onChange={(event) => setCandidate({ ...candidate, organiserName: event.target.value })} /></label>
            <label><span>Venue</span><input value={candidate.venue} maxLength={180} onChange={(event) => setCandidate({ ...candidate, venue: event.target.value })} /></label>
            <label><span>Town</span><input value={candidate.town} maxLength={120} onChange={(event) => setCandidate({ ...candidate, town: event.target.value })} /></label>
            <label><span>Postal code</span><input value={candidate.postcode} maxLength={16} onChange={(event) => setCandidate({ ...candidate, postcode: event.target.value })} /></label>
            <label><span>Country code</span><input value={candidate.countryCode} maxLength={2} onChange={(event) => setCandidate({ ...candidate, countryCode: event.target.value.toUpperCase() })} /></label>
            <label><span>Region / admin area</span><input value={candidate.adminArea} maxLength={120} onChange={(event) => setCandidate({ ...candidate, adminArea: event.target.value })} /></label>
            <label><span>IANA timezone</span><input value={candidate.timezone} maxLength={80} onChange={(event) => setCandidate({ ...candidate, timezone: event.target.value })} /></label>
            <label><span>Start date</span><input type="date" value={candidate.startDate} onChange={(event) => setCandidate({ ...candidate, startDate: event.target.value })} /></label>
            <label><span>End date</span><input type="date" value={candidate.endDate ?? ""} onChange={(event) => setCandidate({ ...candidate, endDate: event.target.value || null })} /></label>
            <label><span>Start time</span><input type="time" value={candidate.startTime ?? ""} onChange={(event) => setCandidate({ ...candidate, startTime: event.target.value || null })} /></label>
            <label>
              <span>Category</span>
              <select value={candidate.category} onChange={(event) => setCandidate({ ...candidate, category: event.target.value })}>
                {["Show", "Meet", "Autojumble", "Motorsport", "Run", "Other"].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className={styles.wideField}><span>Official HTTPS URL</span><input type="url" value={candidate.officialUrl} maxLength={1500} onChange={(event) => setCandidate({ ...candidate, officialUrl: event.target.value })} /></label>
            <label><span>Price/admission</span><input value={candidate.price} maxLength={100} onChange={(event) => setCandidate({ ...candidate, price: event.target.value })} /></label>
            <label><span>Latitude</span><input type="number" step="any" value={candidate.latitude ?? ""} onChange={(event) => setCandidate({ ...candidate, latitude: event.target.value === "" ? null : Number(event.target.value) })} /></label>
            <label><span>Longitude</span><input type="number" step="any" value={candidate.longitude ?? ""} onChange={(event) => setCandidate({ ...candidate, longitude: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          </fieldset>
        )}
        {sourceReview && (
          <fieldset className={styles.sourceEditor}>
            <legend>Reviewed source control</legend>
            <label>
              <span>Source status</span>
              <select value={sourceReview.status} onChange={(event) => setSourceReview({ ...sourceReview, status: event.target.value as typeof sourceReview.status })}>
                {["pending", "active", "paused", "revoked"].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
              </select>
            </label>
            <label>
              <span>Trust level</span>
              <select value={sourceReview.trustLevel} onChange={(event) => setSourceReview({ ...sourceReview, trustLevel: event.target.value as typeof sourceReview.trustLevel })}>
                {["unverified", "organizer", "partner", "official"].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
              </select>
            </label>
            <label className={styles.wideField}>
              <span>Immutable transition reason</span>
              <textarea
                value={sourceReason}
                onChange={(event) => setSourceReason(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Permission evidence, expiry, suspension or trust-level rationale. Never paste credentials."
              />
            </label>
            <button
              className={styles.sourceSaveButton}
              type="button"
              onClick={() => void saveSource()}
              disabled={!sourceDirty || sourceReason.trim().length < 10 || saveState === "saving"}
            >
              <ShieldCheck size={16} /> Save source control
            </button>
            <p>Set Active only after reviewing the displayed permission basis. Paused and Revoked block new observations and publication.</p>
          </fieldset>
        )}
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {queueStatuses[item.kind].filter((value) => value !== "published" || item.status === "published").map((value) => (
              <option key={value} value={value}>{statusLabel(value)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Assigned to</span>
          <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
            <option value="">Unassigned</option>
            {adminEmails.map((email) => <option key={email} value={email}>{email}</option>)}
          </select>
        </label>
        <label className={styles.notes}>
          <span>Internal notes</span>
          <textarea
            value={internalNotes}
            onChange={(event) => setInternalNotes(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Verification, follow-up or response notes. Never paste credentials."
          />
          <small>{internalNotes.length} / 2,000</small>
        </label>
        {item.kind === "discovery" && item.publication && (
          <div className={item.publication.ready ? styles.publicationReady : styles.publicationGate}>
            <strong>{item.publication.ready ? "Ready for the separate Publish check" : "Not publishable yet"}</strong>
            {!item.publication.ready && <span>{item.publication.missing.join(" · ")}</span>}
          </div>
        )}
        <div className={styles.saveRow}>
          <button type="submit" disabled={!hasChanges || sourceDirty || saveState === "saving"}>
            {saveState === "saving" ? <LoaderCircle className={styles.spin} size={17} /> : <CheckCircle2 size={17} />}
            {saveState === "saving"
              ? "Saving…"
              : item.kind === "discovery" && item.status === "published"
                ? "Apply reviewed live update"
                : "Save update"}
          </button>
          {item.kind === "discovery" && item.status !== "published" && (
            <button
              className={styles.publishButton}
              type="button"
              onClick={() => void publish()}
              disabled={
                hasChanges ||
                sourceDirty ||
                saveState === "saving" ||
                item.status !== "approved" ||
                !item.publication?.ready
              }
            >
              <Rocket size={17} /> Publish event
            </button>
          )}
          {item.kind === "discovery" && item.status === "published" && (
            <button
              className={styles.withdrawButton}
              type="button"
              onClick={() => void withdraw()}
              disabled={saveState === "saving"}
            >
              <X size={17} /> Withdraw public event
            </button>
          )}
          {saveMessage && (
            <p className={saveState === "error" ? styles.saveError : styles.saveMessage} role={saveState === "error" ? "alert" : "status"}>
              {saveMessage}
            </p>
          )}
        </div>
      </form>
    </article>
  );
}

export default function AdminQueue({ currentAdmin }: { currentAdmin: string }) {
  const [items, setItems] = useState<AdminQueueItem[]>([]);
  const [adminEmails, setAdminEmails] = useState<string[]>([currentAdmin]);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextDiscoveryCursor, setNextDiscoveryCursor] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("discoveryCursor", cursor);
      const response = await fetch(`/api/admin/queue?${params}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json()) as QueueLoadResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        if (payload.error?.code === "AUTH_REQUIRED") {
          window.location.assign("/sign-in?return_to=%2Fadmin");
          return;
        }
        throw new Error(payload.error?.message || "The operations queue could not be loaded.");
      }
      setItems((current) => {
        if (!cursor) return payload.data?.items ?? [];
        const merged = new Map(
          current.map((item) => [`${item.kind}:${item.id}`, item]),
        );
        (payload.data?.items ?? []).forEach((item) =>
          merged.set(`${item.kind}:${item.id}`, item),
        );
        return [...merged.values()].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        );
      });
      setAdminEmails(payload.data.adminEmails);
      setNextDiscoveryCursor(payload.data.nextDiscoveryCursor ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.kind !== filter) return false;
      if (!term) return true;
      return [
        item.reference,
        item.title,
        item.subtitle,
        item.contactName,
        item.email,
        item.status,
        item.assignedTo,
      ].some((value) => value.toLowerCase().includes(term));
    });
  }, [filter, items, query]);

  const counts = useMemo(
    () => ({
      all: items.length,
      event: items.filter((item) => item.kind === "event").length,
      partner: items.filter((item) => item.kind === "partner").length,
      privacy: items.filter((item) => item.kind === "privacy").length,
      discovery: items.filter((item) => item.kind === "discovery").length,
    }),
    [items],
  );

  const saved = (updated: AdminQueueItem) => {
    setItems((current) => current.map((item) => item.id === updated.id && item.kind === updated.kind ? updated : item));
  };

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back}><ArrowLeft size={17} /> Event finder</Link>
        <span><LockKeyhole size={15} /> Private operations</span>
        <span>{currentAdmin}</span>
      </header>

      <section className={styles.hero}>
        <div>
          <p>ClassicsGo · Operations</p>
          <h1>Review queue</h1>
          <span><ShieldCheck size={16} /> Verified administrator session</span>
        </div>
        <ClipboardList size={70} strokeWidth={1.25} aria-hidden="true" />
      </section>

      <section className={styles.workspace} aria-label="Submission queues">
        <DiscoverySourceRegistry onChanged={() => void load()} />
        <div className={styles.toolbar}>
          <div className={styles.tabs} role="group" aria-label="Queue type">
            {(["all", "event", "partner", "privacy", "discovery"] as const).map((kind) => (
              <button key={kind} type="button" className={filter === kind ? styles.activeTab : ""} onClick={() => setFilter(kind)}>
                {kind === "all" ? "All" : statusLabel(kind)} <span>{counts[kind]}</span>
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <Search size={17} aria-hidden="true" />
            <span className={styles.srOnly}>Search queue</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reference, name or email" />
          </label>
          <button className={styles.refresh} type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? styles.spin : ""} size={17} /> Refresh
          </button>
        </div>

        <div className={styles.notice}>
          <CalendarDays size={17} aria-hidden="true" />
          <p>Discovery candidates are never published automatically. Approval records the source-permission review and activates only the displayed source; Publish remains disabled until the normalized event is complete and revalidated. Every edit and publication is written to the immutable audit trail.</p>
        </div>

        {loading && <div className={styles.state}><LoaderCircle className={styles.spin} /> Loading secure queue…</div>}
        {!loading && error && <div className={`${styles.state} ${styles.error}`} role="alert">{error}</div>}
        {!loading && !error && filteredItems.length === 0 && (
          <div className={styles.state}>No queue items match this view.</div>
        )}
        {!loading && !error && (
          <div className={styles.list}>
            {filteredItems.map((item) => (
              <QueueCard key={`${item.kind}-${item.id}-${item.updatedAt}`} item={item} adminEmails={adminEmails} onSaved={saved} />
            ))}
            {nextDiscoveryCursor && (
              <button
                className={styles.refresh}
                type="button"
                disabled={loading}
                onClick={() => void load(nextDiscoveryCursor)}
              >
                {loading ? <LoaderCircle className={styles.spin} size={17} /> : null}
                Load older discovery candidates
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

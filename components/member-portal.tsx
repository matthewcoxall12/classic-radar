"use client";

import {
  ArrowRight,
  BellRing,
  Bookmark,
  CalendarDays,
  CalendarSync,
  CarFront,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Crown,
  Download,
  Gauge,
  Gift,
  Home,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPinned,
  Plus,
  Route,
  Settings,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { membershipPrices, roadbookPerks } from "@/lib/member-perks";
import styles from "./member-portal.module.css";

type MemberTier = "free" | "roadbook";
type TabId = "overview" | "wishlist" | "attending" | "roadbooks" | "alerts" | "garage" | "perks" | "account";
type Notice = { type: "success" | "error"; text: string } | null;

type Member = {
  email: string;
  displayName: string;
  tier: MemberTier;
  subscription: { status: string; expiresAt: string | null } | null;
  membershipSource: "stripe" | "trial" | null;
  trialEligible: boolean;
  homeArea: { name: string; latitude: number; longitude: number; radiusMiles: number } | null;
  digestFrequency: string;
  calendarFeedUrl: string | null;
};

type Entitlements = {
  canSaveEvents: boolean;
  maxLocations: number;
  canUseRoadbooks: boolean;
  canUseAlerts: boolean;
  canUseCalendarFeed: boolean;
  canUseAdvancedFilters: boolean;
  isAdFree: boolean;
  digestFrequencies: string[];
};

type SavedItem = {
  eventId: string;
  savedAt: string;
  event: {
    id: string;
    title: string;
    venue: string;
    town: string;
    postcode?: string;
    startDate: string;
    startTime?: string;
    category?: string;
    price?: string;
    officialUrl?: string;
  };
};

type AttendanceItem = {
  eventId: string;
  goingAt: string;
  goingCount: number;
  event: SavedItem["event"];
};

type LocationItem = {
  id: string;
  label: string;
  placeName?: string;
  radiusMiles: number;
  isHome?: boolean;
};

type VehicleItem = {
  id: string;
  name: string;
  make: string;
  model: string;
  year?: number | null;
  interests?: string[];
};

type RoadbookItem = {
  id: string;
  name: string;
  description?: string | null;
  isShared?: boolean;
  shareUrl?: string | null;
  eventCount?: number;
  events?: Array<{
    eventId: string;
    position: number;
    notes?: string;
    event: SavedItem["event"];
  }>;
  updatedAt?: string;
};

type AlertItem = {
  id: string;
  name: string;
  category?: string | null;
  marque?: string | null;
  frequency?: string;
  radiusMiles?: number;
  active?: boolean;
};

type NotificationItem = {
  id: string;
  title: string;
  body?: string;
  createdAt?: string;
  read?: boolean;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const tabs: Array<{ id: TabId; label: string; shortLabel: string; icon: typeof Home }> = [
  { id: "overview", label: "Dashboard", shortLabel: "Home", icon: Home },
  { id: "wishlist", label: "Wishlist", shortLabel: "Saved", icon: Bookmark },
  { id: "attending", label: "Events I’m going to", shortLabel: "Going", icon: Users },
  { id: "roadbooks", label: "Roadbooks", shortLabel: "Plans", icon: Route },
  { id: "alerts", label: "Event alerts", shortLabel: "Alerts", icon: BellRing },
  { id: "garage", label: "Garage & areas", shortLabel: "Garage", icon: CarFront },
  { id: "perks", label: "Member perks", shortLabel: "Perks", icon: Gift },
  { id: "account", label: "Account & billing", shortLabel: "Account", icon: Settings },
];

const fallbackEntitlements: Entitlements = {
  canSaveEvents: true,
  maxLocations: 1,
  canUseRoadbooks: false,
  canUseAlerts: false,
  canUseCalendarFeed: false,
  canUseAdvancedFilters: false,
  isAdFree: false,
  digestFrequencies: ["weekly"],
};

function csrfToken() {
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-cme_csrf="));
  return item ? decodeURIComponent(item.slice("__Host-cme_csrf=".length)) : "";
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = csrfToken();
    if (token) headers.set("X-CME-CSRF", token);
  }
  const response = await fetch(path, {
    ...init,
    headers,
  });
  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(response.status === 404 ? "This feature is not available yet." : "The service could not be reached. Please try again.");
  }
  if (!response.ok || !payload.ok || !payload.data) {
    const requestError = new ApiRequestError(
      payload.error?.message || "Something went off route. Please try again.",
      response.status,
      payload.error?.code || "REQUEST_FAILED",
    );
    if (requestError.code === "AUTH_REQUIRED") {
      window.location.assign("/sign-in?return_to=%2Faccount");
    } else if (
      requestError.code === "REAUTH_REQUIRED" ||
      requestError.code === "CSRF_CHECK_FAILED"
    ) {
      window.location.assign("/api/auth/reauth?return_to=%2Faccount");
    }
    throw requestError;
  }
  return payload.data;
}

function formatEventDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(parsed);
}

function formatShortDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function itemCount(roadbook: RoadbookItem) {
  return roadbook.eventCount ?? roadbook.events?.length ?? 0;
}

async function geocodeLocation(query: string) {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  const payload = await response.json() as { label?: string; latitude?: number; longitude?: number; error?: string };
  if (!response.ok || payload.latitude == null || payload.longitude == null) {
    throw new Error(payload.error || "We could not find that UK location.");
  }
  return { latitude: payload.latitude, longitude: payload.longitude };
}

export default function MemberPortal({
  initialName,
  initialEmail,
  billingAvailable,
  billingPortalAvailable,
}: {
  initialName: string;
  initialEmail: string;
  billingAvailable: boolean;
  billingPortalAvailable: boolean;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const [member, setMember] = useState<Member>({
    email: initialEmail,
    displayName: initialName,
    tier: "free",
    subscription: null,
    membershipSource: null,
    trialEligible: true,
    homeArea: null,
    digestFrequency: "weekly",
    calendarFeedUrl: null,
  });
  const [entitlements, setEntitlements] = useState<Entitlements>(fallbackEntitlements);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [roadbooks, setRoadbooks] = useState<RoadbookItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [preferredPlan, setPreferredPlan] = useState<"monthly" | "annual" | "founding">("annual");

  const isPaid = member.tier === "roadbook";
  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);

  const loadPortal = useCallback(async (showLoader = true): Promise<{
    complete: boolean;
    member: Member | null;
  }> => {
    if (showLoader) setLoading(true);
    try {
      const memberData = await apiRequest<{ member: Member; entitlements: Entitlements }>("/api/member");
      setMember(memberData.member);
      setEntitlements(memberData.entitlements);
      const [savedData, attendanceData, locationData, vehicleData, roadbookData, alertData, notificationData] = await Promise.allSettled([
        apiRequest<{ items: SavedItem[] }>("/api/member/saved"),
        apiRequest<{ items: AttendanceItem[] }>("/api/member/attendance"),
        apiRequest<{ items: LocationItem[] }>("/api/member/locations"),
        apiRequest<{ items: VehicleItem[] }>("/api/member/vehicles"),
        memberData.entitlements.canUseRoadbooks
          ? apiRequest<{ items: RoadbookItem[] }>("/api/member/roadbooks")
          : Promise.resolve({ items: [] as RoadbookItem[] }),
        memberData.entitlements.canUseAlerts
          ? apiRequest<{ items: AlertItem[] }>("/api/member/alerts")
          : Promise.resolve({ items: [] as AlertItem[] }),
        apiRequest<{ items: NotificationItem[] }>("/api/member/notifications"),
      ]);
      if (savedData.status === "fulfilled") setSaved(savedData.value.items);
      if (attendanceData.status === "fulfilled") setAttendance(attendanceData.value.items);
      if (locationData.status === "fulfilled") setLocations(locationData.value.items);
      if (vehicleData.status === "fulfilled") setVehicles(vehicleData.value.items);
      if (roadbookData.status === "fulfilled") setRoadbooks(roadbookData.value.items);
      if (alertData.status === "fulfilled") setAlerts(alertData.value.items);
      if (notificationData.status === "fulfilled") setNotifications(notificationData.value.items);
      const complete = [savedData, attendanceData, locationData, vehicleData, roadbookData, alertData, notificationData]
        .every((result) => result.status === "fulfilled");
      if (!complete) {
        setNotice({
          type: "error",
          text: "Your account is secure, but some planning data could not be loaded. Please refresh to try again.",
        });
      }
      return { complete, member: memberData.member };
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "We could not load your roadbook." });
      return { complete: false, member: null };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadPortal().then((loaded) => {
        if (!loaded.complete || !loaded.member) return;
        const params = new URLSearchParams(window.location.search);
        const plan = params.get("plan");
        const checkout = params.get("checkout");
        const requestedTab = params.get("tab");
        if (tabs.some((item) => item.id === requestedTab)) {
          setTab(requestedTab as TabId);
        }
        if (plan === "monthly" || plan === "annual" || plan === "founding") {
          setPreferredPlan(plan);
          setTab("account");
        }
        if (params.get("trial") === "1") setTab("account");
        if (
          params.get("trial") === "started" &&
          loaded.member.tier === "roadbook" &&
          loaded.member.membershipSource === "trial"
        ) {
          setNotice({ type: "success", text: "Your 14-day Roadbook trial is active. Enjoy the full planning toolkit." });
          setTab("overview");
        }
        if (checkout === "success" && loaded.member.membershipSource === "stripe") {
          setNotice({
            type: "success",
            text: loaded.member.tier === "roadbook"
              ? "Your Roadbook membership is active."
              : "Payment received. Your Roadbook membership is being confirmed.",
          });
          setTab("overview");
        }
      });
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadPortal]);

  const runAction = async (key: string, work: () => Promise<unknown>, success: string) => {
    setAction(key);
    setNotice(null);
    try {
      await work();
      const refreshed = await loadPortal(false);
      if (refreshed.complete) setNotice({ type: "success", text: success });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "That change could not be saved." });
    } finally {
      setAction(null);
    }
  };

  const removeSaved = (eventId: string) => runAction(
    `saved-${eventId}`,
    () => apiRequest(`/api/member/saved?eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" }),
    "Removed from your wishlist.",
  );

  const removeAttendance = (eventId: string) => runAction(
    `attendance-${eventId}`,
    () => apiRequest(`/api/member/attendance?eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" }),
    "You’re no longer marked as going.",
  );

  const createLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const label = String(data.get("label") || "").trim();
    const placeName = String(data.get("placeName") || "").trim();
    const radiusMiles = Number(data.get("radiusMiles") || 50);
    await runAction(
      "location-create",
      async () => {
        const coordinates = await geocodeLocation(placeName);
        return apiRequest("/api/member/locations", {
          method: "POST",
          body: JSON.stringify({ label, placeName, radiusMiles, isHome: locations.length === 0, ...coordinates }),
        });
      },
      `${label} added to your followed areas.`,
    );
    form.reset();
  };

  const createVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const make = String(data.get("make") || "").trim();
    const model = String(data.get("model") || "").trim();
    const yearText = String(data.get("year") || "").trim();
    await runAction(
      "vehicle-create",
      () => apiRequest("/api/member/vehicles", {
        method: "POST",
        body: JSON.stringify({ name: `${make} ${model}`, make, model, year: yearText ? Number(yearText) : undefined }),
      }),
      "Your garage has been updated.",
    );
    form.reset();
  };

  const createRoadbook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const description = String(data.get("description") || "").trim();
    const isShared = data.get("isShared") === "on";
    await runAction(
      "roadbook-create",
      () => apiRequest("/api/member/roadbooks", { method: "POST", body: JSON.stringify({ name, description, isShared }) }),
      "New roadbook ready for its first event.",
    );
    form.reset();
  };

  const addRoadbookEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const roadbookId = String(data.get("roadbookId") || "");
    const eventId = String(data.get("eventId") || "");
    const notes = String(data.get("notes") || "").trim();
    await runAction(
      "roadbook-event-add",
      () => apiRequest("/api/member/roadbooks/events", {
        method: "POST",
        body: JSON.stringify({ roadbookId, eventId, notes }),
      }),
      "Event added to your roadbook.",
    );
    form.reset();
  };

  const createAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      locationId: String(data.get("locationId") || "") || undefined,
      category: String(data.get("category") || "") || undefined,
      marque: String(data.get("marque") || "").trim() || undefined,
      radiusMiles: Number(data.get("radiusMiles") || 50),
      frequency: String(data.get("frequency") || "instant"),
    };
    await runAction(
      "alert-create",
      () => apiRequest("/api/member/alerts", { method: "POST", body: JSON.stringify(payload) }),
      "Event alert switched on.",
    );
    form.reset();
  };

  const updateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const displayName = String(data.get("displayName") || "").trim();
    await runAction(
      "profile-update",
      () => apiRequest("/api/member", { method: "PATCH", body: JSON.stringify({ displayName }) }),
      "Profile saved.",
    );
  };

  const startCheckout = async (plan: "monthly" | "annual" | "founding") => {
    if (!billingAvailable) {
      setNotice({
        type: "error",
        text: "Paid membership is not open yet. Your free account and trial remain available.",
      });
      return;
    }
    setAction(`checkout-${plan}`);
    setNotice(null);
    try {
      const result = await apiRequest<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      window.location.assign(result.url);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Checkout could not be started." });
      setAction(null);
    }
  };

  const openBillingPortal = async () => {
    setAction("billing-portal");
    setNotice(null);
    try {
      const result = await apiRequest<{ url: string }>("/api/billing/portal", { method: "POST" });
      window.location.assign(result.url);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "FRESH_AUTH_REQUIRED") {
        window.location.assign("/api/auth/reauth?return_to=%2Faccount%3Ftab%3Daccount");
        return;
      }
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Billing could not be opened." });
      setAction(null);
    }
  };

  const startTrial = async () => {
    setAction("start-trial");
    setNotice(null);
    try {
      await apiRequest("/api/member/trial", { method: "POST" });
      const refreshed = await loadPortal(false);
      if (
        refreshed.complete &&
        refreshed.member?.tier === "roadbook" &&
        refreshed.member.membershipSource === "trial"
      ) {
        setNotice({ type: "success", text: "Your 14-day Roadbook trial is active. Enjoy the full planning toolkit." });
        setTab("overview");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The trial could not be started.";
      setNotice({
        type: "error",
        text: message === "This feature is not available yet."
          ? "Trial activation is not open yet. You can still use Explorer free or choose a paid plan below."
          : message,
      });
    } finally {
      setAction(null);
    }
  };

  const rotateCalendar = () => runAction(
    "calendar-rotate",
    () => apiRequest("/api/member", {
      method: "PATCH",
      body: JSON.stringify({ rotateCalendarToken: true }),
    }),
    "A new private calendar link is ready. The previous link no longer works.",
  );

  const signOut = async () => {
    setAction("sign-out");
    setNotice(null);
    try {
      const result = await apiRequest<{ redirectTo: string }>("/api/auth/logout", {
        method: "POST",
      });
      window.location.assign(result.redirectTo);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Sign out could not be completed.",
      });
      setAction(null);
    }
  };

  const downloadAccountData = async () => {
    setAction("data-export");
    setNotice(null);
    try {
      const result = await apiRequest<{ export: unknown }>("/api/member/export", {
        method: "POST",
      });
      const blob = new Blob([JSON.stringify(result.export, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `classic-motoring-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice({ type: "success", text: "Your account-data export has been downloaded." });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "FRESH_AUTH_REQUIRED") {
        window.location.assign("/api/auth/reauth?return_to=%2Faccount%3Ftab%3Daccount");
        return;
      }
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Your data could not be exported.",
      });
    } finally {
      setAction(null);
    }
  };

  const revokeOtherSessions = () => runAction(
    "sessions-revoke",
    () => apiRequest("/api/member/sessions", { method: "DELETE" }),
    "Other signed-in sessions have been revoked.",
  );

  const deleteAccount = async () => {
    if (!window.confirm("Permanently delete this account, its Going responses, wishlist, roadbooks, alerts and garage? This cannot be undone.")) return;
    const confirmation = window.prompt("Type DELETE to confirm permanent account deletion.");
    if (confirmation !== "DELETE") return;
    setAction("account-delete");
    setNotice(null);
    try {
      const result = await apiRequest<{ redirectTo: string }>("/api/member/delete", {
        method: "POST",
        body: JSON.stringify({ confirmation }),
      });
      window.location.assign(result.redirectTo);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "FRESH_AUTH_REQUIRED") {
        window.location.assign("/api/auth/reauth?return_to=%2Faccount%3Ftab%3Daccount");
        return;
      }
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "The account could not be deleted.",
      });
      setAction(null);
    }
  };

  if (loading) {
    return (
      <main className={styles.loadingPage}>
        <div><Gauge size={35} /><LoaderCircle className={styles.spin} size={26} /></div>
        <h1>Opening your roadbook</h1>
        <p>Checking saved events and the latest plans…</p>
      </main>
    );
  }

  return (
    <main className={styles.portal}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="ClassicsGo home">
          <span><Gauge size={25} strokeWidth={1.7} /></span>
          <div><strong>ClassicsGo</strong><small>Member roadbook</small></div>
        </Link>
        <div className={styles.topbarActions}>
          <Link href="/">Find events</Link>
          <button className={styles.userLink} type="button" onClick={signOut} disabled={action === "sign-out"} aria-label={`Sign out ${member.displayName}`}>
            <CircleUserRound size={19} /><span>{member.displayName}</span><LogOut size={15} />
          </button>
        </div>
      </header>

      <div className={styles.portalGrid}>
        <aside className={styles.sidebar}>
          <div className={styles.memberStamp}>
            <span>{isPaid ? <Crown size={18} /> : <Bookmark size={18} />}</span>
            <div><small>{isPaid ? "Roadbook Member" : "Explorer account"}</small><strong>{member.displayName}</strong></div>
          </div>
          <nav aria-label="Member account">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={tab === item.id ? styles.activeNav : undefined}
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                >
                  <Icon size={18} /><span>{item.label}</span>
                  {item.id === "alerts" && unreadCount > 0 && <i>{unreadCount}</i>}
                  {(item.id === "roadbooks" || item.id === "alerts" || item.id === "perks") && !isPaid && <LockKeyhole size={12} />}
                </button>
              );
            })}
          </nav>
          {!isPaid && (
            <div className={styles.sidebarUpgrade}>
              <Sparkles size={18} />
              <strong>Build the full roadbook</strong>
              <p>Advanced alerts, planning tools and more areas from £2.99 monthly.</p>
              <button type="button" onClick={() => setTab("account")}>See membership</button>
            </div>
          )}
        </aside>

        <section className={styles.workspace}>
          {notice && (
            <div className={`${styles.notice} ${styles[notice.type]}`} role="status">
              {notice.type === "success" ? <Check size={18} /> : <BellRing size={18} />}
              <span>{notice.text}</span>
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
            </div>
          )}

          {tab === "overview" && (
            <OverviewPanel
              member={member}
              isPaid={isPaid}
              saved={saved}
              attendance={attendance}
              locations={locations}
              roadbooks={roadbooks}
              notifications={notifications}
              unreadCount={unreadCount}
              action={action}
              setTab={setTab}
              markAllRead={() => runAction(
                "notifications-read",
                () => apiRequest("/api/member/notifications", { method: "PATCH", body: JSON.stringify({ all: true, read: true }) }),
                "Notifications marked as read.",
              )}
            />
          )}

          {tab === "wishlist" && (
            <WishlistPanel saved={saved} action={action} removeSaved={removeSaved} />
          )}

          {tab === "attending" && (
            <AttendancePanel
              attendance={attendance}
              action={action}
              removeAttendance={removeAttendance}
            />
          )}

          {tab === "roadbooks" && (
            <RoadbooksPanel
              isPaid={isPaid}
              canUse={entitlements.canUseRoadbooks}
              roadbooks={roadbooks}
              saved={saved}
              action={action}
              setTab={setTab}
              createRoadbook={createRoadbook}
              addRoadbookEvent={addRoadbookEvent}
              removeRoadbook={(id) => {
                if (!window.confirm("Delete this roadbook and its route notes? This cannot be undone.")) return;
                void runAction(
                  `roadbook-${id}`,
                  () => apiRequest(`/api/member/roadbooks?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
                  "Roadbook removed.",
                );
              }}
              removeRoadbookEvent={(roadbookId, eventId) => runAction(
                `roadbook-event-${roadbookId}-${eventId}`,
                () => apiRequest(`/api/member/roadbooks/events?roadbookId=${encodeURIComponent(roadbookId)}&eventId=${encodeURIComponent(eventId)}`, { method: "DELETE" }),
                "Event removed from the roadbook.",
              )}
            />
          )}

          {tab === "alerts" && (
            <AlertsPanel
              member={member}
              canUse={entitlements.canUseAlerts}
              alerts={alerts}
              locations={locations}
              action={action}
              setTab={setTab}
              createAlert={createAlert}
              removeAlert={(id) => runAction(
                `alert-${id}`,
                () => apiRequest(`/api/member/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
                "Alert removed.",
              )}
            />
          )}

          {tab === "garage" && (
            <GaragePanel
              isPaid={isPaid}
              entitlements={entitlements}
              locations={locations}
              vehicles={vehicles}
              action={action}
              setTab={setTab}
              createLocation={createLocation}
              createVehicle={createVehicle}
              removeLocation={(id) => {
                if (!window.confirm("Remove this followed area? Any alert using it will be switched off.")) return;
                void runAction(
                  `location-${id}`,
                  () => apiRequest(`/api/member/locations?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
                  "Followed area removed.",
                );
              }}
              removeVehicle={(id) => runAction(
                `vehicle-${id}`,
                () => apiRequest(`/api/member/vehicles?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
                "Vehicle removed from your garage.",
              )}
            />
          )}

          {tab === "perks" && <PerksPanel isPaid={isPaid} setTab={setTab} />}

          {tab === "account" && (
            <AccountPanel
              member={member}
              billingAvailable={billingAvailable}
              billingPortalAvailable={billingPortalAvailable}
              action={action}
              preferredPlan={preferredPlan}
              setPreferredPlan={setPreferredPlan}
              updateProfile={updateProfile}
              startCheckout={startCheckout}
              startTrial={startTrial}
              openBillingPortal={openBillingPortal}
              rotateCalendar={rotateCalendar}
              downloadAccountData={downloadAccountData}
              revokeOtherSessions={revokeOtherSessions}
              deleteAccount={deleteAccount}
            />
          )}
        </section>
      </div>

      <nav className={styles.mobileTabs} aria-label="Member sections">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? styles.mobileActive : undefined}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              <Icon size={18} /><span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function PanelHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className={styles.panelHeading}>
      <div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>
      {action}
    </header>
  );
}

function OverviewPanel({
  member,
  isPaid,
  saved,
  attendance,
  locations,
  roadbooks,
  notifications,
  unreadCount,
  action,
  setTab,
  markAllRead,
}: {
  member: Member;
  isPaid: boolean;
  saved: SavedItem[];
  attendance: AttendanceItem[];
  locations: LocationItem[];
  roadbooks: RoadbookItem[];
  notifications: NotificationItem[];
  unreadCount: number;
  action: string | null;
  setTab: (tab: TabId) => void;
  markAllRead: () => void;
}) {
  const firstName = member.displayName.split(" ")[0] || member.displayName;
  const upcoming = attendance.length > 0 ? attendance : saved;
  const upcomingTab: TabId = attendance.length > 0 ? "attending" : "wishlist";
  return (
    <>
      <PanelHeading
        eyebrow="Your weekend roadbook"
        title={`Good to see you, ${firstName}`}
        description={isPaid ? "Your full planning toolkit is ready." : "Your free account keeps the important things together."}
        action={<Link className={styles.findEventsButton} href="/">Find an event <ArrowRight size={17} /></Link>}
      />

      {!isPaid && (
        <article className={styles.heroUpgrade}>
          <div className={styles.routeLine}><span>Saved</span><i /><span>Planned</span><i /><strong>On the road</strong></div>
          <div>
            <p>Roadbook membership</p>
            <h2>Turn a wishlist into a season of great days out.</h2>
            <span>Follow more areas, watch for the right events, build shared trips and keep everything in a live calendar.</span>
          </div>
          <button type="button" onClick={() => setTab("account")}>Explore member plans <ChevronRight size={17} /></button>
        </article>
      )}

      <div className={styles.statsGrid}>
        <button type="button" onClick={() => setTab("attending")}>
          <Users size={20} /><span><strong>{attendance.length}</strong><small>event{attendance.length === 1 ? "" : "s"} you’re going to</small></span><ChevronRight size={17} />
        </button>
        <button type="button" onClick={() => setTab("wishlist")}>
          <Bookmark size={20} /><span><strong>{saved.length}</strong><small>saved event{saved.length === 1 ? "" : "s"}</small></span><ChevronRight size={17} />
        </button>
        <button type="button" onClick={() => setTab("roadbooks")}>
          <Route size={20} /><span><strong>{roadbooks.length}</strong><small>active roadbook{roadbooks.length === 1 ? "" : "s"}</small></span><ChevronRight size={17} />
        </button>
        <button type="button" onClick={() => setTab("garage")}>
          <MapPinned size={20} /><span><strong>{locations.length}</strong><small>followed area{locations.length === 1 ? "" : "s"}</small></span><ChevronRight size={17} />
        </button>
      </div>

      <div className={styles.overviewGrid}>
        <section className={styles.panelCard}>
          <div className={styles.cardTitle}><div><p>Coming up</p><h2>{attendance.length > 0 ? "Events you’re going to" : "Your next saved events"}</h2></div><button type="button" onClick={() => setTab(upcomingTab)}>View all</button></div>
          {upcoming.length > 0 ? (
            <div className={styles.compactList}>
              {upcoming.slice(0, 3).map((item) => (
                <article key={item.eventId}>
                  <time dateTime={item.event.startDate}><strong>{formatEventDate(item.event.startDate).split(" ").slice(1).join(" ")}</strong><small>{formatEventDate(item.event.startDate).split(" ")[0]}</small></time>
                  <div><strong>{item.event.title}</strong><span>{item.event.venue} · {item.event.town}</span></div>
                  <ArrowRight size={16} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={Users} title="No weekends confirmed yet" text="Open an event and tap I’m going to add it here and contribute to its public total." link="/" linkLabel="Find your first event" />
          )}
        </section>

        <aside className={styles.panelCard}>
          <div className={styles.cardTitle}><div><p>Updates</p><h2>Roadbook notices</h2></div>{unreadCount > 0 && <button type="button" disabled={action === "notifications-read"} onClick={markAllRead}>Mark read</button>}</div>
          {notifications.length > 0 ? (
            <div className={styles.notificationList}>
              {notifications.slice(0, 4).map((notification) => (
                <article key={notification.id} className={!notification.read ? styles.unread : undefined}>
                  <span />
                  <div><strong>{notification.title}</strong>{notification.body && <p>{notification.body}</p>}<small>{formatShortDate(notification.createdAt)}</small></div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.quietState}><Check size={18} /><p>You are all caught up.</p></div>
          )}
        </aside>
      </div>
    </>
  );
}

function WishlistPanel({ saved, action, removeSaved }: { saved: SavedItem[]; action: string | null; removeSaved: (id: string) => void }) {
  return (
    <>
      <PanelHeading eyebrow="Your shortlist" title="Saved events" description="A synced wishlist that follows you between devices." action={<Link className={styles.findEventsButton} href="/">Add events <Plus size={16} /></Link>} />
      {saved.length > 0 ? (
        <div className={styles.savedGrid}>
          {saved.map((item) => (
            <article className={styles.savedCard} key={item.eventId}>
              <div className={styles.eventDate}><CalendarDays size={19} /><strong>{formatEventDate(item.event.startDate)}</strong>{item.event.startTime && <span>{item.event.startTime}</span>}</div>
              <p>{item.event.category || "Classic motoring"}</p>
              <h2>{item.event.title}</h2>
              <span>{item.event.venue}<br />{item.event.town}{item.event.postcode ? ` · ${item.event.postcode}` : ""}</span>
              <div className={styles.savedActions}>
                {item.event.officialUrl ? <a href={item.event.officialUrl} target="_blank" rel="noreferrer">Official page <ArrowRight size={15} /></a> : <Link href="/">View event</Link>}
                <button type="button" aria-label={`Remove ${item.event.title}`} disabled={action === `saved-${item.eventId}`} onClick={() => removeSaved(item.eventId)}>
                  {action === `saved-${item.eventId}` ? <LoaderCircle className={styles.spin} size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : <LargeEmptyState icon={Bookmark} title="Your wishlist is ready for its first event" text="Browse by location, date or event type. Tap Save on anything worth a closer look and it will appear here." link="/" linkLabel="Search local events" />}
    </>
  );
}

function AttendancePanel({
  attendance,
  action,
  removeAttendance,
}: {
  attendance: AttendanceItem[];
  action: string | null;
  removeAttendance: (id: string) => void;
}) {
  return (
    <>
      <PanelHeading
        eyebrow="Your confirmed weekends"
        title="Events I’m going to"
        description="Your response contributes once to each public event total. Other members never see your identity."
        action={<Link className={styles.findEventsButton} href="/">Find events <Plus size={16} /></Link>}
      />
      {attendance.length > 0 ? (
        <div className={styles.savedGrid}>
          {attendance.map((item) => (
            <article className={styles.savedCard} key={item.eventId}>
              <div className={styles.eventDate}>
                <CalendarDays size={19} />
                <strong>{formatEventDate(item.event.startDate)}</strong>
                {item.event.startTime && <span>{item.event.startTime}</span>}
              </div>
              <p>{item.event.category || "Classic motoring"}</p>
              <h2>{item.event.title}</h2>
              <span>{item.event.venue}<br />{item.event.town}{item.event.postcode ? ` · ${item.event.postcode}` : ""}</span>
              <div className={styles.attendanceCount}>
                <Users size={16} />
                <strong>{item.goingCount.toLocaleString("en-GB")}</strong>
                <span>going</span>
              </div>
              <div className={styles.savedActions}>
                {item.event.officialUrl ? <a href={item.event.officialUrl} target="_blank" rel="noreferrer">Official page <ArrowRight size={15} /></a> : <Link href="/">View event</Link>}
                <button
                  type="button"
                  aria-label={`Mark that you are no longer going to ${item.event.title}`}
                  disabled={action === `attendance-${item.eventId}`}
                  onClick={() => removeAttendance(item.eventId)}
                >
                  {action === `attendance-${item.eventId}` ? <LoaderCircle className={styles.spin} size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <LargeEmptyState
          icon={Users}
          title="No events confirmed yet"
          text="Tap I’m going on an event card. It will appear here and your response will be included in the public total."
          link="/"
          linkLabel="Find a local event"
        />
      )}
    </>
  );
}

function RoadbooksPanel({ isPaid, canUse, roadbooks, saved, action, setTab, createRoadbook, addRoadbookEvent, removeRoadbook, removeRoadbookEvent }: {
  isPaid: boolean;
  canUse: boolean;
  roadbooks: RoadbookItem[];
  saved: SavedItem[];
  action: string | null;
  setTab: (tab: TabId) => void;
  createRoadbook: (event: FormEvent<HTMLFormElement>) => void;
  addRoadbookEvent: (event: FormEvent<HTMLFormElement>) => void;
  removeRoadbook: (id: string) => void;
  removeRoadbookEvent: (roadbookId: string, eventId: string) => void;
}) {
  return (
    <>
      <PanelHeading eyebrow="Trip planning" title="Weekend roadbooks" description="Group events into proper plans, add notes and bring the convoy." />
      {!isPaid || !canUse ? (
        <LockedFeature
          icon={Route}
          title="Build more than a wishlist"
          text="Roadbook Members can create named plans, arrange saved events, add route notes and share the day with friends."
          details={["Unlimited named roadbooks", "Shareable plans for the convoy", "Route and mileage notes", `${saved.length} saved event${saved.length === 1 ? "" : "s"} ready to organise`]}
          onUpgrade={() => setTab("account")}
        />
      ) : (
        <div className={styles.toolGrid}>
          <section>
            {roadbooks.length > 0 ? <div className={styles.roadbookList}>{roadbooks.map((roadbook, index) => (
              <article key={roadbook.id}>
                <span className={styles.roadbookNumber}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p>{roadbook.isShared ? "Shared roadbook" : "Private roadbook"}</p><h2>{roadbook.name}</h2><span>{roadbook.description || "A fresh route waiting for its first note."}</span>
                  {roadbook.events && roadbook.events.length > 0 && <div className={styles.roadbookEvents}>{roadbook.events.map((entry) => (
                    <div key={entry.eventId}>
                      <CalendarDays size={14} /><span><strong>{entry.event.title}</strong><small>{formatEventDate(entry.event.startDate)}{entry.notes ? ` · ${entry.notes}` : ""}</small></span>
                      <button type="button" aria-label={`Remove ${entry.event.title} from ${roadbook.name}`} disabled={action === `roadbook-event-${roadbook.id}-${entry.eventId}`} onClick={() => removeRoadbookEvent(roadbook.id, entry.eventId)}><Trash2 size={13} /></button>
                    </div>
                  ))}</div>}
                  {roadbook.shareUrl && <Link className={styles.shareRoadbook} href={roadbook.shareUrl} target="_blank">Open shared view <ArrowRight size={13} /></Link>}
                </div>
                <div className={styles.roadbookMeta}><strong>{itemCount(roadbook)}</strong><small>events</small></div>
                <button type="button" aria-label={`Delete ${roadbook.name}`} disabled={action === `roadbook-${roadbook.id}`} onClick={() => removeRoadbook(roadbook.id)}><Trash2 size={15} /></button>
              </article>
            ))}</div> : <LargeEmptyState icon={Route} title="Make your first roadbook" text="Create a plan for a weekend, a marque or your whole 2026 season." />}
          </section>
          <div className={styles.toolRail}>
            <form className={styles.sideForm} onSubmit={createRoadbook}>
              <p>New plan</p><h2>Start a roadbook</h2>
              <label><span>Name</span><input name="name" required maxLength={80} placeholder="Summer weekends" /></label>
              <label><span>Notes</span><textarea name="description" maxLength={400} rows={4} placeholder="Shows, routes and people to invite…" /></label>
              <label className={styles.checkLabel}><input name="isShared" type="checkbox" /><span>Make this shareable</span></label>
              <button type="submit" disabled={action === "roadbook-create"}>{action === "roadbook-create" ? <LoaderCircle className={styles.spin} size={17} /> : <Plus size={17} />} Create roadbook</button>
            </form>
            {roadbooks.length > 0 && saved.length > 0 && <form className={styles.sideForm} onSubmit={addRoadbookEvent}>
              <p>Build the route</p><h2>Add a saved event</h2>
              <label><span>Roadbook</span><select name="roadbookId" required defaultValue=""><option value="" disabled>Choose a plan</option>{roadbooks.map((roadbook) => <option key={roadbook.id} value={roadbook.id}>{roadbook.name}</option>)}</select></label>
              <label><span>Saved event</span><select name="eventId" required defaultValue=""><option value="" disabled>Choose an event</option>{saved.map((item) => <option key={item.eventId} value={item.eventId}>{item.event.title}</option>)}</select></label>
              <label><span>Route note</span><textarea name="notes" maxLength={600} rows={3} placeholder="Meet at the services at 07:30…" /></label>
              <button type="submit" disabled={action === "roadbook-event-add"}>{action === "roadbook-event-add" ? <LoaderCircle className={styles.spin} size={17} /> : <Plus size={17} />} Add to plan</button>
            </form>}
          </div>
        </div>
      )}
    </>
  );
}

function AlertsPanel({ member, canUse, alerts, locations, action, setTab, createAlert, removeAlert }: {
  member: Member;
  canUse: boolean;
  alerts: AlertItem[];
  locations: LocationItem[];
  action: string | null;
  setTab: (tab: TabId) => void;
  createAlert: (event: FormEvent<HTMLFormElement>) => void;
  removeAlert: (id: string) => void;
}) {
  return (
    <>
      <PanelHeading eyebrow="Keep watch on the good ones" title="Event watchlists" description="Choose the places, event types and marques you want matched in your account." />
      <article className={styles.digestCard}>
        <span><Clock3 size={21} /></span><div><p>Included with Explorer</p><h2>Saved-event reminders</h2><small>{member.homeArea ? `${member.homeArea.name} · ${member.homeArea.radiusMiles} miles · refreshed when you open your roadbook` : "Save an event to see reminders as its date approaches."}</small></div><strong>In app</strong>
      </article>
      {!canUse ? (
        <LockedFeature
          icon={BellRing}
          title="Surface the listings that suit you"
          text="Roadbook watchlists can be precise—by area, event type, marque and distance—with new matches shown in your account."
          details={["Up to ten custom watchlists", "Multiple areas", "Marque and event-type matching", "In-account match history"]}
          onUpgrade={() => setTab("account")}
        />
      ) : (
        <div className={styles.toolGrid}>
          <section>
            {alerts.length > 0 ? <div className={styles.alertList}>{alerts.map((alert) => (
              <article key={alert.id}><span><BellRing size={18} /></span><div><h2>{alert.name}</h2><p>{[alert.category, alert.marque, alert.radiusMiles ? `${alert.radiusMiles} miles` : null].filter(Boolean).join(" · ") || "All matching events"}</p></div><strong>In app</strong><button type="button" aria-label={`Delete ${alert.name}`} disabled={action === `alert-${alert.id}`} onClick={() => removeAlert(alert.id)}><Trash2 size={15} /></button></article>
            ))}</div> : <LargeEmptyState icon={BellRing} title="No custom alerts yet" text="Create one for a favourite marque, event type or touring area." />}
          </section>
          <form className={styles.sideForm} onSubmit={createAlert}>
            <p>New alert</p><h2>Watch the listings</h2>
            <label><span>Alert name</span><input name="name" required maxLength={80} placeholder="Jaguar days near home" /></label>
            <label><span>Area</span><select name="locationId" defaultValue=""><option value="">Any followed area</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.label}</option>)}</select></label>
            <div className={styles.splitFields}>
              <label><span>Event type</span><select name="category" defaultValue=""><option value="">Any</option><option>Show</option><option>Meet</option><option>Run</option><option>Motorsport</option><option>Autojumble</option></select></label>
              <label><span>Radius</span><select name="radiusMiles" defaultValue="50"><option value="25">25 miles</option><option value="50">50 miles</option><option value="100">100 miles</option><option value="200">200 miles</option></select></label>
            </div>
            <label><span>Marque (optional)</span><input name="marque" maxLength={60} placeholder="Jaguar" /></label>
            <button type="submit" disabled={action === "alert-create"}>{action === "alert-create" ? <LoaderCircle className={styles.spin} size={17} /> : <Plus size={17} />} Create alert</button>
          </form>
        </div>
      )}
    </>
  );
}

function GaragePanel({ isPaid, entitlements, locations, vehicles, action, setTab, createLocation, createVehicle, removeLocation, removeVehicle }: {
  isPaid: boolean;
  entitlements: Entitlements;
  locations: LocationItem[];
  vehicles: VehicleItem[];
  action: string | null;
  setTab: (tab: TabId) => void;
  createLocation: (event: FormEvent<HTMLFormElement>) => void;
  createVehicle: (event: FormEvent<HTMLFormElement>) => void;
  removeLocation: (id: string) => void;
  removeVehicle: (id: string) => void;
}) {
  const locationLimitReached = locations.length >= entitlements.maxLocations;
  return (
    <>
      <PanelHeading eyebrow="Personalise discovery" title="Garage & followed areas" description="Tell the roadbook where you roam and which cars matter to you." />
      <div className={styles.garageSections}>
        <section className={styles.panelCard}>
          <div className={styles.cardTitle}><div><p>Map pins</p><h2>Your areas</h2></div><span>{locations.length} / {entitlements.maxLocations >= 99 ? "∞" : entitlements.maxLocations}</span></div>
          {locations.length > 0 && <div className={styles.areaList}>{locations.map((location) => (
            <article key={location.id}><span><MapPinned size={18} /></span><div><strong>{location.label}</strong><small>{location.placeName || location.label} · {location.radiusMiles} miles{location.isHome ? " · Home" : ""}</small></div><button type="button" aria-label={`Remove ${location.label}`} disabled={action === `location-${location.id}`} onClick={() => removeLocation(location.id)}><Trash2 size={15} /></button></article>
          ))}</div>}
          {!locationLimitReached ? (
            <form className={styles.inlineForm} onSubmit={createLocation}>
              <label><span>Label</span><input name="label" required maxLength={60} placeholder="Home" /></label>
              <label><span>Town, city or postcode</span><input name="placeName" required maxLength={120} placeholder="Enter a UK or European location" /></label>
              <label><span>Radius</span><select name="radiusMiles" defaultValue="50"><option value="25">25 miles</option><option value="50">50 miles</option><option value="100">100 miles</option><option value="200">200 miles</option></select></label>
              <button type="submit" disabled={action === "location-create"}>{action === "location-create" ? <LoaderCircle className={styles.spin} size={16} /> : <Plus size={16} />} Add</button>
            </form>
          ) : !isPaid && (
            <button className={styles.inlineLock} type="button" onClick={() => setTab("account")}><LockKeyhole size={16} /> Follow more than one area with Roadbook membership <ArrowRight size={15} /></button>
          )}
        </section>

        <section className={styles.panelCard}>
          <div className={styles.cardTitle}><div><p>Virtual garage</p><h2>Cars & interests</h2></div>{!entitlements.canUseAdvancedFilters && <LockKeyhole size={17} />}</div>
          {vehicles.length > 0 && <div className={styles.vehicleList}>{vehicles.map((vehicle) => (
            <article key={vehicle.id}><span><CarFront size={20} /></span><div><strong>{vehicle.name || `${vehicle.make} ${vehicle.model}`}</strong><small>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" · ")}</small></div><button type="button" aria-label={`Remove ${vehicle.name}`} disabled={action === `vehicle-${vehicle.id}`} onClick={() => removeVehicle(vehicle.id)}><Trash2 size={15} /></button></article>
          ))}</div>}
          {entitlements.canUseAdvancedFilters ? (
            <form className={styles.inlineForm} onSubmit={createVehicle}>
              <label><span>Make</span><input name="make" required maxLength={60} placeholder="Jaguar" /></label>
              <label><span>Model</span><input name="model" required maxLength={60} placeholder="E-Type" /></label>
              <label><span>Year</span><input name="year" type="number" min="1885" max="2026" placeholder="1964" /></label>
              <button type="submit" disabled={action === "vehicle-create"}>{action === "vehicle-create" ? <LoaderCircle className={styles.spin} size={16} /> : <Plus size={16} />} Add</button>
            </form>
          ) : (
            <div className={styles.garageLock}><p>Add cars and favourite marques for sharper recommendations.</p><button type="button" onClick={() => setTab("account")}>Unlock garage</button></div>
          )}
        </section>
      </div>
    </>
  );
}

function PerksPanel({ isPaid, setTab }: { isPaid: boolean; setTab: (tab: TabId) => void }) {
  return (
    <>
      <PanelHeading eyebrow="The members' paddock" title="Benefits & opportunities" description="Practical tools now, with genuine partner benefits added as they become available." />
      {!isPaid && (
        <div className={styles.perksIntro}><Crown size={23} /><div><strong>Roadbook Member benefits</strong><p>Upgrade to use the full planning toolkit. Rolling-out benefits are clearly marked.</p></div><button type="button" onClick={() => setTab("account")}>See plans</button></div>
      )}
      <div className={styles.perksGrid}>
        {roadbookPerks.map((perk) => {
          const Icon = perk.icon;
          return (
            <article key={perk.title} className={!isPaid ? styles.perkLocked : undefined}>
              <div><Icon size={23} />{!isPaid && <LockKeyhole size={13} />}</div>
              <span className={perk.availability === "now" ? styles.available : styles.rolling}>{perk.availability === "now" ? "Available now" : "Rolling out"}</span>
              <h2>{perk.title}</h2><p>{perk.description}</p>
            </article>
          );
        })}
      </div>
      <p className={styles.perksNote}>No partner discounts or exclusive meets are advertised until they are confirmed. When they launch, the offer terms and expiry date will appear here.</p>
    </>
  );
}

function AccountPanel({ member, billingAvailable, billingPortalAvailable, action, preferredPlan, setPreferredPlan, updateProfile, startCheckout, startTrial, openBillingPortal, rotateCalendar, downloadAccountData, revokeOtherSessions, deleteAccount }: {
  member: Member;
  billingAvailable: boolean;
  billingPortalAvailable: boolean;
  action: string | null;
  preferredPlan: "monthly" | "annual" | "founding";
  setPreferredPlan: (plan: "monthly" | "annual" | "founding") => void;
  updateProfile: (event: FormEvent<HTMLFormElement>) => void;
  startCheckout: (plan: "monthly" | "annual" | "founding") => void;
  startTrial: () => void;
  openBillingPortal: () => void;
  rotateCalendar: () => void;
  downloadAccountData: () => void;
  revokeOtherSessions: () => void;
  deleteAccount: () => void;
}) {
  const isPaid = member.tier === "roadbook";
  const isAppTrial = isPaid && member.membershipSource === "trial";
  const isStripeMember = isPaid && member.membershipSource === "stripe";
  const isConfirming = !isPaid && member.membershipSource === "stripe" && member.subscription?.status === "pending";
  const isPastDue = isStripeMember && member.subscription?.status === "past_due";
  const endedBillingStatuses = new Set(["canceled", "cancelled", "expired", "incomplete_expired"]);
  const deletionBlocked = Boolean(
    member.membershipSource === "stripe" &&
    (!member.subscription?.status || !endedBillingStatuses.has(member.subscription.status)),
  );
  const prices = [membershipPrices.founding, membershipPrices.annual, membershipPrices.monthly];
  const renewalCopy = preferredPlan === "founding"
    ? "£19.99 is charged for the first year, then membership renews at £24.99 yearly."
    : preferredPlan === "annual"
      ? "£24.99 is charged now, then membership renews yearly at the price shown at checkout."
      : "£2.99 is charged now, then membership renews monthly at the price shown at checkout.";
  return (
    <>
      <PanelHeading eyebrow="Preferences" title="Account & billing" description="Manage your details and Roadbook membership." />
      <div className={styles.accountGrid}>
        <form className={styles.accountCard} onSubmit={updateProfile}>
          <div className={styles.cardTitle}><div><p>Your account</p><h2>Profile</h2></div><CircleUserRound size={22} /></div>
          <label><span>Display name</span><input name="displayName" defaultValue={member.displayName} required maxLength={100} autoComplete="name" /></label>
          <label><span>Email address</span><input value={member.email} disabled readOnly /><small>Verified by your secure sign-in provider.</small></label>
          <p className={styles.billingIntro}>Saved-event reminders and custom watchlist matches appear in your account when you open your roadbook.</p>
          <button type="submit" disabled={action === "profile-update"}>{action === "profile-update" ? <LoaderCircle className={styles.spin} size={17} /> : <Check size={17} />} Save profile</button>
        </form>

        <section className={`${styles.accountCard} ${styles.billingCard}`}>
          <div className={styles.cardTitle}><div><p>Membership</p><h2>{isConfirming ? "Confirming membership" : isAppTrial ? "Roadbook trial" : isPaid ? "Roadbook Member" : "Explorer · Free"}</h2></div>{isPaid || isConfirming ? <Crown size={22} /> : <Bookmark size={22} />}</div>
          {(isPaid || isConfirming) && (
            <>
              <div className={`${styles.membershipStatus} ${isPastDue ? styles.membershipWarning : ""}`}>
                <span>{isConfirming ? <LoaderCircle className={styles.spin} size={16} /> : isPastDue ? <BellRing size={16} /> : <Check size={16} />}</span>
                <div>
                  <strong>{isConfirming ? "Payment received—waiting for Stripe" : isPastDue ? "Payment needs attention" : isAppTrial ? "Trial active" : "Membership active"}</strong>
                  <small>{isConfirming ? "This normally takes a few moments. Paid tools unlock after confirmation." : member.subscription?.expiresAt ? `${isAppTrial ? "Trial ends" : isPastDue ? "Retry window based on period ending" : "Current period ends"} ${formatShortDate(member.subscription.expiresAt)}` : "Your full member toolkit is unlocked."}</small>
                </div>
              </div>
              {isPaid && <ul className={styles.entitlementList}><li><Check size={15} /> Custom watchlists and multiple areas</li><li><Check size={15} /> Live calendar and shared roadbooks</li><li><Check size={15} /> Advertising-free browsing</li></ul>}
              {isPaid && member.calendarFeedUrl && (
                <div className={styles.calendarControls}>
                  <a className={styles.calendarLink} href={member.calendarFeedUrl}><CalendarSync size={17} /> Open live calendar feed</a>
                  <button className={styles.outlineButton} type="button" disabled={action === "calendar-rotate"} onClick={rotateCalendar}>{action === "calendar-rotate" ? <LoaderCircle className={styles.spin} size={16} /> : <CalendarSync size={16} />} Replace private link</button>
                </div>
              )}
            </>
          )}

          {isConfirming ? (
            <p className={styles.billingIntro}>Refresh the account shortly if confirmation does not appear automatically. You cannot start another checkout while this payment is pending.</p>
          ) : isStripeMember ? (
            billingPortalAvailable ? (
              <button className={styles.outlineButton} type="button" disabled={action === "billing-portal"} onClick={openBillingPortal}>{action === "billing-portal" ? <LoaderCircle className={styles.spin} size={17} /> : <Settings size={17} />} {isPastDue ? "Update payment details" : "Manage billing"}</button>
            ) : (
              <p className={styles.billingIntro}>Billing controls are temporarily unavailable. No new payment can be started.</p>
            )
          ) : (
            <>
              <p className={styles.billingIntro}>{billingAvailable ? (isAppTrial ? "Choose a plan whenever you are ready. Your no-card trial will not renew or charge you automatically." : "Choose a simple plan. The annual option is best value, while founding members get an early-supporter first year.") : "Paid membership is opening soon. Your free account and no-card trial remain available in the meantime."}</p>
              {!isPaid && member.trialEligible && (
              <div className={styles.trialOffer}>
                <span><Sparkles size={18} /></span>
                <div><strong>Try Roadbook free for 14 days</strong><small>Explore alerts, roadbooks and multiple areas before choosing a plan.</small></div>
                <button type="button" disabled={action === "start-trial"} onClick={startTrial}>{action === "start-trial" ? <LoaderCircle className={styles.spin} size={16} /> : "Start trial"}</button>
              </div>
              )}
              {!isPaid && !member.trialEligible && <p className={styles.billingIntro}>Your free trial has already been used. Explorer remains free{billingAvailable ? ", or you can start a paid plan below." : "."}</p>}
              {billingAvailable && (
                <>
                  <div className={styles.priceChoices}>
                    {prices.map((price) => (
                      <button key={price.plan} type="button" className={preferredPlan === price.plan ? styles.priceSelected : undefined} onClick={() => setPreferredPlan(price.plan)}>
                        <span>{price.plan === "founding" ? "Founding" : price.plan === "annual" ? "Annual" : "Monthly"}</span><strong>{price.amount}</strong><small>{price.cadence}</small>{price.plan === "annual" && <i>Save 30%</i>}
                      </button>
                    ))}
                  </div>
                  <button className={styles.checkoutButton} type="button" disabled={action?.startsWith("checkout-")} onClick={() => startCheckout(preferredPlan)}>
                    {action?.startsWith("checkout-") ? <LoaderCircle className={styles.spin} size={18} /> : <Crown size={18} />} Continue securely <ArrowRight size={17} />
                  </button>
                  <small className={styles.renewalNote}>{renewalCopy} Checkout starts the paid plan now; cancel any time through billing. By continuing you agree to the <Link href="/terms">membership terms</Link>.</small>
                </>
              )}
            </>
          )}
        </section>

        <section className={`${styles.accountCard} ${styles.securityCard}`}>
          <div className={styles.cardTitle}><div><p>Security & privacy</p><h2>Your data and devices</h2></div><LockKeyhole size={22} /></div>
          <p className={styles.billingIntro}>Download a portable copy of your account, or revoke every signed-in browser except this one.</p>
          <div className={styles.securityActions}>
            <button className={styles.outlineButton} type="button" disabled={action === "data-export"} onClick={downloadAccountData}>
              {action === "data-export" ? <LoaderCircle className={styles.spin} size={17} /> : <Download size={17} />} Download my data
            </button>
            <button className={styles.outlineButton} type="button" disabled={action === "sessions-revoke"} onClick={revokeOtherSessions}>
              {action === "sessions-revoke" ? <LoaderCircle className={styles.spin} size={17} /> : <LogOut size={17} />} Sign out other devices
            </button>
            <button className={styles.dangerButton} type="button" disabled={action === "account-delete" || deletionBlocked} onClick={deleteAccount}>
              {action === "account-delete" ? <LoaderCircle className={styles.spin} size={17} /> : <Trash2 size={17} />} Delete account
            </button>
          </div>
          <small className={styles.securityNote}>
            {deletionBlocked
              ? <>Cancel active billing first. If you need help, use the <Link href="/privacy-request">privacy-request form</Link>.</>
              : "Deletion permanently removes your member profile and planning data. Provider cleanup is queued safely if it cannot finish immediately. A recent sign-in is required."}
          </small>
        </section>
      </div>
      <div className={styles.accountFooter}><ShieldLine /><p>Payments are handled securely. ClassicsGo does not store your card details.</p><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/membership">Compare tiers</Link></div>
    </>
  );
}

function ShieldLine() {
  return <span className={styles.shieldMark}><LockKeyhole size={15} /></span>;
}

function LockedFeature({ icon: Icon, title, text, details, onUpgrade }: { icon: typeof Route; title: string; text: string; details: string[]; onUpgrade: () => void }) {
  return (
    <section className={styles.lockedFeature}>
      <div className={styles.lockIllustration}><Icon size={40} /><span><LockKeyhole size={18} /></span></div>
      <div><p>Roadbook Member feature</p><h2>{title}</h2><span>{text}</span><ul>{details.map((detail) => <li key={detail}><Check size={15} />{detail}</li>)}</ul><button type="button" onClick={onUpgrade}>Unlock with membership <ArrowRight size={16} /></button></div>
    </section>
  );
}

function EmptyState({ icon: Icon, title, text, link, linkLabel }: { icon: typeof Bookmark; title: string; text: string; link: string; linkLabel: string }) {
  return <div className={styles.emptyState}><Icon size={22} /><div><strong>{title}</strong><p>{text}</p><Link href={link}>{linkLabel} <ArrowRight size={14} /></Link></div></div>;
}

function LargeEmptyState({ icon: Icon, title, text, link, linkLabel }: { icon: typeof Bookmark; title: string; text: string; link?: string; linkLabel?: string }) {
  return <div className={styles.largeEmpty}><span><Icon size={27} /></span><h2>{title}</h2><p>{text}</p>{link && linkLabel && <Link href={link}>{linkLabel} <ArrowRight size={15} /></Link>}</div>;
}

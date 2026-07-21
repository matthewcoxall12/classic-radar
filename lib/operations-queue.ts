export const queueStatuses = {
  event: ["pending", "reviewing", "approved", "rejected"],
  partner: ["new", "contacted", "qualified", "closed"],
  privacy: ["new", "verifying", "in_progress", "completed", "refused"],
  discovery: ["pending", "reviewing", "approved", "rejected", "published"],
} as const;

export type QueueKind = keyof typeof queueStatuses;

export type AdminQueueField = {
  label: string;
  value: string;
  url?: string;
};

export type AdminQueueItem = {
  kind: QueueKind;
  id: string;
  reference: string;
  title: string;
  subtitle: string;
  contactName: string;
  email: string;
  status: string;
  internalNotes: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  fields: AdminQueueField[];
  reviewRequired?: boolean;
  publication?: {
    ready: boolean;
    missing: string[];
    eventId?: string;
  };
  editableCandidate?: {
    title: string;
    description: string;
    organiserName: string;
    venue: string;
    town: string;
    postcode: string;
    countryCode: string;
    adminArea: string;
    timezone: string;
    startDate: string;
    endDate: string | null;
    startTime: string | null;
    category: string;
    officialUrl: string;
    price: string;
    latitude: number | null;
    longitude: number | null;
  };
  sourceReview?: {
    id: string;
    updatedAt: string;
    status: "pending" | "active" | "paused" | "revoked";
    trustLevel: "unverified" | "organizer" | "partner" | "official";
  };
};

const referencePrefixes: Record<QueueKind, string> = {
  event: "EVT",
  partner: "PAR",
  privacy: "PRV",
  discovery: "DSC",
};

export function isQueueKind(value: unknown): value is QueueKind {
  return typeof value === "string" && value in queueStatuses;
}

export function isQueueStatus(kind: QueueKind, value: unknown): value is string {
  return (
    typeof value === "string" &&
    (queueStatuses[kind] as readonly string[]).includes(value)
  );
}

export function shortReference(kind: QueueKind, id: string) {
  // A display/reference label only; API access always uses the authenticated
  // queue endpoint and the full database ID.
  return `${referencePrefixes[kind]}-${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toUpperCase()}`;
}

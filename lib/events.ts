export type EventCategory =
  | "Show"
  | "Meet"
  | "Autojumble"
  | "Motorsport"
  | "Run"
  | "Other";

export type MotoringEvent = {
  id: string;
  title: string;
  description: string;
  venue: string;
  town: string;
  postcode: string;
  countryCode: string;
  adminArea?: string;
  timezone?: string;
  startDate: string;
  endDate?: string;
  startTime: string;
  category: EventCategory;
  latitude: number;
  longitude: number;
  officialUrl: string;
  officialLabel: "Official website" | "Official event page";
  price: string;
  image: string;
  featured?: boolean;
  goingCount?: number;
  sourceUrl?: string;
  sourceLastCheckedAt?: string;
  sourceVerification?:
    | "curated"
    | "source_checked"
    | "organizer_verified"
    | "partner_verified";
};

export const EVENT_CATEGORIES: readonly EventCategory[] = [
  "Show",
  "Meet",
  "Autojumble",
  "Motorsport",
  "Run",
  "Other",
];

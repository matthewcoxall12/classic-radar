import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  CalendarSync,
  CarFront,
  MapPinned,
  Route,
  Sparkles,
  Tag,
  UsersRound,
} from "lucide-react";

export type MembershipTier = "visitor" | "free" | "roadbook";

export type MemberPerk = {
  title: string;
  description: string;
  icon: LucideIcon;
  availability: "now" | "rolling-out";
};

export const roadbookPerks: MemberPerk[] = [
  {
    title: "Custom event watchlists",
    description: "See matching events and useful saved-event reminders in your member account.",
    icon: BellRing,
    availability: "now",
  },
  {
    title: "Live calendar feed",
    description: "Keep your chosen events in the calendar you already use, with dates kept in sync.",
    icon: CalendarSync,
    availability: "now",
  },
  {
    title: "Weekend roadbooks",
    description: "Group events into named plans, add route notes and share the day with your convoy.",
    icon: Route,
    availability: "now",
  },
  {
    title: "Multiple home areas",
    description: "Follow events near home, the workshop, family or a favourite touring destination.",
    icon: MapPinned,
    availability: "now",
  },
  {
    title: "Your virtual garage",
    description: "Add the cars and marques you care about for more useful event recommendations.",
    icon: CarFront,
    availability: "now",
  },
  {
    title: "A quieter experience",
    description: "Browse without standard advertising while your Roadbook membership is active.",
    icon: Sparkles,
    availability: "now",
  },
  {
    title: "Partner offers",
    description: "Relevant member offers from carefully selected motoring businesses as partnerships launch.",
    icon: Tag,
    availability: "rolling-out",
  },
  {
    title: "Member meets",
    description: "Invitations and member-only opportunities will appear here as the community grows.",
    icon: UsersRound,
    availability: "rolling-out",
  },
];

export const tierFeatures = [
  { label: "Search local events and open official listings", visitor: true, free: true, roadbook: true },
  { label: "Basic date and event-type filters", visitor: true, free: true, roadbook: true },
  { label: "Synced event wishlist", visitor: false, free: true, roadbook: true },
  { label: "Upcoming saved-event reminders in your account", visitor: false, free: true, roadbook: true },
  { label: "One-click calendar downloads", visitor: true, free: true, roadbook: true },
  { label: "Multiple followed areas", visitor: false, free: false, roadbook: true },
  { label: "Custom event watchlists and in-account matches", visitor: false, free: false, roadbook: true },
  { label: "Live calendar subscription", visitor: false, free: false, roadbook: true },
  { label: "Named and shared roadbooks", visitor: false, free: false, roadbook: true },
  { label: "Garage-based recommendations", visitor: false, free: false, roadbook: true },
  { label: "Advertising-free browsing", visitor: false, free: false, roadbook: true },
] satisfies Array<{ label: string; visitor: boolean; free: boolean; roadbook: boolean }>;

export const membershipPrices = {
  monthly: { amount: "£2.99", cadence: "per month", plan: "monthly" },
  annual: { amount: "£24.99", cadence: "per year", plan: "annual" },
  founding: { amount: "£19.99", cadence: "first year", plan: "founding" },
} as const;

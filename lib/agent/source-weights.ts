export type SourceClassification = {
  sourceType:
    | "official_organiser"
    | "venue_or_museum"
    | "classic_event_calendar"
    | "ticketing_platform"
    | "club_site"
    | "forum"
    | "facebook"
    | "social"
    | "council_or_whats_on"
    | "search_result"
    | "unknown";
  baseWeight: number;
  reason: string;
};

const weights = {
  official_organiser: 100,
  venue_or_museum: 90,
  classic_event_calendar: 85,
  club_site: 80,
  ticketing_platform: 75,
  council_or_whats_on: 70,
  forum: 55,
  facebook: 50,
  social: 45,
  search_result: 35,
  unknown: 25
} as const;

const knownDomains: Record<string, SourceClassification["sourceType"]> = {
  "classicandsportscar.com": "classic_event_calendar",
  "classicshowsuk.co.uk": "classic_event_calendar",
  "theclassicvaluer.com": "classic_event_calendar",
  "carevents.com": "classic_event_calendar",
  "retrorides.org": "forum",
  "retro-rides.org": "forum",
  "retroridesevents.com": "classic_event_calendar",
  "pistonheads.com": "forum",
  "eventbrite.co.uk": "ticketing_platform",
  "ticketsource.co.uk": "ticketing_platform",
  "tickettailor.com": "ticketing_platform",
  "meetup.com": "social",
  "facebook.com": "facebook",
  "instagram.com": "social",
  "reddit.com": "forum",
  "beaulieu.co.uk": "venue_or_museum",
  "brooklandsmuseum.com": "venue_or_museum",
  "britishmotormuseum.co.uk": "venue_or_museum",
  "haynesmuseum.org": "venue_or_museum",
  "caffeineandmachine.com": "venue_or_museum",
  "ace-cafe-london.com": "venue_or_museum",
  "bicesterheritage.co.uk": "venue_or_museum",
  "goodwood.com": "venue_or_museum",
  "austina30a35ownersclub.co.uk": "club_site",
  "mgcc.co.uk": "club_site",
  "jaguarenthusiasts.co.uk": "club_site",
  "vscc.co.uk": "club_site",
  "miniownersclub.co.uk": "club_site"
};

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function includesDomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function classifySource(url: string): SourceClassification {
  const hostname = domainFromUrl(url);
  const known = Object.entries(knownDomains).find(([domain]) => includesDomain(hostname, domain));
  if (known) {
    const sourceType = known[1];
    return { sourceType, baseWeight: weights[sourceType], reason: `Matched known source domain ${known[0]}.` };
  }

  if (/museum|heritage|goodwood|beaulieu|brooklands|haynes/.test(hostname)) {
    return { sourceType: "venue_or_museum", baseWeight: weights.venue_or_museum, reason: "Domain looks like a venue or museum." };
  }
  if (/club|owners|register|society/.test(hostname)) {
    return { sourceType: "club_site", baseWeight: weights.club_site, reason: "Domain looks like a club or owners site." };
  }
  if (/whats-on|whatson|council|visit/.test(hostname)) {
    return { sourceType: "council_or_whats_on", baseWeight: weights.council_or_whats_on, reason: "Domain looks like a council, tourism or what’s-on listing." };
  }
  if (!hostname) return { sourceType: "search_result", baseWeight: weights.search_result, reason: "Search result without a clear source domain." };
  return { sourceType: "unknown", baseWeight: weights.unknown, reason: "No source registry or known domain match." };
}

export function getSourceWeight(url: string) {
  return classifySource(url).baseWeight;
}

export function scoreSourceTrust(url: string, sourceTitle?: string) {
  const classification = classifySource(url);
  let score = classification.baseWeight;
  if (sourceTitle && /official|organiser|museum|heritage|club|tickets|booking/i.test(sourceTitle)) score += 5;
  if (classification.sourceType === "facebook" && sourceTitle && /event|show|meet|autojumble/i.test(sourceTitle)) score += 5;
  return Math.max(0, Math.min(100, score));
}

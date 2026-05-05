export type AgentRunType = "morning_broad" | "midday_near_term" | "evening_social" | "manual_deep";

export type SearchQuery = {
  query: string;
  priority: number;
  category: string;
  region?: string;
  county?: string;
  eventType?: string;
  sourceHint?: string;
  timeWindow?: "this_weekend" | "next_7_days" | "next_14_days" | "next_30_days" | "seasonal" | "any";
};

export type SearchPlan = {
  runType: AgentRunType;
  queries: SearchQuery[];
  maxResultsPerQuery: number;
  notes: string[];
};

const eventTerms = [
  "classic car show",
  "classic car events",
  "classic vehicle show",
  "vintage car show",
  "heritage vehicle show",
  "classic car meet",
  "car meet",
  "cars and coffee",
  "breakfast car meet",
  "autojumble",
  "classic autojumble",
  "vintage rally",
  "classic vehicle rally",
  "road run",
  "club meet",
  "motor museum event",
  "classic car open day",
  "vehicle gathering"
];

const regions = [
  "UK",
  "England",
  "Scotland",
  "Wales",
  "Northern Ireland",
  "South East",
  "South West",
  "East Anglia",
  "Midlands",
  "North West",
  "North East",
  "Yorkshire",
  "London",
  "Isle of Wight"
];

const counties = [
  "Bedfordshire",
  "Berkshire",
  "Bristol",
  "Buckinghamshire",
  "Cambridgeshire",
  "Cheshire",
  "Cornwall",
  "Cumbria",
  "Derbyshire",
  "Devon",
  "Dorset",
  "Durham",
  "East Sussex",
  "Essex",
  "Gloucestershire",
  "Greater London",
  "Greater Manchester",
  "Hampshire",
  "Herefordshire",
  "Hertfordshire",
  "Isle of Wight",
  "Kent",
  "Lancashire",
  "Leicestershire",
  "Lincolnshire",
  "Merseyside",
  "Norfolk",
  "Northamptonshire",
  "Northumberland",
  "Nottinghamshire",
  "Oxfordshire",
  "Rutland",
  "Shropshire",
  "Somerset",
  "Staffordshire",
  "Suffolk",
  "Surrey",
  "Tyne and Wear",
  "Warwickshire",
  "West Midlands",
  "West Sussex",
  "Wiltshire",
  "Worcestershire",
  "Yorkshire",
  "Anglesey",
  "Cardiff",
  "Carmarthenshire",
  "Ceredigion",
  "Conwy",
  "Denbighshire",
  "Flintshire",
  "Gwynedd",
  "Monmouthshire",
  "Pembrokeshire",
  "Powys",
  "Swansea",
  "Wrexham",
  "Aberdeenshire",
  "Angus",
  "Argyll and Bute",
  "Ayrshire",
  "Dumfries and Galloway",
  "Dundee",
  "Edinburgh",
  "Fife",
  "Glasgow",
  "Highland",
  "Lanarkshire",
  "Lothian",
  "Moray",
  "Perth and Kinross",
  "Scottish Borders",
  "Stirling",
  "Antrim",
  "Armagh",
  "Down",
  "Fermanagh",
  "Londonderry",
  "Tyrone"
];

const timePhrases = [
  { phrase: "2026", timeWindow: "any" as const, boost: 1 },
  { phrase: "this weekend", timeWindow: "this_weekend" as const, boost: 12 },
  { phrase: "next weekend", timeWindow: "next_14_days" as const, boost: 10 },
  { phrase: "upcoming", timeWindow: "next_30_days" as const, boost: 6 },
  { phrase: "summer 2026", timeWindow: "seasonal" as const, boost: 3 },
  { phrase: "May 2026", timeWindow: "seasonal" as const, boost: 2 },
  { phrase: "June 2026", timeWindow: "seasonal" as const, boost: 2 },
  { phrase: "July 2026", timeWindow: "seasonal" as const, boost: 2 },
  { phrase: "August 2026", timeWindow: "seasonal" as const, boost: 2 },
  { phrase: "September 2026", timeWindow: "seasonal" as const, boost: 2 }
];

const sourceTargets = [
  "site:facebook.com/events classic car show UK",
  "site:facebook.com classic car meet UK",
  "site:facebook.com autojumble UK",
  "site:eventbrite.co.uk classic car show",
  "site:ticketsource.co.uk classic car show",
  "site:tickettailor.com classic car show",
  "site:classicandsportscar.com/calendar classic car",
  "site:classicshowsuk.co.uk classic car show",
  "site:retro-rides.org classic car event",
  "site:retroridesevents.com classic car",
  "site:brooklandsmuseum.com classic car event",
  "site:beaulieu.co.uk classic car event",
  "site:britishmotormuseum.co.uk classic car event",
  "site:haynesmuseum.org classic car event",
  "site:goodwood.com classic car event",
  "site:bicesterheritage.co.uk classic car event"
];

export function getCounties() {
  return [...counties];
}

export function getRegions() {
  return [...regions];
}

export function getEventTypes() {
  return [...eventTerms];
}

export function getSourceTargetQueries(): SearchQuery[] {
  return sourceTargets.map((query, index) => ({
    query,
    priority: 100 - index,
    category: "source_target",
    sourceHint: query.match(/site:([^\s]+)/)?.[1],
    timeWindow: "any"
  }));
}

export function generateQueries(options: {
  includeRegions?: boolean;
  includeCounties?: boolean;
  includeSources?: boolean;
  eventTerms?: string[];
  timeWindows?: typeof timePhrases;
  social?: boolean;
  limit?: number;
} = {}): SearchQuery[] {
  const terms = options.eventTerms ?? eventTerms;
  const windows = options.timeWindows ?? timePhrases;
  const queries: SearchQuery[] = [];

  if (options.includeRegions !== false) {
    for (const region of regions) {
      for (const term of terms) {
        for (const time of windows) {
          queries.push({
            query: `${term} ${region} ${time.phrase}`,
            priority: 55 + time.boost + (region === "UK" ? 12 : 0),
            category: "region",
            region,
            eventType: term,
            timeWindow: time.timeWindow
          });
        }
      }
    }
  }

  if (options.includeCounties) {
    for (const county of counties) {
      for (const term of terms.slice(0, options.social ? 10 : 18)) {
        for (const time of windows.slice(0, options.social ? 4 : 6)) {
          queries.push({
            query: `${term} ${county} ${time.phrase}`,
            priority: 50 + time.boost,
            category: "county",
            county,
            eventType: term,
            timeWindow: time.timeWindow
          });
        }
      }
    }
  }

  if (options.social) {
    const socialTerms = ["tonight", "tomorrow", "Sunday", "weekend", "this weekend"];
    for (const county of counties.slice(0, 60)) {
      for (const term of ["classic car meet", "cars and coffee", "autojumble", "classic car show"]) {
        for (const socialTerm of socialTerms) {
          queries.push({
            query: `site:facebook.com ${term} ${county} ${socialTerm}`,
            priority: 78,
            category: "social",
            county,
            eventType: term,
            sourceHint: "facebook.com",
            timeWindow: socialTerm === "tonight" || socialTerm === "tomorrow" ? "next_7_days" : "this_weekend"
          });
        }
      }
    }
  }

  if (options.includeSources !== false) {
    queries.push(...getSourceTargetQueries());
  }

  const byQuery = new Map<string, SearchQuery>();
  for (const query of queries) {
    const key = query.query.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = byQuery.get(key);
    if (!existing || existing.priority < query.priority) byQuery.set(key, query);
  }

  return [...byQuery.values()].sort((a, b) => b.priority - a.priority).slice(0, options.limit);
}

export function generateSearchPlan(runType: AgentRunType): SearchPlan {
  if (runType === "midday_near_term") {
    return {
      runType,
      queries: generateQueries({
        includeCounties: true,
        timeWindows: timePhrases.filter((time) => ["this_weekend", "next_14_days", "next_30_days"].includes(time.timeWindow)),
        eventTerms: eventTerms.slice(0, 14),
        limit: 220
      }),
      maxResultsPerQuery: 8,
      notes: ["Near-term run prioritising this weekend, next weekend, next 7 days and next 14 days."]
    };
  }

  if (runType === "evening_social") {
    return {
      runType,
      queries: generateQueries({ includeRegions: true, includeCounties: true, includeSources: true, social: true, eventTerms: eventTerms.slice(4), limit: 220 }),
      maxResultsPerQuery: 8,
      notes: ["Evening run prioritising public social/community patterns and last-minute terms."]
    };
  }

  if (runType === "manual_deep") {
    return {
      runType,
      queries: generateQueries({ includeRegions: true, includeCounties: true, includeSources: true, social: true, limit: 500 }),
      maxResultsPerQuery: 15,
      notes: ["Manual deep run with all regions, counties, source targets and social-style queries."]
    };
  }

  return {
    runType,
    queries: generateQueries({ includeRegions: true, includeCounties: true, includeSources: true, limit: 300 }),
    maxResultsPerQuery: 10,
    notes: ["Morning broad run prioritising national, regional, county, official calendar and venue discovery."]
  };
}

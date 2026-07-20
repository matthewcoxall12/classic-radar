# Competitor and event-source research

**Research date:** 19 July 2026

**Decision scope:** ClassicsGo UK/European discovery and partnership roadmap

This document records product lessons and possible source leads. It is not a
licence register. Every external source remains Pending until an operator has
reviewed its current terms, robots rules, technical access method and permission
basis. A public page, a catalogue entry or a search-engine result is not itself
permission to reproduce a database.

## Competitor findings

| Service | Observed operating model | Useful product lesson | ClassicsGo ingestion decision |
| --- | --- | --- | --- |
| [CarEvents.com](https://www.carevents.com/about/) | Automotive-specific discovery by event type and distance, member likes/saves, organiser-created listings, public organiser profiles, ticketing and club features. Its [UK ticketing page](https://www.carevents.com/uk/sell-smart-tickets/) describes smart tickets and organiser order tools; its [UK terms](https://www.carevents.com/uk/terms-and-conditions/) place listing accuracy with organisers. | Keep nearby/category search, Going/save signals, organiser self-service and club partnerships as core product capabilities. Ticketing is a later commercial integration, not a prerequisite for discovery. | Partnership/API/feed lead only. Do not copy pages or event records. Ask for a written data/ticket affiliate agreement and define cancellation/update obligations before activation. |
| [Eventbrite](https://www.eventbrite.co.uk/) | Broad consumer marketplace plus organiser publishing, promotion and ticketing. The official [Events API guide](https://www.eventbrite.com/platform/docs/events) documents event retrieval by known event, venue or organisation; the [API changelog](https://www.eventbrite.com/platform/docs/changelog) directs broad public-event products to its distribution-partner programme. | Large-platform coverage helps, but organiser and local-club feeds are still required for small events. Preserve the provider event ID and official purchase URL. | The implemented adapter accepts only explicitly authorised organisation IDs. No broad Eventbrite scraping or assumed public-search API. Apply to the distribution-partner programme before expanding scope. |
| [Classic Shows UK](https://www.classicshowsuk.co.uk/) | Volunteer/editorial UK classic-event portal organised by dates and regions, with free organiser submissions. Its [editor's blog](https://www.classicshowsuk.co.uk/editors-blog.asp) explains that dates can be rolled forward while confirmation is awaited. Its [about/privacy page](https://www.classicshowsuk.co.uk/about-classic-showsuk.asp) says its database is not provided to external organisations or third parties. | Editorial relationships and easy organiser updates can uncover events that general ticketing APIs miss. A rolled-forward date must never be treated as current confirmation. | Partnership/manual research lead only. The explicit database statement rules out automated database reuse without new written permission. Prefer a licensed export, reciprocal submission route or direct organiser source. |
| [ClassicCarPassion Agenda](https://www.classiccarpassion.com/en/agenda), [Rétrocalage](https://retrocalage.com/evenements), [Oldtimerweb](https://www.oldtimerweb.nl/oldtimer-evenementen) and [Classics Termine](https://www.classics-termine.de/) | Regional European event directories that demonstrate the value of language-local calendars and country-specific terminology. | Country/locale-aware discovery is necessary; translating only the UI does not provide local event coverage. | Research/partnership leads only. Review each service separately and prefer organiser-owned links or a licensed feed over directory-to-directory copying. |

These findings are competitive observations, not evidence about private
technology stacks. ClassicsGo does not attempt to fingerprint or reproduce a
competitor's implementation.

## Provider and Google decisions

### Supported provider paths

- [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
  is a documented event-search API with country, keyword, date and location
  filters. ClassicsGo uses a server-only key, provider-native queries, bounded
  pagination and the official event URL. Quotas and current terms must be
  reviewed before enabling the production key.
- [Google Calendar Events: list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
  is the relevant Google events interface; there is no generic Google public
  “events database API” used here. An administrator may onboard only an exact
  Calendar API events endpoint for a public calendar with recorded organiser
  authorisation. The adapter follows Google's [incremental synchronization
  guide](https://developers.google.com/workspace/calendar/api/guides/sync),
  including deleted events, page tokens, sync tokens and a full reset after
  HTTP `410`.
- [Firecrawl](https://docs.firecrawl.dev/) supplies search, map, scrape and
  bounded crawl capabilities. ClassicsGo applies its own source permission,
  origin, URL, volume and storage restrictions. Firecrawl is not permission to
  ignore a publisher's terms or robots instructions.
- RSS/Atom, ICS and Schema.org structured data are supported when the publisher
  or organiser has made the endpoint available on terms compatible with this
  use. [Schema.org Event](https://schema.org/Event) is an extraction format, not
  a content licence.

### Explicitly unsupported provider paths

- **Google Custom Search JSON API:** not integrated. Google's [current
  overview](https://developers.google.com/custom-search/v1/overview) states
  that it is closed to new customers and that existing customers must migrate
  by 1 January 2027. It is therefore not a dependable new production source.
- **Google Places ingestion:** not integrated. Google's [Places policy
  guidance](https://developers.google.com/maps/documentation/places/web-service/place-id)
  explains that place IDs are an exception to wider caching restrictions; the
  broader [Maps JavaScript policy](https://developers.google.com/maps/documentation/javascript/policies)
  also imposes storage, display and attribution conditions. Those boundaries do
  not fit a durable, independently published D1 event/provenance directory.
  Places may be reconsidered only for a separately designed, policy-compliant
  location UX—not as an event database.
- **Broad Eventbrite discovery:** not integrated. The authorised-organisation
  endpoint remains the only production path unless Eventbrite approves
  ClassicsGo as a distribution partner.
- **Facebook, Instagram and other social-network scraping:** not integrated.
  No direct Firecrawl target, logged-in automation, cookie reuse, proxy
  rotation, stealth browser, CAPTCHA bypass or access-control bypass is
  allowed. Use an approved platform API, an organiser-owned export/feed, or a
  manually reviewed public organiser link.

## Source coverage map

Catalogue version 4 contains 92 researched leads plus 25 system entries. It is
designed to combine complementary source types instead of assuming one provider
has complete coverage.

| Coverage layer | Examples of primary leads | Operational status |
| --- | --- | --- |
| National federations and motorsport | [FBHVC](https://www.fbhvc.co.uk/events), [Motorsport UK](https://www.motorsportuk.org/), [FIVA](https://www.fiva.org/en), [FFVE](https://www.ffve.org/), [ASI](https://asifed.it/eventi/) | Pending rights/terms review unless an official API/feed agreement is recorded. |
| Clubs and historic racing | [Historic Sports Car Club](https://hscc.org.uk/events/), [Vintage Sports-Car Club](https://www.vscc.co.uk/page/events), [MG Car Club](https://www.mgcc.co.uk/club-events-calendar/), [Porsche Club GB](https://www.porscheclubgb.com/events), [Peter Auto](https://www.peterauto.fr/en/events/) | Prefer organiser-authorised Calendar, RSS or ICS; otherwise review the exact public page. |
| Museums, venues and circuits | [British Motor Museum](https://www.britishmotormuseum.co.uk/whats-on), [Brooklands Museum](https://www.brooklandsmuseum.com/whats-on/calendar/), [Beaulieu](https://www.beaulieu.co.uk/events/), [Bicester Heritage](https://bicesterheritage.co.uk/events/), [Silverstone](https://www.silverstone.co.uk/events) | High-quality official facts, but each endpoint still requires a recorded permission basis and update policy. |
| Autojumbles and mixed heritage | [Newark Autojumble](https://www.newarkautojumble.co.uk/), [Kempton Autojumble](https://www.kemptonautojumble.co.uk/), [Steam Heritage](https://www.steamheritage.co.uk/steam-rallies-and-events/category/classic_cars), [Yeomans Yearbook](https://www.yeomansyearbook.org.uk/index.html) | Important for small events underrepresented by ticketing platforms; manual review or partnership first. |
| Major European organisers | [Rétromobile](https://www.retromobile.com/), [Techno-Classica](https://www.siha.de/tce.php), [Mille Miglia](https://1000miglia.it/events/), [InterClassics](https://interclassics.events/), [Estoril Classics](https://www.estorilclassics.com/) | Official-event pages; activate individually only after terms/robots review. |
| Local authorities and small regional clubs | Council calendars and local club sites in the registered catalogue | Best route to small local meets. Onboard exact public feeds/pages; keep crawl depth and frequency low and retain the organiser/source link. |
| Search/API system entries | 16 Firecrawl search shards, eight Ticketmaster shards and one authorised-organisation Eventbrite entry | System configuration exists, but global discovery and provider calls remain disabled until secrets, rights review and canary checks pass. |

This list is representative rather than exhaustive. The private source registry
is the system of record for activation, schedule, permission basis and current
health.

## Product implications for ClassicsGo

The research supports these product decisions:

1. Keep public search fast and local: radius, date and category filters with a
   direct organiser link are the primary free value.
2. Keep member intent global and privacy-preserving: save/wishlist and Going
   counts should attach to the canonical ClassicsGo event, while attendee
   identities remain private.
3. Make organiser/club onboarding easier than manual web discovery. A verified
   calendar or feed produces fresher facts and cleaner cancellation signals.
4. Treat freshness as evidence. Preserve first/last-seen timestamps, do not
   silently roll dates forward, and send cancellation/staleness to an operator
   queue.
5. Build partnerships before ticketing aggregation or advertising. Separate
   editorial ranking from paid placement and label sponsored content clearly.

## Rights-review checklist

Before changing any source from Pending to Active, record:

1. the source owner and exact canonical endpoint;
2. whether access is an official API, organiser-authorised feed, written
   partner agreement, compatible public-web permission or manual review only;
3. the current terms, robots result, attribution requirement and review date;
4. allowed fields, retention, update/cancellation mechanism and request budget;
5. whether personal data, private events, attendee data or credentials could be
   returned—and how they are excluded;
6. a bounded canary showing correct normalization, provenance, deduplication
   and withdrawal behaviour;
7. the owner responsible for periodic re-review and immediate revocation if
   permission changes.

If any point is uncertain, leave the source Pending and seek written permission.

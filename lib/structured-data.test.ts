import test from "node:test";
import assert from "node:assert/strict";
import { eventAdmission, eventSchemaDate, eventStructuredData, eventPageStructuredData, serializeStructuredData, siteStructuredData } from "./structured-data.ts";
import { siteUrl } from "./site.ts";
import { formatEventDate } from "./utils.ts";
import type { ClassicEvent } from "./types.ts";

const event: ClassicEvent = {
  id: "public-event", slug: "village-meet", title: "Village classic car meet", description: "Owners and visitors welcome.",
  event_type: "Club meet", start_date: "2027-07-10", start_time: "10:00:00", end_date: null, end_time: "14:00:00",
  venue_name: "Village hall", address: "Main Street", town: "Hythe", county: "Hampshire", postcode: "SO45 3HW",
  country_code: "GB", timezone: "Europe/London", latitude: 50.87, longitude: -1.4,
  price_text: "Free", booking_required: false, booking_url: null, organiser_name: "Village club", organiser_url: "https://example.com/meet",
  image_url: null, status: "published", confidence_score: 90, is_verified: true, source_count: 1, going_count: 0, last_checked_at: null,
};

test("canonical identity ignores stale Vercel configuration", () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://classic-radar.vercel.app";
    assert.equal(siteUrl().origin, "https://classicsgo.com");
    assert.equal(siteStructuredData()["@graph"][1].url, "https://classicsgo.com/");
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = old;
  }
});

test("local event times use summer/winter offsets, including multi-day DST changes", () => {
  assert.equal(eventSchemaDate("2027-07-10", "10:00", "Europe/London"), "2027-07-10T10:00:00+01:00");
  assert.equal(eventSchemaDate("2027-01-10", "10:00", "Europe/London"), "2027-01-10T10:00:00+00:00");
  assert.equal(eventSchemaDate("2027-03-27", "10:00", "Europe/London"), "2027-03-27T10:00:00+00:00");
  assert.equal(eventSchemaDate("2027-03-28", "10:00", "Europe/London"), "2027-03-28T10:00:00+01:00");
  assert.equal(eventSchemaDate("2027-07-10", "10:00", "Europe/Paris"), "2027-07-10T10:00:00+02:00");
});

test("unknown, invalid and ambiguous DST hours never invent an instant", () => {
  assert.equal(eventSchemaDate("2027-07-10", null, "Europe/London"), "2027-07-10");
  assert.equal(eventSchemaDate("2027-07-10", "24:61", "Europe/London"), "2027-07-10");
  assert.equal(eventSchemaDate("2027-02-30", "10:00", "Europe/London"), undefined);
  assert.equal(eventSchemaDate("2027-03-28", "01:30", "Europe/London"), "2027-03-28");
  assert.equal(eventSchemaDate("2027-10-31", "01:30", "Europe/London"), "2027-10-31");
  assert.equal(eventSchemaDate("2027-07-10", "10:00", "Invalid/Zone"), "2027-07-10T10:00:00");
});

test("leaf event has structured address, genuine coordinates and same-day end time", () => {
  const data = eventStructuredData(event)!;
  assert.equal(data.location.address["@type"], "PostalAddress");
  assert.equal(data.location.address.postalCode, "SO45 3HW");
  assert.equal(data.location.geo?.latitude, 50.87);
  assert.equal(data.startDate, "2027-07-10T10:00:00+01:00");
  assert.equal(data.endDate, "2027-07-10T14:00:00+01:00");
  assert.equal(data.url, "https://classicsgo.com/events/village-meet");
  assert.equal(data.image, undefined);
  assert.equal(data.offers?.price, 0);
  assert.equal(eventStructuredData({ ...event, end_time: "09:00" })!.endDate, undefined);
});

test("imported all-day boundaries stay date-only and match visible multi-day dates", () => {
  const allDay = { ...event, start_date: "2027-07-10", start_time: "00:00:00", end_date: "2027-07-11", end_time: "23:59:00" };
  assert.equal(eventStructuredData(allDay)!.startDate, "2027-07-10");
  assert.equal(eventStructuredData(allDay)!.endDate, "2027-07-11");
  assert.match(formatEventDate(allDay), /10 Jul 2027 – Sun, 11 Jul 2027/);
  assert.doesNotMatch(formatEventDate(allDay), /00:00|23:59/);
  assert.equal(eventStructuredData({ ...allDay, created_by: "owner" })!.startDate, "2027-07-10T00:00:00+01:00");
});

test("offers never invent availability, currency or uncertain prices", () => {
  assert.deepEqual(eventAdmission("£12.50"), { price: 12.5, priceCurrency: "GBP" });
  assert.deepEqual(eventAdmission("Free admission"), { price: 0, priceCurrency: "GBP" });
  for (const price of ["From £12", "£12–£20", "Free for children", "Adults £12, children free", "£12 plus fees", "Minimum £20 donation"]) assert.equal(eventAdmission(price), undefined);
  assert.equal(eventAdmission("£12", "FR"), undefined);
  const offer = eventStructuredData({ ...event, price_text: "£12", booking_url: "https://example.com/book" })!.offers!;
  assert.equal(offer.url, "https://example.com/book");
  assert.equal(Object.hasOwn(offer, "availability"), false);
});

test("cancelled events retain their date/location and drop ticket offers", () => {
  const data = eventStructuredData({ ...event, status: "cancelled" })!;
  assert.equal(data.eventStatus, "https://schema.org/EventCancelled");
  assert.equal(data.startDate, eventStructuredData(event)!.startDate);
  assert.deepEqual(data.location, eventStructuredData(event)!.location);
  assert.equal(data.offers, undefined);
});

test("unpublished and unknown-location listings do not claim event eligibility", () => {
  assert.equal(eventStructuredData({ ...event, status: "draft" }), null);
  assert.equal(eventStructuredData({ ...event, address: null, town: null, postcode: null, venue_name: "Venue changed — check organiser" }), null);
  assert.equal(eventStructuredData({ ...event, description: "Invitation-only private event for club members." }), null);
  assert.equal(eventStructuredData({ ...event, country_code: "BE" })!.startDate, "2027-07-10T10:00:00");
});

test("ratings require real available review totals; graph breadcrumbs match public page", () => {
  assert.equal(eventStructuredData(event, { count: 0, average: 5, unavailable: false })!.aggregateRating, undefined);
  assert.equal(eventStructuredData(event, { count: 2, average: 4.5, unavailable: true })!.aggregateRating, undefined);
  assert.equal(eventStructuredData(event, { count: 2, average: 4.5, unavailable: false })!.aggregateRating?.ratingValue, 4.5);
  const graph = eventPageStructuredData(event)["@graph"];
  assert.equal(graph.filter(x => x["@type"] === "Event").length, 1);
  const breadcrumb = graph.find(x => x["@type"] === "BreadcrumbList")!;
  assert.ok("itemListElement" in breadcrumb);
  assert.equal(breadcrumb.itemListElement![2].name, event.title);
});

test("unsafe links, injected script endings and invalid coordinates are excluded", () => {
  const data = eventStructuredData({ ...event, organiser_url: "javascript:alert(1)", booking_url: "https://user:secret@example.com", latitude: 1000 })!;
  assert.equal(data.organizer?.url, undefined);
  assert.equal(data.offers?.url, undefined);
  assert.equal(data.location.geo, undefined);
  const script = serializeStructuredData({ name: "</script><script>alert(1)</script>" });
  assert.doesNotMatch(script, /</);
  assert.equal(JSON.parse(script).name, "</script><script>alert(1)</script>");
});

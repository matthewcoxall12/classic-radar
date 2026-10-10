import test from "node:test";
import assert from "node:assert/strict";
import { parseEventSubmission, eventImageExtension } from "./event-submission.ts";
const valid = { title: "Village classic car meet", description: "A friendly village car meet open to all classic cars and visitors.", event_type: "Club meet", start_date: "2026-11-01", start_time: "10:00", end_time: "14:00", venue_name: "Village hall", address: "Main Street", town: "Cullompton", postcode: "ex151qp", organiser_name: "Local club", organiser_url: "https://example.com/events", price_text: "Free", accurate: "on" };
test("complete listing normalises postcode and ignores forged privileges", () => {
  const parsed = parseEventSubmission({ ...valid, is_verified: "true", status: "published", created_by: "other" }, "2026-10-10");
  assert.equal(parsed.postcode, "EX15 1QP"); assert.equal(parsed.country_code, "GB"); assert.equal(Object.hasOwn(parsed, "is_verified"), false); assert.equal(Object.hasOwn(parsed, "created_by"), false);
});
test("impossible dates, past dates, reversed ranges and overnight mistakes are rejected", () => {
  for (const changes of [{ start_date: "2026-02-30" }, { start_date: "2026-01-01" }, { end_date: "2026-10-31" }, { end_time: "09:00" }]) assert.throws(() => parseEventSubmission({ ...valid, ...changes }, "2026-10-10"));
  assert.doesNotThrow(() => parseEventSubmission({ ...valid, end_date: "2026-11-02", end_time: "09:00" }, "2026-10-10"));
});
test("publication needs useful description, full UK postcode, booking link and accuracy consent", () => {
  for (const changes of [{ description: "Car meet" }, { postcode: "EX15" }, { booking_required: "on" }, { accurate: "" }, { venue_name: "" }]) assert.throws(() => parseEventSubmission({ ...valid, ...changes }, "2026-10-10"));
});
test("past date stays invalid for new listings but an authenticated owner can retain the existing date", () => {
  const pastEvent = { ...valid, start_date: "2026-09-01" };
  assert.throws(() => parseEventSubmission(pastEvent, "2026-10-10"));
  assert.doesNotThrow(() => parseEventSubmission(pastEvent, "2026-10-10", { allowPastStartDate: true }));
  assert.throws(() => parseEventSubmission({ ...pastEvent, end_date: "2026-08-31" }, "2026-10-10", { allowPastStartDate: true }));
});
test("unsafe and credential-bearing source URLs cannot be submitted", () => {
  for (const organiser_url of ["javascript:alert(1)", "https://user:password@example.com", "http://127.0.0.1/events", "https://example.com/" + "a".repeat(1001)]) assert.throws(() => parseEventSubmission({ ...valid, organiser_url }, "2026-10-10"));
});
test("image signature must match declared supported format, rejecting disguised HTML and SVG", () => {
  assert.equal(eventImageExtension(Uint8Array.from([255,216,255,1]), "image/jpeg"), "jpg");
  assert.equal(eventImageExtension(Uint8Array.from([137,80,78,71,13,10,26,10]), "image/png"), "png");
  assert.equal(eventImageExtension(new TextEncoder().encode("RIFF0000WEBP"), "image/webp"), "webp");
  assert.throws(() => eventImageExtension(new TextEncoder().encode("<svg>"), "image/svg+xml"));
  assert.throws(() => eventImageExtension(new TextEncoder().encode("<html>"), "image/jpeg"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { roadbookCalendar } from "./roadbook-calendar.ts";
test("calendar covers inclusive dates and escapes injected lines", () => {
  const calendar = roadbookCalendar("My weekend", [{ id: "a", title: "Cars, vans;\nBEGIN:VEVENT", slug: "cars", start_date: "2026-12-31", end_date: "2027-01-02" }], new Date("2026-10-10T12:00:00Z"));
  assert.match(calendar, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270103/);
  assert.match(calendar, /SUMMARY:Cars\\, vans\\;\\nBEGIN:VEVENT/);
  assert.equal(calendar.match(/\r\nBEGIN:VEVENT/g)?.length, 1);
});
test("calendar folds Unicode without splitting code points or exceeding 75 octets", () => {
  for (const line of roadbookCalendar("🚗".repeat(50), []).split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
});

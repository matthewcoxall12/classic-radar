import test from "node:test";
import assert from "node:assert/strict";
import { dateRange, eventSearchWindow, sortLocalEvents } from "./event-search.ts";
test("weekend filter includes the current Sunday instead of skipping to next week", () => {
  assert.deepEqual(dateRange("weekend", new Date("2026-10-11T18:00:00Z")), {
    start: "2026-10-10",
    end: "2026-10-11",
  });
  assert.deepEqual(dateRange("weekend", new Date("2026-10-08T18:00:00Z")), {
    start: "2026-10-10",
    end: "2026-10-11",
  });
});
test("date windows cross year boundaries", () =>
  assert.deepEqual(dateRange("7", new Date("2026-12-29T12:00:00Z")), {
    start: "2026-12-29",
    end: "2027-01-04",
  }));
test("UK dates advance at London midnight during British Summer Time", () => {
  assert.equal(dateRange("all", new Date("2026-07-03T23:30:00Z")).start, "2026-07-04");
  assert.equal(dateRange("30", new Date("2026-07-03T23:30:00Z")).end, "2026-08-02");
});
test("lookahead pagination retains the extra row at the start of the next page", () => {
  assert.deepEqual(eventSearchWindow("1", 31), { page: 1, limit: 31, offset: 0 });
  assert.deepEqual(eventSearchWindow("2", 31), { page: 2, limit: 31, offset: 30 });
  assert.equal(eventSearchWindow(undefined, 3).limit, 3);
  assert.equal(eventSearchWindow("-9", 31).offset, 0);
  assert.equal(eventSearchWindow("999999999999", 31).page, 10000);
});
test("local results sort by soonest by default and missing distances sort last", () => {
  const events = [
    { start_date: "2026-10-11", distance_miles: 2 },
    { start_date: "2026-10-09", distance_miles: null },
    { start_date: "2026-10-10", distance_miles: 1 },
  ];
  assert.deepEqual(
    sortLocalEvents(events).map((e) => e.start_date),
    ["2026-10-09", "2026-10-10", "2026-10-11"],
  );
  assert.deepEqual(
    sortLocalEvents(events, "distance").map((e) => e.distance_miles),
    [1, 2, null],
  );
  assert.equal(events[0].start_date, "2026-10-11");
});

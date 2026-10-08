import test from "node:test";
import assert from "node:assert/strict";
import { eventDatePanel, getEventPhotograph } from "./event-photography.ts";

test("event photos are available only for explicitly reviewed listings", () => {
  assert.equal(getEventPhotograph("unknown-event"), null);
  assert.equal(getEventPhotograph("constructor"), null);
  assert.equal(getEventPhotograph("https://hscc.org.uk/events/"), null);
  assert.equal(
    getEventPhotograph("veteran-car-run-2026-2026-11-01-1a94f6bf")?.context,
    "London to Brighton · 2024 edition",
  );
});

test("date panels keep the calendar date and reject invalid dates", () => {
  assert.deepEqual(eventDatePanel("2026-11-01"), {
    day: "01",
    month: "Nov",
    weekday: "Sunday",
    year: "2026",
  });
  assert.equal(eventDatePanel("2026-02-31"), null);
  assert.equal(eventDatePanel("not-a-date"), null);
});

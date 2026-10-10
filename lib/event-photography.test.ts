import test from "node:test";
import assert from "node:assert/strict";
import { eventDatePanel, getEventPhotograph, submittedEventImage } from "./event-photography.ts";

test("event uploads display only from the publisher's own image bucket folder", () => {
  const owner = "00000000-0000-4000-8000-000000000001";
  const id = "00000000-0000-4000-8000-000000000003";
  const image = `https://rnayhhsurmztrohtftqo.supabase.co/storage/v1/object/public/event-images/${owner}/${id}/00000000-0000-4000-8000-000000000002.webp`;
  assert.equal(submittedEventImage({id,created_by: owner,image_url: image}), image);
  assert.equal(submittedEventImage({image_url: image}), null);
  assert.equal(submittedEventImage({id,created_by: "another-owner",image_url: image}), null);
  assert.equal(submittedEventImage({id: owner,created_by: owner,image_url: image}), null);
  assert.equal(submittedEventImage({id,created_by: owner,image_url: image.replace('.webp','.svg')}), null);
  assert.equal(submittedEventImage({id,created_by: owner,image_url: "https://untrusted.example/photo.jpg"}), null);
});

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

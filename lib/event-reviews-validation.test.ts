import test from "node:test";
import assert from "node:assert/strict";
import { canReviewEvent, londonDate, parseReviewInput, parseReviewPage } from "./event-reviews-validation.ts";

test("reviews open after the entire final UK day, including summer midnight", () => {
  const event = { status: "published", start_date: "2026-07-10", end_date: null };
  assert.equal(canReviewEvent(event, new Date("2026-07-10T22:59:59Z")), false);
  assert.equal(canReviewEvent(event, new Date("2026-07-10T23:00:00Z")), true);
  assert.equal(londonDate(new Date("2026-07-10T23:00:00Z")), "2026-07-11");
});
test("winter and multiday events cannot be reviewed on their last day", () => {
  const event = { status: "published", start_date: "2026-11-10", end_date: "2026-11-12" };
  assert.equal(canReviewEvent(event, new Date("2026-11-11T12:00:00Z")), false);
  assert.equal(canReviewEvent(event, new Date("2026-11-12T23:59:59Z")), false);
  assert.equal(canReviewEvent(event, new Date("2026-11-13T00:00:00Z")), true);
});
test("cancelled and unpublished listings never accept reviews", () => {
  for (const status of ["cancelled", "review", "draft", "rejected", "expired"]) assert.equal(canReviewEvent({ status, start_date: "2020-01-01", end_date: null }, new Date("2026-10-10T12:00:00Z")), false);
});
test("ratings must be whole stars and useful text is bounded without trusting extra fields", () => {
  const body = "A friendly meet with helpful marshals and plenty of interesting classics.";
  assert.deepEqual(parseReviewInput("5", `  ${body}  `), { rating: 5, body });
  for (const rating of ["0", "6", "5.0", "05", "1e0", "Infinity", "", null, 5]) assert.throws(() => parseReviewInput(rating, body));
  for (const text of ["", "Too short", "x".repeat(2001), undefined]) assert.throws(() => parseReviewInput("3", text));
  assert.equal(parseReviewInput("3", `${body}\u0000`).body, body);
});
test("review pagination is bounded and rejects malformed or multiple query values", () => {
  assert.equal(parseReviewPage("2"), 2);
  assert.equal(parseReviewPage("99999"), 10000);
  for (const value of [undefined, "0", "-1", "1.5", "Infinity", "1e3", ["2", "3"]]) assert.equal(parseReviewPage(value), 1);
});

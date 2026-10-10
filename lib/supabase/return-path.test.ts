import assert from "node:assert/strict";
import { test } from "node:test";
import { safeReturnPath } from "./return-path.ts";

test("authentication preserves internal event, query and fragment destinations", () => {
  assert.equal(safeReturnPath("/events/austin?tab=details#going"), "/events/austin?tab=details#going");
  assert.equal(safeReturnPath("/account?tab=security"), "/account?tab=security");
});

test("authentication rejects external and browser-normalized open redirects", () => {
  for (const value of [undefined, null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/\n/evil.example", "javascript:alert(1)"]) {
    assert.equal(safeReturnPath(value), "/account", String(value));
  }
  assert.equal(safeReturnPath("//evil.example", "/events?radius=uk"), "/events?radius=uk");
});

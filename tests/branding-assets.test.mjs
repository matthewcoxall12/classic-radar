import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Google OAuth logo is a square 120px PNG below the upload limit", () => {
  const logo = readFileSync(
    new URL(
      "../public/branding/classicsgo-google-oauth-logo-v2-120.png",
      import.meta.url,
    ),
  );

  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(logo.readUInt32BE(16), 120);
  assert.equal(logo.readUInt32BE(20), 120);
  assert.ok(logo.byteLength < 1_000_000);
});

test("public contact roles use the configured ClassicsGo Workspace aliases", () => {
  const contacts = readFileSync(
    new URL("../lib/site-contact.ts", import.meta.url),
    "utf8",
  );

  for (const email of [
    "support@classicsgo.com",
    "hello@classicsgo.com",
    "info@classicsgo.com",
    "privacy@classicsgo.com",
    "security@classicsgo.com",
    "noreply@classicsgo.com",
    "notifications@classicsgo.com",
  ]) {
    assert.match(contacts, new RegExp(email.replace(".", "\\.")));
  }
});

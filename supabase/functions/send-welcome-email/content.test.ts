import assert from "node:assert/strict";
import { test } from "node:test";
import { isCustomDomainSender, welcomeContent, welcomeReplyTo } from "./content.ts";

test("personal mailboxes cannot become transactional From addresses", () => {
  for (const sender of [undefined, "", welcomeReplyTo, "Matthew <matthewcoxall@gmail.com>", "ClassicsGo <onboarding@resend.dev>", "hello@classicsgo.com\r\nBcc:evil@example.com"]) assert.equal(isCustomDomainSender(sender), false);
  assert.equal(isCustomDomainSender("ClassicsGo <welcome@classicsgo.com>"), true);
});

test("welcome uses personal contact and escapes untrusted profile names in HTML", () => {
  const content = welcomeContent("<img> Smith");
  assert.ok(content.html.includes("&lt;img&gt;"));
  assert.ok(!content.html.includes("<img>"));
  assert.ok(content.text.includes("Hi <img>,"));
  assert.ok(content.text.includes(welcomeReplyTo));
  assert.ok(content.text.includes("early access"));
  assert.ok(content.text.includes("one-off account welcome"));
  assert.ok(welcomeContent("").text.startsWith("Hi there,"));
});

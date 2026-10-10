export const welcomeReplyTo = "matthewcoxall@googlemail.com";

// Resend requires a domain we control and verify. A personal Google mailbox
// belongs in Reply-To; we cannot authenticate gmail.com or googlemail.com.
export function isCustomDomainSender(value?: string): boolean {
  if (!value || /[\r\n]/.test(value)) return false;
  const email = (value.match(/<([^<>]+)>$/)?.[1] ?? value).trim();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) return false;
  const domain = email.split("@")[1].toLowerCase();
  return !["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "resend.dev"].includes(domain);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function welcomeContent(fullName: string) {
  const name = fullName.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().split(/\s+/)[0]?.slice(0, 80) || "there";
  return {
    subject: "Welcome to ClassicsGo",
    text: `Hi ${name},\n\nWelcome to ClassicsGo. Find classic car shows and friendly meets across the UK, mark the days you are going, and publish events for your club or community.\n\nExplore events: https://classicsgo.com/events?radius=uk\n\nRoadbook adds a private wishlist and weekend planning. Explore early access: https://classicsgo.com/membership\n\nQuestions or ideas? Reply to me at ${welcomeReplyTo}.\n\nMatthew\nClassicsGo\n\nThis is a one-off account welcome, not a newsletter subscription.`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f2ea;font-family:Arial,sans-serif;color:#17231b"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #ded9cc;border-radius:12px;padding:32px"><p style="color:#2f6b4f;font-weight:700">ClassicsGo</p><h1 style="font-size:28px">Welcome, ${escapeHtml(name)}.</h1><p style="line-height:1.7">Find classic car shows and friendly meets across the UK, mark the days you are going, and publish events for your club or community.</p><p><a href="https://classicsgo.com/events?radius=uk" style="display:inline-block;background:#2f6b4f;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:6px">Explore events</a></p><p style="line-height:1.7">Roadbook adds a private wishlist and weekend planning. <a href="https://classicsgo.com/membership">Explore early access</a>.</p><p style="line-height:1.7">Questions or ideas? Reply to me at <a href="mailto:${welcomeReplyTo}">${welcomeReplyTo}</a>.</p><p>Matthew<br>ClassicsGo</p><p style="font-size:12px;color:#657067">This is a one-off account welcome, not a newsletter subscription.</p></div></div></body></html>`
  };
}

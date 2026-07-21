export const APP_NAME = "ClassicsGo";

export const SITE_EMAILS = {
  support: "support@classicsgo.com",
  hello: "hello@classicsgo.com",
  info: "info@classicsgo.com",
  privacy: "privacy@classicsgo.com",
  security: "security@classicsgo.com",
  noReply: "noreply@classicsgo.com",
  notifications: "notifications@classicsgo.com",
} as const;

export function mailto(email: string) {
  return `mailto:${email}`;
}

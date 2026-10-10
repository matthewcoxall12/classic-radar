export type ReviewableEvent = { start_date: string; end_date: string | null; status: string };
export function londonDate(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}
export function canReviewEvent(event: ReviewableEvent, now = new Date()) {
  return event.status === "published" && (event.end_date || event.start_date) < londonDate(now);
}
export function parseReviewInput(ratingInput: unknown, bodyInput: unknown) {
  const ratingText = typeof ratingInput === "string" ? ratingInput : "";
  if (!/^[1-5]$/.test(ratingText)) throw new Error("Choose a rating from one to five stars.");
  const body = typeof bodyInput === "string" ? bodyInput.normalize("NFKC").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\p{Cf}]/gu, "").trim() : "";
  if (body.length < 20 || body.length > 2000) throw new Error("Please write between 20 and 2,000 characters about your experience.");
  return { rating: Number(ratingText), body };
}
export function parseReviewPage(input?: string | string[]) {
  const value = typeof input === "string" && /^\d{1,5}$/.test(input) ? Number(input) : 1;
  return Math.max(1, Math.min(10000, value || 1));
}

export const submissionTypes = ["Classic car show", "Cars & coffee", "Club meet", "Autojumble", "Rally / road run", "Motorsport", "Museum / venue event", "American / hot rod", "Vintage / pre-war", "Marque-specific"] as const;
export const MAX_EVENT_IMAGE_BYTES = 3 * 1024 * 1024;
export type SubmissionFields = Record<string, string | undefined>;
export function parseEventSubmission(fields: SubmissionFields, today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" }), options: { allowPastStartDate?: boolean } = {}) {
  const text = (key: string, max: number, required = false) => {
    const value = (fields[key] ?? "").normalize("NFKC").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\p{Cf}]/gu, "").trim();
    if (value.length > max || (required && !value)) throw new Error(`Please complete ${key.replaceAll("_", " ")} (maximum ${max} characters).`);
    return value || null;
  };
  const link = (key: string, required = false) => {
    const raw = text(key, 1000, required);
    if (!raw) return null;
    try { const url = new URL(raw); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".") || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)) throw new Error(); return url.href; }
    catch { throw new Error(`Please enter a public http or https ${key.replaceAll("_", " ")}.`); }
  };
  const date = (key: string, required = false) => {
    const value = text(key, 10, required);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error("Please enter a valid event date.");
    return value;
  };
  const time = (key: string) => { const value = text(key, 5); if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Please enter a valid time."); return value; };
  const title = text("title", 180, true)!;
  if (title.length < 3) throw new Error("Please enter an event name of at least three characters.");
  const description = text("description", 6000, true)!;
  if (description.length < 30) throw new Error("Please describe the event in at least 30 characters.");
  const start_date = date("start_date", true)!;
  const end_date = date("end_date");
  if (start_date < today && !options.allowPastStartDate) throw new Error("Please choose today or a future event date.");
  if (start_date > `${Number(today.slice(0, 4)) + 3}${today.slice(4)}`) throw new Error("Please choose an event within the next three years.");
  if (end_date && end_date > `${Number(today.slice(0, 4)) + 3}${today.slice(4)}`) throw new Error("Please choose an end date within the next three years.");
  if (end_date && end_date < start_date) throw new Error("The end date cannot be before the start date.");
  const start_time = time("start_time"), end_time = time("end_time");
  if (start_time && end_time && (!end_date || end_date === start_date) && end_time < start_time) throw new Error("For an overnight event, add the following day as the end date.");
  const event_type = text("event_type", 60, true)!;
  if (!(submissionTypes as readonly string[]).includes(event_type)) throw new Error("Please choose an event type.");
  const postcode = (text("postcode", 12, true) ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^(?:GIR0AA|[A-PR-UWYZ][A-HK-Y]?\d[\dA-HJKPSTUW]?\d[ABD-HJLNP-UW-Z]{2})$/.test(postcode)) throw new Error("Please enter a full UK venue postcode.");
  const booking_url = link("booking_url");
  if (fields.booking_required === "on" && !booking_url) throw new Error("Please add a booking link when booking is required.");
  if (fields.accurate !== "on") throw new Error("Please confirm that the details are accurate and suitable for publication.");
  return { title, description, event_type, start_date, end_date, start_time, end_time, venue_name: text("venue_name", 180, true), address: text("address", 300, true), town: text("town", 100, true), county: text("county", 100), postcode: `${postcode.slice(0, -3)} ${postcode.slice(-3)}`, country_code: "GB", timezone: "Europe/London", organiser_name: text("organiser_name", 180, true), organiser_url: link("organiser_url", true), price_text: text("price_text", 250, true), booking_required: fields.booking_required === "on", booking_url };
}

export function eventImageExtension(bytes: Uint8Array, declaredType: string) {
  if (declaredType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (declaredType === "image/png" && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) return "png";
  if (declaredType === "image/webp" && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP") return "webp";
  throw new Error("Please choose a genuine JPEG, PNG or WebP photograph.");
}

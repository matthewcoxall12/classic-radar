import { validatePublicHttpsUrl } from "@/lib/discovery-payload";

export async function fetchBoundedText(
  inputUrl: string,
  options: {
    etag?: string | null;
    lastModified?: string | null;
    maxBytes?: number;
    accept?: string;
    allowedOrigins?: string[];
    contentTypes?: string[];
  } = {},
) {
  let url = new URL(validatePublicHttpsUrl(inputUrl, "source endpoint"));
  const allowedOrigins = new Set(
    (options.allowedOrigins?.length ? options.allowedOrigins : [url.origin])
      .map((origin) => new URL(origin).origin),
  );
  if (!allowedOrigins.has(url.origin)) throw new Error("SOURCE_ORIGIN_REJECTED");
  const maxBytes = Math.max(1_024, Math.min(2_000_000, options.maxBytes ?? 1_000_000));
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const headers = new Headers({
      Accept: options.accept ?? "text/html,application/xml,text/xml;q=0.9,*/*;q=0.5",
      "User-Agent": "ClassicsGo-Discovery/1.0 (+https://classicsgo.com; support@classicsgo.com)",
    });
    if (options.etag) headers.set("If-None-Match", options.etag);
    if (options.lastModified) headers.set("If-Modified-Since", options.lastModified);
    const response = await fetch(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 304) {
      return { notModified: true, text: "", url: url.toString(), etag: options.etag ?? null, lastModified: options.lastModified ?? null };
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) throw new Error("SOURCE_REDIRECT_REJECTED");
      url = new URL(validatePublicHttpsUrl(new URL(location, url).toString(), "source redirect"));
      if (!allowedOrigins.has(url.origin)) throw new Error("SOURCE_REDIRECT_ORIGIN_REJECTED");
      continue;
    }
    if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (
      options.contentTypes?.length &&
      !options.contentTypes.some((allowed) => contentType === allowed || contentType.endsWith(`+${allowed.split("/")[1]}`))
    ) {
      throw new Error("SOURCE_CONTENT_TYPE_REJECTED");
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) throw new Error("SOURCE_RESPONSE_TOO_LARGE");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error("SOURCE_RESPONSE_TOO_LARGE");
    return {
      notModified: false,
      text: new TextDecoder("utf-8", { fatal: false }).decode(buffer),
      url: url.toString(),
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      contentType,
    };
  }
  throw new Error("SOURCE_REDIRECT_REJECTED");
}

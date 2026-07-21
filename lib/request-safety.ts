type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  const key = `${scope}:${ip}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  if (buckets.size > 2000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  return { allowed: true, retryAfter: 0 };
}

export async function readJsonBody(request: Request, maxBytes = 20_000) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new RequestError("Send the form as JSON.", 415);
  }

  const declaredLengthHeader = request.headers.get("content-length");
  if (declaredLengthHeader !== null) {
    const declaredLength = Number(declaredLengthHeader);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > maxBytes
    ) {
      throw new RequestError("That submission is too large.", 413);
    }
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          try {
            await reader.cancel();
          } catch {
            // The size violation remains authoritative if stream cancellation fails.
          }
          throw new RequestError("That submission is too large.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RequestError("The form data is not valid JSON.", 400);
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error();
    }
    return value as Record<string, unknown>;
  } catch {
    throw new RequestError("The form data is not valid JSON.", 400);
  }
}

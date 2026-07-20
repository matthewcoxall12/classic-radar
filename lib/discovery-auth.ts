import { getRuntimeEnv } from "@/lib/runtime-env";

export class DiscoveryAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DiscoveryAuthError";
  }
}

function configuredSecret() {
  const runtime = getRuntimeEnv();
  const runtimeValue = runtime?.DISCOVERY_INGEST_SECRET;
  const localValue =
    typeof process !== "undefined"
      ? process.env.DISCOVERY_INGEST_SECRET
      : undefined;
  return (runtimeValue || localValue || "").trim();
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

function equalDigest(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function requireDiscoveryBearer(request: Request) {
  const expected = configuredSecret();
  if (
    expected.length < 32 ||
    /(?:replace|change.?me|example|placeholder)/i.test(expected)
  ) {
    throw new DiscoveryAuthError(
      503,
      "DISCOVERY_SETUP_PENDING",
      "The discovery intake is not configured.",
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const candidate =
    header.length <= 512 && /^Bearer\s/i.test(header)
      ? header.slice(7).trim()
      : "";
  const [candidateDigest, expectedDigest] = await Promise.all([
    digest(candidate),
    digest(expected),
  ]);
  if (!candidate || !equalDigest(candidateDigest, expectedDigest)) {
    throw new DiscoveryAuthError(
      401,
      "DISCOVERY_AUTH_REQUIRED",
      "Discovery intake authentication failed.",
    );
  }
}

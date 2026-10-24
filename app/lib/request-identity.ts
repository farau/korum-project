import "server-only";

import { createHash } from "node:crypto";

// Use the same proxy identity convention for public, rate-limited endpoints.
export function requestIdentity(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip") || forwarded || "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 24);
}

import { getWalletSession, isSameOriginRequest } from "../../lib/auth/session";
import { consumeRateLimit, redisCacheKey } from "../../lib/cache/redis";
import { storeTokenImage, TokenImageBusyError } from "../../lib/db/token-images";
import { compressTokenImage, readTokenImageBody, TokenImageValidationError } from "../../lib/token-image";
import { TOKEN_IMAGE_TYPES } from "../../lib/token-image-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const json = (body: object, status = 200, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
  if (!isSameOriginRequest(request)) return json({ error: "Invalid request origin." }, 403);
  const session = await getWalletSession();
  if (!session) return json({ error: "Connect your wallet before uploading token images." }, 401);
  // Prevent a wallet change during preparation from silently using another session.
  if (request.headers.get("x-wallet-address")?.toLowerCase() !== session.address.toLowerCase()) {
    return json({ error: "Your wallet changed. Sign in again before publishing." }, 403);
  }
  try {
    const limit = await consumeRateLimit(redisCacheKey("rate-limit", "token-images", session.userId), 1, 20, 600);
    if (!limit.allowed) return json({ error: "Too many image uploads. Try again later." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    if (!TOKEN_IMAGE_TYPES.includes(request.headers.get("content-type") || "")) {
      return json({ error: "Choose a PNG, JPEG, WebP or GIF image." }, 415);
    }
    const image = await compressTokenImage(await readTokenImageBody(request));
    const upload = await storeTokenImage(image, session.address);
    return json(upload);
  } catch (error) {
    if (error instanceof TokenImageValidationError) return json({ error: error.message }, 400);
    if (error instanceof TokenImageBusyError) return json({ error: error.message }, 503, { "Retry-After": "3" });
    console.error("Unable to upload a token image.", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "The image service is temporarily unavailable. Please try again." }, 503);
  }
}

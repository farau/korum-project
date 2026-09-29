import { getWalletSession, isSameOriginRequest } from "../../../lib/auth/session";
import { AvatarValidationError, compressAvatar, readAvatarBody } from "../../../lib/avatar-image";
import { consumeRateLimit, redisCacheKey } from "../../../lib/cache/redis";
import { updateUserAvatar } from "../../../lib/db/users";

export const runtime = "nodejs";

async function changeAvatar(request: Request, remove: boolean) {
  const json = (body: object, status = 200, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
  if (!isSameOriginRequest(request)) return json({ error: "Invalid request origin." }, 403);
  const session = await getWalletSession();
  if (!session) return json({ error: "Authentication required." }, 401);
  try {
    const limit = await consumeRateLimit(redisCacheKey("rate-limit", "avatar", session.userId), 1, 10, 600);
    if (!limit.allowed) return json({ error: "Too many avatar changes. Try again later." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
    if (!remove && !["image/jpeg", "image/png", "image/webp"].includes(request.headers.get("content-type") || "")) {
      return json({ error: "Choose a JPEG, PNG or WebP image." }, 415);
    }
    const image = remove ? null : await compressAvatar(await readAvatarBody(request));
    const user = await updateUserAvatar(session.userId, session.address, image);
    return user ? json({ user }) : json({ error: "Wallet profile not found." }, 404);
  } catch (error) {
    if (error instanceof AvatarValidationError) return json({ error: error.message }, 400);
    console.error("Unable to update the avatar.", error);
    return json({ error: "The avatar service is temporarily unavailable." }, 503);
  }
}

export async function PUT(request: Request) { return changeAvatar(request, false); }
export async function DELETE(request: Request) { return changeAvatar(request, true); }

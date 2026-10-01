import type { Address } from "viem";
import { KORUM_CHAIN_ID } from "../../../../config/korum-network";
import { getWalletSession, getRequestOrigin, isSameOriginRequest } from "../../../../lib/auth/session";
import { consumeRateLimit, invalidateIndexedDebateCaches, redisCacheKey } from "../../../../lib/cache/redis";
import { KORUM_CORE_ABI, KORUM_CORE_ADDRESS, KORUM_FACTORY_ADDRESS } from "../../../../lib/contracts/korum";
import { getKorumServerPublicClient } from "../../../../lib/contracts/server-client";
import { getVersusSocialsState, saveVersusSocials } from "../../../../lib/db/versus-socials";
import { createSocialsEditMessage, normalizeSocialLinks } from "../../../../lib/versus-socials";

type RouteParams = { params: Promise<{ id: string }> };
type Curve = { creator: Address };

function json(body: object, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", ...extraHeaders } });
}

function validVersusId(id: string) {
  return /^\d{1,78}$/.test(id);
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getWalletSession();
  if (!session) return json({ error: "Authentication required." }, 401);
  const { id } = await params;
  if (!validVersusId(id)) return json({ error: "Invalid Versus ID." }, 400);
  try {
    const state = await getVersusSocialsState(id);
    return state ? json({ links: state.links, version: state.version }) : json({ error: "Versus not found." }, 404);
  } catch (error) {
    console.error("Unable to load Versus socials.", error);
    return json({ error: "Social links are temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  if (!isSameOriginRequest(request)) return json({ error: "Invalid request origin." }, 403);
  const session = await getWalletSession();
  if (!session) return json({ error: "Authentication required." }, 401);
  const { id } = await params;
  if (!validVersusId(id)) return json({ error: "Invalid Versus ID." }, 400);

  try {
    const limit = await consumeRateLimit(redisCacheKey("rate-limit", "versus-socials", session.userId), 1, 10, 600);
    if (!limit.allowed) return json({ error: "Too many social link updates. Try again later." }, 429, { "Retry-After": String(limit.retryAfterSeconds) });

    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Social link update is too large." }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid social link update." }, 400);
    const fields = body as Record<string, unknown>;
    const links = normalizeSocialLinks(fields.links);
    const version = fields.version;
    const deadline = fields.deadline;
    const signature = fields.signature;
    if (!links || !Number.isSafeInteger(version) || (version as number) < 0 ||
      !Number.isSafeInteger(deadline) || typeof signature !== "string" || !/^0x(?:[0-9a-fA-F]{2}){1,1023}$/.test(signature)) {
      return json({ error: "Invalid social links, version or signature." }, 400);
    }
    const now = Date.now();
    if ((deadline as number) <= now || (deadline as number) > now + 5 * 60_000) {
      return json({ error: "The signature request has expired. Sign again." }, 400);
    }

    const state = await getVersusSocialsState(id);
    if (!state) return json({ error: "Versus not found." }, 404);
    if (state.version !== version) return json({ error: "Social links changed. Refresh and sign again." }, 409);

    const message = createSocialsEditMessage({
      origin: getRequestOrigin(request), chainId: KORUM_CHAIN_ID,
      factory: KORUM_FACTORY_ADDRESS, versusId: id,
      wallet: session.address, version: version as number,
      deadline: deadline as number, links,
    });
    const client = getKorumServerPublicClient();
    const validSignature = await client.verifyMessage({ address: session.address, message, signature: signature as `0x${string}` });
    if (!validSignature) return json({ error: "Invalid wallet signature." }, 401);

    // The historical launch creator is not an administrator. Either current
    // camp fee recipient may edit the common social links.
    const checks = await Promise.allSettled([state.tokenA, state.tokenB].map(token => client.readContract({
      address: KORUM_CORE_ADDRESS, abi: KORUM_CORE_ABI, functionName: "getCurve", args: [token as Address],
    })));
    const ownsCamp = checks.some(result => result.status === "fulfilled" &&
      (result.value as Curve).creator.toLowerCase() === session.address.toLowerCase());
    if (!ownsCamp) {
      if (checks.some(result => result.status === "rejected")) return json({ error: "Could not verify current creator fee rights on-chain." }, 503);
      return json({ error: "Only a current camp fee recipient can edit these links." }, 403);
    }

    const saved = await saveVersusSocials({
      versusId: id, expectedVersion: version as number, currentSocialsJson: state.socialsJson,
      links, wallet: session.address, signature, deadline: deadline as number,
    });
    if (!saved) return json({ error: "Social links changed. Refresh and sign again." }, 409);
    await invalidateIndexedDebateCaches();
    return json({ links, socialsJson: saved.socialsJson, version: saved.version });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON body." }, 400);
    console.error("Unable to update Versus socials.", error);
    return json({ error: "Social links could not be saved." }, 503);
  }
}

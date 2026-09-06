import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 12;
const CHALLENGE_LIFETIME_SECONDS = 60 * 5;

export const SESSION_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Host-korum-session"
  : "korum-session";

export const CHALLENGE_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Secure-korum-challenge"
  : "korum-challenge";

export type WalletSession = {
  userId: string;
  address: `0x${string}`;
  chainId: number;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
};

export type WalletChallenge = {
  address: `0x${string}`;
  chainId: number;
  nonce: string;
  domain: string;
  uri: string;
  issuedAt: number;
  expiresAt: number;
};

function getSessionSecret() {
  const secret = process.env.KORUM_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("KORUM_SESSION_SECRET must contain at least 32 random bytes.");
  }
  return secret;
}

function signatureFor(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

function signPayload(payload: object) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signatureFor(encodedPayload)}`;
}

function verifyPayload<T extends { expiresAt: number }>(token: string | undefined): T | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;

  const encodedPayload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = signatureFor(encodedPayload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function createWalletChallenge(address: `0x${string}`, chainId: number, domain: string, uri: string) {
  const issuedAt = Date.now();
  const challenge: WalletChallenge = {
    address,
    chainId,
    domain,
    uri,
    nonce: randomBytes(16).toString("hex"),
    issuedAt,
    expiresAt: issuedAt + CHALLENGE_LIFETIME_SECONDS * 1000,
  };

  return { challenge, token: signPayload(challenge) };
}

export function readWalletChallenge(token: string | undefined) {
  return verifyPayload<WalletChallenge>(token);
}

export function createWalletSession(userId: string, address: `0x${string}`, chainId: number) {
  const issuedAt = Date.now();
  const session: WalletSession = {
    userId,
    address,
    chainId,
    issuedAt,
    expiresAt: issuedAt + SESSION_LIFETIME_SECONDS * 1000,
    sessionId: randomBytes(24).toString("base64url"),
  };

  return { session, token: signPayload(session) };
}

export function readWalletSession(token: string | undefined) {
  const session = verifyPayload<WalletSession>(token);
  const validUserId = typeof session?.userId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session.userId);
  const validAddress = typeof session?.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(session.address);
  const validChainId = Number.isSafeInteger(session?.chainId) && Number(session?.chainId) > 0;
  if (!session || !validUserId || !validAddress || !validChainId) {
    return null;
  }
  return session;
}

export async function getWalletSession() {
  const cookieStore = await cookies();
  return readWalletSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export function createSignInMessage(challenge: WalletChallenge) {
  return `${challenge.domain} wants you to sign in with your Ethereum account:\n${challenge.address}\n\nSign in to Korum. This request will not trigger a blockchain transaction.\n\nURI: ${challenge.uri}\nVersion: 1\nChain ID: ${challenge.chainId}\nNonce: ${challenge.nonce}\nIssued At: ${new Date(challenge.issuedAt).toISOString()}\nExpiration Time: ${new Date(challenge.expiresAt).toISOString()}`;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_LIFETIME_SECONDS,
  priority: "high" as const,
};

export const challengeCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: CHALLENGE_LIFETIME_SECONDS,
  priority: "high" as const,
};

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

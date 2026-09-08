import process from "node:process";
import postgres from "postgres";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const appUrl = process.env.KORUM_TEST_APP_URL || "http://localhost:3000";
const tunnelHost = process.env.KORUM_DB_TUNNEL_HOST;

if (!tunnelHost) {
  throw new Error("KORUM_DB_TUNNEL_HOST is required to clean up the authentication test user.");
}

const database = postgres({
  host: tunnelHost,
  port: Number(process.env.KORUM_DB_TUNNEL_PORT || 15432),
  database: process.env.PGDATABASE,
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: "require",
  max: 1,
  prepare: false,
});

const account = privateKeyToAccount(generatePrivateKey());
const wallet = account.address.toLowerCase();

function cookieFrom(response, name) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = setCookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Missing ${name} response cookie.`);
  return cookie.split(";", 1)[0];
}

async function jsonResponse(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed with status ${response.status}.`);
  return body;
}

try {
  const nonceResponse = await fetch(`${appUrl}/api/auth/challenge`, {
    headers: { Origin: appUrl },
  });
  if (!nonceResponse.ok) {
    throw new Error(`Nonce request failed with status ${nonceResponse.status}.`);
  }
  const nonce = await nonceResponse.text();
  const nonceCookie = cookieFrom(nonceResponse, "korum-challenge");

  const challengeResponse = await fetch(`${appUrl}/api/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: appUrl, Cookie: nonceCookie },
    body: JSON.stringify({ nonce, address: account.address, chainId: 46630 }),
  });
  const challenge = await jsonResponse(challengeResponse);
  const challengeCookie = cookieFrom(challengeResponse, "korum-challenge");
  const signature = await account.signMessage({ message: challenge.message });

  const verificationResponse = await fetch(`${appUrl}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: appUrl, Cookie: challengeCookie },
    body: JSON.stringify({ message: challenge.message, signature }),
  });
  await jsonResponse(verificationResponse);
  const sessionCookie = cookieFrom(verificationResponse, "korum-session");

  const profileResponse = await fetch(`${appUrl}/api/profile`, {
    headers: { Cookie: sessionCookie },
  });
  const profile = await jsonResponse(profileResponse);
  if (profile.user.evmWallet !== wallet || profile.user.referralCode !== wallet) {
    throw new Error("Authenticated profile identity does not match the signed wallet.");
  }

  const updateResponse = await fetch(`${appUrl}/api/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: appUrl, Cookie: sessionCookie },
    body: JSON.stringify({ bio: "Authentication flow check" }),
  });
  const updatedProfile = await jsonResponse(updateResponse);
  if (updatedProfile.user.id !== profile.user.id || updatedProfile.user.bio !== "Authentication flow check") {
    throw new Error("Authenticated profile update did not preserve the user identity.");
  }

  process.stdout.write("Authentication flow check passed: signature, user upsert, session, profile read, and profile update are valid.\n");
} finally {
  await database`DELETE FROM users WHERE evm_wallet = ${wallet}`;
  await database.end({ timeout: 5 });
}

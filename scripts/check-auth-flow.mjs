import { readFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import process from "node:process";
import postgres from "postgres";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const appUrl = process.env.KORUM_TEST_APP_URL || "http://localhost:3000";
const chainId = process.env.NEXT_PUBLIC_KORUM_NETWORK === "mainnet" ? 4663 : 46630;
const deployment = JSON.parse(await readFile(new URL(`../contracts/deployments/${chainId}.json`, import.meta.url)));
const schema = deployment.readModelSchema;
const databaseUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const tunnelHost = process.env.KORUM_DB_TUNNEL_HOST;
const usesSecureCookies = new URL(appUrl).protocol === "https:";
const challengeCookieName = usesSecureCookies ? "__Secure-korum-challenge" : "korum-challenge";
const sessionCookieName = usesSecureCookies ? "__Host-korum-session" : "korum-session";
const referralCookieName = usesSecureCookies ? "__Host-korum-referral" : "korum-referral";
const referralNotificationCookieName = usesSecureCookies
  ? "__Host-korum-referral-notification"
  : "korum-referral-notification";

if (!databaseUrl && !tunnelHost) {
  throw new Error("DATABASE_URL, DATABASE_PUBLIC_URL, or KORUM_DB_TUNNEL_HOST is required to clean up the authentication test user.");
}

const options = {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
};

const database = tunnelHost
  ? postgres({
      ...options,
      host: tunnelHost,
      port: Number(process.env.KORUM_DB_TUNNEL_PORT || 15432),
      database: process.env.PGDATABASE,
      username: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: "require",
    })
  : postgres(databaseUrl, options);

const account = privateKeyToAccount(generatePrivateKey());
const wallet = account.address.toLowerCase();
const referrerAccount = privateKeyToAccount(generatePrivateKey());
const referrerWallet = referrerAccount.address.toLowerCase();
const referralAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateReferralCode() {
  return Array.from({ length: 6 }, () => referralAlphabet[randomInt(referralAlphabet.length)]).join("");
}

async function createReferrerUser() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = generateReferralCode();
    try {
      await database`
        INSERT INTO users (evm_wallet, referral_code)
        VALUES (${referrerWallet}, ${referralCode})
      `;
      return referralCode;
    } catch (error) {
      if (error?.code !== "23505" || error?.constraint_name !== "users_referral_code_unique") throw error;
    }
  }

  throw new Error("Unable to allocate a referral code for the authentication test.");
}

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

function redirectLocation(response) {
  const location = response.headers.get("location");
  if (!location) throw new Error("Missing redirect location.");
  return new URL(location, appUrl);
}

function cookieHeader(...cookies) {
  return cookies.filter(Boolean).join("; ");
}

try {
  const anonymousWatchlistResponse = await fetch(`${appUrl}/api/watchlist`);
  if (anonymousWatchlistResponse.status !== 401) {
    throw new Error("The watchlist API accepted an unauthenticated request.");
  }

  const referralCode = await createReferrerUser();
  const referralEntryResponse = await fetch(`${appUrl}/explore?view=grid&ref=${referralCode}`, {
    redirect: "manual",
  });
  const captureLocation = redirectLocation(referralEntryResponse);
  if (captureLocation.pathname !== "/api/referrals/capture") {
    throw new Error("Referral entry did not route through server-side capture.");
  }

  const captureResponse = await fetch(captureLocation, { redirect: "manual" });
  const referralCookie = cookieFrom(captureResponse, referralCookieName);
  const referralNotificationCookie = cookieFrom(captureResponse, referralNotificationCookieName);
  const referralDestination = redirectLocation(captureResponse);
  if (
    referralDestination.pathname !== "/explore"
    || referralDestination.searchParams.get("view") !== "grid"
    || referralDestination.searchParams.has("ref")
  ) {
    throw new Error("Referral capture did not preserve and sanitize the destination URL.");
  }

  const notificationResponse = await fetch(`${appUrl}/api/notifications`, {
    headers: { Cookie: referralNotificationCookie },
  });
  const notification = await jsonResponse(notificationResponse);
  if (
    notification.notification?.type !== "referral"
    || !notification.notification?.message.includes(referralCode)
  ) {
    throw new Error("Referral capture did not expose its confirmation notification.");
  }

  const notificationClearResponse = await fetch(`${appUrl}/api/notifications`, {
    method: "DELETE",
    headers: { Origin: appUrl, Cookie: referralNotificationCookie },
  });
  await jsonResponse(notificationClearResponse);

  const nonceResponse = await fetch(`${appUrl}/api/auth/challenge`, {
    headers: { Origin: appUrl, Cookie: referralCookie },
  });
  if (!nonceResponse.ok) {
    throw new Error(`Nonce request failed with status ${nonceResponse.status}.`);
  }
  const nonce = await nonceResponse.text();
  const nonceCookie = cookieFrom(nonceResponse, challengeCookieName);

  const challengeResponse = await fetch(`${appUrl}/api/auth/challenge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: appUrl,
      Cookie: cookieHeader(nonceCookie, referralCookie),
    },
    body: JSON.stringify({ nonce, address: account.address, chainId: 46630 }),
  });
  const challenge = await jsonResponse(challengeResponse);
  const challengeCookie = cookieFrom(challengeResponse, challengeCookieName);
  const signature = await account.signMessage({ message: challenge.message });

  const verificationResponse = await fetch(`${appUrl}/api/auth/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: appUrl,
      Cookie: cookieHeader(challengeCookie, referralCookie),
    },
    body: JSON.stringify({ message: challenge.message, signature }),
  });
  await jsonResponse(verificationResponse);
  const sessionCookie = cookieFrom(verificationResponse, sessionCookieName);

  const profileResponse = await fetch(`${appUrl}/api/profile`, {
    headers: { Cookie: sessionCookie },
  });
  const profile = await jsonResponse(profileResponse);
  if (profile.user.evmWallet !== wallet || !/^[A-Za-z0-9]{6}$/.test(profile.user.referralCode)) {
    throw new Error("Authenticated profile identity does not match the signed wallet.");
  }

  const pendingResponse = await fetch(`${appUrl}/api/referrals/pending`, {
    headers: { Cookie: cookieHeader(sessionCookie, referralCookie) },
  });
  const pending = await jsonResponse(pendingResponse);
  if (pending.referral?.code !== referralCode || pending.referral?.referrerWallet !== referrerWallet) {
    throw new Error("Pending referral did not resolve to the referral-code owner.");
  }

  const createPageResponse = await fetch(`${appUrl}/create`, {
    headers: { Cookie: cookieHeader(sessionCookie, referralCookie) },
  });
  const createPage = await createPageResponse.text();
  if (!createPageResponse.ok || !createPage.includes('data-app="pending-referral"') || !createPage.includes(referralCode)) {
    throw new Error("Create page did not expose the pending referral state.");
  }

  const clearResponse = await fetch(`${appUrl}/api/referrals/pending`, {
    method: "DELETE",
    headers: { Origin: appUrl, Cookie: cookieHeader(sessionCookie, referralCookie) },
  });
  await jsonResponse(clearResponse);

  const selfEntryResponse = await fetch(`${appUrl}/create?ref=${profile.user.referralCode}`, {
    redirect: "manual",
    headers: { Cookie: sessionCookie },
  });
  const selfCaptureResponse = await fetch(redirectLocation(selfEntryResponse), {
    redirect: "manual",
    headers: { Cookie: sessionCookie },
  });
  if (typeof selfCaptureResponse.headers.getSetCookie === "function"
    && selfCaptureResponse.headers.getSetCookie().some((value) => (
      value.startsWith(`${referralCookieName}=`)
      || value.startsWith(`${referralNotificationCookieName}=`)
    ))) {
    throw new Error("A wallet was allowed to capture or confirm its own referral code.");
  }

  const selfPendingResponse = await fetch(`${appUrl}/api/referrals/pending`, {
    headers: { Cookie: sessionCookie },
  });
  const selfPending = await jsonResponse(selfPendingResponse);
  if (selfPending.referral !== null) {
    throw new Error("Self-referral produced a pending attribution.");
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

  const displayNameResponse = await fetch(`${appUrl}/api/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: appUrl, Cookie: sessionCookie },
    body: JSON.stringify({ displayName: "  Korum   Tester  " }),
  });
  const namedProfile = await jsonResponse(displayNameResponse);
  if (namedProfile.user.id !== profile.user.id || namedProfile.user.displayName !== "Korum Tester") {
    throw new Error("Authenticated username update was not normalized or persisted.");
  }

  const [indexedVersus] = await database`
    SELECT
      versus.versus_id::TEXT AS versus_id,
      camp_a.name AS side_a,
      camp_b.name AS side_b
    FROM ${database(schema)}.versuses versus
    INNER JOIN ${database(schema)}.versus_camps camp_a
      ON camp_a.chain_id = versus.chain_id
      AND camp_a.versus_id = versus.versus_id
      AND camp_a.side = 0
    INNER JOIN ${database(schema)}.versus_camps camp_b
      ON camp_b.chain_id = versus.chain_id
      AND camp_b.versus_id = versus.versus_id
      AND camp_b.side = 1
    WHERE versus.chain_id = 46630
    ORDER BY versus.created_at DESC
    LIMIT 1
  `;
  if (!indexedVersus) throw new Error("No indexed Versus is available for the watchlist flow check.");
  const versusId = Number(indexedVersus.versus_id);
  if (!Number.isSafeInteger(versusId)) throw new Error("The indexed Versus ID is not safe for the frontend contract.");

  const addWatchlistResponse = await fetch(`${appUrl}/api/watchlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: appUrl, Cookie: sessionCookie },
    body: JSON.stringify({ versusId }),
  });
  await jsonResponse(addWatchlistResponse);

  const storedWatchlistResponse = await fetch(`${appUrl}/api/watchlist`, {
    headers: { Cookie: sessionCookie },
  });
  const storedWatchlist = await jsonResponse(storedWatchlistResponse);
  if (!storedWatchlist.ids.includes(versusId)) {
    throw new Error("The authenticated watchlist did not return its stored Versus.");
  }
  const storedDebate = storedWatchlist.debates.find((debate) => debate.id === versusId);
  if (storedDebate?.sideA !== indexedVersus.side_a || storedDebate?.sideB !== indexedVersus.side_b) {
    throw new Error("The watchlist did not resolve its display data from the indexed Versus camps.");
  }

  const removeWatchlistResponse = await fetch(`${appUrl}/api/watchlist`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Origin: appUrl, Cookie: sessionCookie },
    body: JSON.stringify({ versusId }),
  });
  await jsonResponse(removeWatchlistResponse);

  const clearedWatchlistResponse = await fetch(`${appUrl}/api/watchlist`, {
    headers: { Cookie: sessionCookie },
  });
  const clearedWatchlist = await jsonResponse(clearedWatchlistResponse);
  if (clearedWatchlist.ids.includes(versusId)) {
    throw new Error("The authenticated watchlist retained a removed Versus.");
  }

  process.stdout.write("Authentication, referral, and watchlist flow check passed: protected reads, writes, removals, notifications, signature, session, and profile updates are valid.\n");
} finally {
  await database`DELETE FROM users WHERE evm_wallet IN (${wallet}, ${referrerWallet})`;
  await database.end({ timeout: 5 });
}

import assert from "node:assert/strict";
import postgres from "postgres";
import sharp from "sharp";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const appUrl = process.env.KORUM_TEST_APP_URL || "http://localhost:3000";
const database = postgres(process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL, { max: 1, connect_timeout: 15 });
const account = privateKeyToAccount(generatePrivateKey());
const wallet = account.address.toLowerCase();
const otherAccount = privateKeyToAccount(generatePrivateKey());
const otherWallet = otherAccount.address.toLowerCase();
const endpoint = `${appUrl}/api/profile/avatar`;
const cookie = (response) => response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
const json = async response => {
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
};

try {
  assert.equal((await fetch(endpoint, { method: "PUT" })).status, 401);
  assert.equal((await fetch(endpoint, { method: "DELETE" })).status, 401);
  const nonceResponse = await fetch(`${appUrl}/api/auth/challenge`);
  const nonce = await nonceResponse.text();
  const challengeResponse = await fetch(`${appUrl}/api/auth/challenge`, {
    method: "POST", headers: { Origin: appUrl, Cookie: cookie(nonceResponse), "Content-Type": "application/json" },
    body: JSON.stringify({ nonce, address: account.address, chainId: 46630 }),
  });
  const challenge = await json(challengeResponse);
  const signature = await account.signMessage({ message: challenge.message });
  const verify = await fetch(`${appUrl}/api/auth/verify`, {
    method: "POST", headers: { Origin: appUrl, Cookie: cookie(challengeResponse), "Content-Type": "application/json" },
    body: JSON.stringify({ message: challenge.message, signature }),
  });
  await json(verify);
  const headers = { Origin: appUrl, Cookie: cookie(verify), "Content-Type": "image/png" };
  assert.equal((await fetch(endpoint, { method: "PUT", headers: { ...headers, Origin: "https://invalid.example" }, body: "invalid" })).status, 403);
  assert.equal((await fetch(endpoint, { method: "PUT", headers, body: "invalid" })).status, 400);
  assert.equal((await fetch(endpoint, { method: "PUT", headers: { ...headers, "Content-Type": "image/svg+xml" }, body: "invalid" })).status, 415);
  const image = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#3377ee" } }).png().toBuffer();
  const saved = await json(await fetch(endpoint, { method: "PUT", headers, body: image }));
  assert.equal(saved.user.evmWallet, wallet);
  assert.equal(saved.user.avatar.mimeType, "image/webp");
  const publicImage = await fetch(`${appUrl}/api/avatars/${wallet}`);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("content-type"), "image/webp");
  assert.equal(publicImage.headers.get("cache-control"), "no-store");
  const bytes = Buffer.from(await publicImage.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
  const [stored] = await database`SELECT a.image FROM user_avatars a JOIN users u ON u.id = a.user_id WHERE u.evm_wallet = ${wallet}`;
  assert.deepEqual(stored.image, bytes);
  // Switch the signed session to a second account; its profile must not inherit A's avatar.
  const otherNonceResponse = await fetch(`${appUrl}/api/auth/challenge`);
  const otherNonce = await otherNonceResponse.text();
  const otherChallengeResponse = await fetch(`${appUrl}/api/auth/challenge`, {
    method: "POST", headers: { Origin: appUrl, Cookie: cookie(otherNonceResponse), "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: otherNonce, address: otherAccount.address, chainId: 46630 }),
  });
  const otherChallenge = await json(otherChallengeResponse);
  const otherSignature = await otherAccount.signMessage({ message: otherChallenge.message });
  const otherVerify = await fetch(`${appUrl}/api/auth/verify`, {
    method: "POST", headers: { Origin: appUrl, Cookie: cookie(otherChallengeResponse), "Content-Type": "application/json" },
    body: JSON.stringify({ message: otherChallenge.message, signature: otherSignature }),
  });
  await json(otherVerify);
  const otherHeaders = { ...headers, Cookie: cookie(otherVerify) };
  const otherProfile = await json(await fetch(`${appUrl}/api/profile`, { headers: otherHeaders }));
  assert.equal(otherProfile.user.evmWallet, otherWallet);
  assert.equal(otherProfile.user.avatar, null);
  assert.equal((await fetch(`${appUrl}/api/avatars/${otherWallet}`)).status, 404);
  const otherImage = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ee3322" } }).png().toBuffer();
  const otherSaved = await json(await fetch(endpoint, { method: "PUT", headers: otherHeaders, body: otherImage }));
  assert.equal(otherSaved.user.evmWallet, otherWallet);
  const otherBytes = Buffer.from(await (await fetch(`${appUrl}/api/avatars/${otherWallet}`)).arrayBuffer());
  assert.notDeepEqual(otherBytes, bytes);
  assert.deepEqual(Buffer.from(await (await fetch(`${appUrl}/api/avatars/${wallet}`)).arrayBuffer()), bytes);
  assert.equal((await fetch(`${appUrl}/api/avatars/${wallet}`, { headers: { "If-None-Match": publicImage.headers.get("etag") } })).status, 304);
  const replacement = await json(await fetch(endpoint, { method: "PUT", headers, body: image }));
  assert.notEqual(replacement.user.avatar.objectKey, saved.user.avatar.objectKey);
  assert.equal((await fetch(`${appUrl}/api/avatars/${wallet}`, { headers: { "If-None-Match": publicImage.headers.get("etag") } })).status, 200);
  const removed = await json(await fetch(endpoint, { method: "DELETE", headers }));
  assert.equal(removed.user.avatar, null);
  assert.equal((await fetch(`${appUrl}/api/avatars/${wallet}`)).status, 404);
  const [remaining] = await database`SELECT count(*)::int AS count FROM user_avatars a JOIN users u ON u.id = a.user_id WHERE u.evm_wallet = ${wallet}`;
  assert.equal(remaining.count, 0);
  for (let i = 0; i < 5; i++) await fetch(endpoint, { method: "PUT", headers, body: "invalid" });
  const throttled = await fetch(endpoint, { method: "PUT", headers, body: image });
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get("retry-after")) > 0);
  console.log("Avatar flow passed: two-wallet isolation, no-store images, authentication, upload, persisted bytes, replacement, deletion and rate limit.");
} finally {
  await database`DELETE FROM users WHERE evm_wallet = ${wallet}`;
  await database`DELETE FROM users WHERE evm_wallet = ${otherWallet}`;
  await database.end();
}

// Real PostgreSQL + real EOA signatures; isolated database on localhost only.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import postgres from 'postgres';
import ts from 'typescript';
import { verifyMessage } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const url = new URL(process.env.KORUM_TEST_DATABASE_URL || 'postgres://korum_test@127.0.0.1:16482/postgres');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only a local test cluster is allowed');
const admin = postgres(url.href, { max: 1, onnotice() {} });
const name = `korum_auth_test_${randomUUID().replaceAll('-', '')}`;
await admin.unsafe(`CREATE DATABASE "${name}"`);
url.pathname = '/' + name;
const db = postgres(url.href, { max: 4, onnotice() {} });
async function load(path, dependencies = {}) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, Buffer, Date, JSON, RangeError, SyntaxError, Error,
    process: { env: { KORUM_SESSION_SECRET: 'test-only-secret-'.repeat(4) } }, console: { error() {} },
    URL, require: key => {
      if (key === 'server-only') return {};
      if (key in dependencies) return dependencies[key];
      if (key.startsWith('node:') || key === 'viem') return require(key);
      throw Error(`Missing dependency ${key}`);
    } });
  return exports;
}
try {
  for (const file of (await readdir(new URL('../db/migrations/', import.meta.url))).filter(x => x.endsWith('.sql')).sort()) {
    const migration = await readFile(new URL('../db/migrations/' + file, import.meta.url), 'utf8');
    await db.begin(tx => tx.unsafe(migration));
  }
  const users = await load('app/lib/db/users.ts', { './client': { getDatabase: () => db } });
  const session = await load('app/lib/auth/session.ts', { 'next/headers': {}, '../../config/korum-network': { KORUM_CHAIN_ID: 46630 } });
  const bodies = await load('app/lib/auth/request-body.ts');
  let allowed = true, contractValid = false, rpcCalls = 0;
  const route = await load('app/api/auth/verify/route.ts', {
    viem: { verifyMessage }, 'next/server': { NextResponse }, '../../../lib/db/users': users,
    '../../../lib/contracts/server-client': { getKorumServerPublicClient: () => ({ verifyMessage: async () => { rpcCalls++; return contractValid; } }) },
    '../../../lib/auth/session': session, '../../../lib/auth/request-body': bodies,
    '../../../lib/cache/redis': { redisCacheKey: (...parts) => parts.join(':'), consumeRateLimit: async () => ({ allowed, retryAfterSeconds: 60 }) },
    '../../../lib/request-identity': { requestIdentity: () => 'test-ip' },
  });
  const account = privateKeyToAccount(generatePrivateKey());
  const origin = 'https://korum.test';
  async function fixture() {
    const { nonce } = session.createWalletNonce('korum.test', origin);
    const { challenge, token } = session.createWalletChallenge(account.address, 46630, nonce);
    const message = session.createSignInMessage(challenge);
    return { challenge, token, message, signature: await account.signMessage({ message }) };
  }
  const request = (f, overrides = {}) => new NextRequest(origin + '/api/auth/verify', { method: 'POST', headers: {
    origin, cookie: `${session.CHALLENGE_COOKIE_NAME}=${f.token}`, 'content-type': 'application/json',
  }, body: JSON.stringify({ message: f.message, signature: f.signature, ...overrides }) });
  const first = await fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () => route.POST(request(first))));
  assert.equal(results.filter(r => r.status === 200).length, 1, 'Concurrent copies of a valid signature create only one session');
  assert.equal(results.filter(r => r.status === 401).length, 7);
  assert.equal((await route.POST(request(first))).status, 401, 'Sequential replay is rejected');
  assert.equal(rpcCalls, 0, 'Valid EOA signatures never require RPC');
  assert.equal((await db`select * from public.consumed_wallet_nonces`).length, 1);

  // Failed user writes roll back nonce consumption and remain retryable.
  await db.unsafe(`CREATE FUNCTION fail_auth_test() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
    CREATE TRIGGER fail_auth_test BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fail_auth_test();`);
  const retry = await fixture();
  assert.equal((await route.POST(request(retry))).status, 503);
  const nonceHash = createHash('sha256').update(retry.challenge.nonce).digest('hex');
  assert.equal((await db`select * from public.consumed_wallet_nonces where nonce_hash=${nonceHash}`).length, 0);
  await db.unsafe('DROP TRIGGER fail_auth_test ON users; DROP FUNCTION fail_auth_test();');
  assert.equal((await route.POST(request(retry))).status, 200);

  const invalid = await fixture();
  assert.equal((await route.POST(request(invalid, { signature: '0x123' }))).status, 400);
  assert.equal((await route.POST(request(invalid, { signature: '0x' + 'aa'.repeat(16385) }))).status, 400);
  assert.equal(rpcCalls, 0);
  allowed = false;
  assert.equal((await route.POST(request(invalid))).status, 429);
  allowed = true;
  assert.equal((await route.POST(request(invalid, { signature: '0x1234' }))).status, 401);
  contractValid = true;
  assert.equal((await route.POST(request(invalid, { signature: '0x1234' }))).status, 200, 'Variable-length contract signatures retain RPC verification');
  assert.equal(rpcCalls, 2);
  const oversized = new NextRequest(origin + '/api/auth/verify', { method: 'POST', body: 'x'.repeat(49153) });
  assert.equal((await route.POST(oversized)).status, 413);
  const malformed = new NextRequest(origin + '/api/auth/verify', { method: 'POST', body: '{' });
  assert.equal((await route.POST(malformed)).status, 400);
  assert.equal(await users.upsertUserAfterWalletVerification(account.address, 46630, { nonce: randomUUID(), expiresAt: Date.now() - 1000 }), null);
  let cancelled = false;
  const stream = new Request(origin, { method: 'POST', duplex: 'half', headers: { 'content-length': '1' }, body: new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(25000)); }, cancel() { cancelled = true; },
  }) });
  await assert.rejects(bodies.readAuthBody(stream), RangeError);
  assert.equal(cancelled, true);
  console.log('Auth replay passed: real EOA signatures, 8 concurrent requests, durable consumption, transaction rollback/retry, expiry, contract signatures, rate limits and bounded streams.');
} finally {
  await db.end({ timeout: 2 });
  await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end({ timeout: 2 });
}

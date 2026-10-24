// Real QueryClient/observers and application session/route; all HTTP and SQL are mocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText, { exports, console, URL, Response, ...globals, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  return exports;
}
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const a = `0x${'a'.repeat(40)}`, b = `0x${'b'.repeat(40)}`;
let handler;
const { WatchlistSession } = await load('app/lib/watchlist/client.ts', {}, { fetch: (...args) => handler(...args) });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const notifications = [];
const session = address => new WatchlistSession(client, '46630:v2', address, () => {}, (...args) => notifications.push(args));
let alice = session(a);
let reads = 0;
handler = async (url, options) => {
  assert.equal(url, '/api/watchlist?view=ids');
  assert.equal(options.headers['X-Korum-Wallet'], a);
  assert.ok(options.signal);
  reads++;
  await tick();
  return Response.json({ ids: [1, 2] });
};
const observers = Array.from({ length: 12 }, () => new QueryObserver(client, alice.idsOptions()));
const stop = observers.map(observer => observer.subscribe(() => {}));
await client.fetchQuery(alice.idsOptions());
assert.equal(reads, 1, '12 subscribers share one IDs request');
assert.ok(observers.every(observer => observer.getCurrentResult().data.join(',') === '1,2'));
stop.forEach(unsubscribe => unsubscribe());

// A failed refresh keeps the last known memberships instead of showing an empty list.
handler = async () => Response.json({ error: 'unavailable' }, { status: 503 });
await assert.rejects(client.fetchQuery({ ...alice.idsOptions(), staleTime: 0 }));
assert.deepEqual(Array.from(client.getQueryData(alice.idsKey)), [1, 2]);

let release;
handler = () => new Promise(resolve => { release = resolve; });
const lateRead = client.fetchQuery({ ...alice.idsOptions(), staleTime: 0 }).catch(() => {});
await tick();
alice.dispose();
const bob = session(b);
client.setQueryData(bob.idsKey, [8]);
release(Response.json({ ids: [42] }));
await lateRead; await tick();
assert.equal(client.getQueryData(alice.idsKey), undefined, 'A late response cannot recreate the old session cache');
assert.deepEqual(client.getQueryData(bob.idsKey), [8]);

// Full details also cannot repopulate memberships after a session change.
alice = session(a);
handler = () => new Promise(resolve => { release = resolve; });
const lateDetails = client.fetchQuery(alice.detailsOptions()).catch(() => {});
await tick(); alice.dispose(); release(Response.json({ ids: [42], debates: [] }));
await lateDetails; await tick();
assert.equal(client.getQueryData(alice.idsKey), undefined);
assert.deepEqual(client.getQueryData(bob.idsKey), [8]);

alice = session(a);
client.setQueryData(alice.idsKey, [1]);
const writes = [];
handler = async (_url, options) => {
  writes.push({ method: options.method, id: JSON.parse(options.body).versusId });
  await tick();
  return Response.json({}, { status: writes.length === 2 ? 503 : 200 });
};
const outcomes = await Promise.all([alice.mutate(2, 'Second', 'add'), alice.mutate(3, 'Third', 'add')]);
assert.deepEqual(outcomes, [true, false]);
assert.deepEqual(Array.from(client.getQueryData(alice.idsKey)), [1, 2], 'A failed second mutation preserves the first successful change');
assert.equal(notifications.length, 1);
handler = async (_url, options) => { writes.push({ method: options.method }); return Response.json({}); };
await Promise.all([alice.mutate(4, undefined, 'toggle'), alice.mutate(4, undefined, 'toggle')]);
assert.deepEqual(writes.slice(-2).map(write => write.method), ['POST', 'DELETE'], 'Rapid toggles use the current shared state in queue order');
assert.deepEqual(Array.from(client.getQueryData(alice.idsKey)), [1, 2]);

// A pending mutation and queued mutation both belong to A, even after switching to B.
handler = () => new Promise(resolve => { release = resolve; });
const oldWrite = alice.mutate(5, undefined, 'add');
const queuedWrite = alice.mutate(6, undefined, 'add');
await tick();
const notificationsBefore = notifications.length;
alice.dispose();
release(Response.json({ error: 'failure' }, { status: 503 }));
assert.equal(await oldWrite, false);
assert.equal(await queuedWrite, false);
assert.equal(client.getQueryData(alice.idsKey), undefined, 'Late rollback cannot recreate A data');
assert.deepEqual(client.getQueryData(bob.idsKey), [8]);
assert.equal(notifications.length, notificationsBefore);

// On first click, load existing IDs before applying an optimistic edit.
alice = session(a);
handler = async (_url, options) => options.method ? Response.json({}) : Response.json({ ids: [9] });
assert.equal(await alice.mutate(10, undefined, 'add'), true);
assert.deepEqual(Array.from(client.getQueryData(alice.idsKey)), [9, 10]);
alice.dispose(); bob.dispose(); client.clear();

// The IDs-only route must bypass market hydration, and reject a changed cookie wallet.
let identity = { userId: 'alice', address: a };
let idsReads = 0, detailsReads = 0, mutations = 0;
const route = await load('app/api/watchlist/route.ts', {
  'next/server': { NextResponse: Response },
  '../../config/korum-network': { KORUM_CHAIN_ID: 46630 },
  '../../lib/auth/session': { getWalletSession: async () => identity, isSameOriginRequest: () => true },
  '../../lib/db/watchlist': {
    getUserWatchlist: async () => { idsReads++; return [1]; },
    addUserWatchlistItem: async () => { mutations++; return true; },
    removeUserWatchlistItem: async () => { mutations++; },
  },
  '../../lib/db/debates': { getIndexedWatchlistDebates: async () => { detailsReads++; return []; } },
});
const request = (path = '?view=ids', method = 'GET') => new Request(`https://korum.test/api/watchlist${path}`, {
  method, headers: { 'X-Korum-Wallet': a, 'Content-Type': 'application/json' },
  ...(method === 'GET' ? {} : { body: JSON.stringify({ versusId: 1 }) }),
});
const idsResponse = await route.GET(request());
assert.equal(idsResponse.headers.get('cache-control'), 'private, no-store');
assert.deepEqual(await idsResponse.json(), { ids: [1] });
assert.equal(detailsReads, 0);
await route.GET(request(''));
assert.equal(detailsReads, 1);
identity = { userId: 'bob', address: b };
for (const method of ['GET', 'POST', 'DELETE']) assert.equal((await route[method](request('', method))).status, 409);
assert.equal(idsReads, 2);
assert.equal(mutations, 0);
identity = null;
assert.equal((await route.GET(request())).status, 401);
console.log('Watchlist checks passed: deduplicated IDs, retained errors, cancellation, wallet isolation, ordered optimism/rollback, queued writes and IDs-only API.');

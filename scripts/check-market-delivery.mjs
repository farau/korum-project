// Local PostgreSQL/Redis only. Pinata is mocked; no external uploads or wallets.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import postgres from 'postgres';
import Redis from 'ioredis';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const url = new URL(process.env.KORUM_TEST_DATABASE_URL || 'postgres://korum_test@127.0.0.1:16482/postgres');
const redisUrl = new URL(process.env.KORUM_TEST_REDIS_URL || 'redis://127.0.0.1:16481');
for (const target of [url, redisUrl]) assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname), 'Only local test services allowed');
const admin = postgres(url.href, { max: 1, onnotice() {} });
const name = 'korum_delivery_test_' + randomUUID().replaceAll('-', '');
await admin.unsafe(`CREATE DATABASE "${name}"`);
url.pathname = '/' + name;
// A single connection makes a leaked Pinata transaction immediately observable.
const db = postgres(url.href, { max: 1, onnotice() {} });
const peer = postgres(url.href, { max: 1, onnotice() {} });
const redis = new Redis(redisUrl.href, { maxRetriesPerRequest: 1 });
redis.on('error', () => {});
const namespace = 'korum-delivery-test:' + randomUUID();
const key = (...parts) => [namespace, ...parts].join(':');
const chain = 46630, addr = n => '0x' + n.toString(16).padStart(40,'0'), hash = n => '0x' + n.toString(16).padStart(64,'0');
async function load(path, deps = {}) {
 const source = await readFile(new URL('../' + path, import.meta.url),'utf8');
 const code = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};runInNewContext(code,{exports,Buffer,Date,JSON,Map,Set,Promise,console,setTimeout,clearTimeout,process:{env:{}},require:k=>{
  if(k==='server-only')return {}; if(k in deps)return deps[k];if(k.startsWith('node:'))return require(k);throw Error('Missing dependency '+k);
 }});return exports;
}
const trade = (id, extra={}) => ({ event_id:'event-'+id,chain_id:chain,token_address:addr(1),trader_address:addr(3),referrer_address:addr(0),venue:0,kind:0,is_buy:true,
 eth_gross:'100',token_amount:'1',fee_total:'0',fee_creator:'0',fee_referrer:'0',fee_platform:'0',tier_fee_bps:0,tier_creator_share_bps:0,snipe_tax_bps:0,
 sqrt_price_x96_after:String(2n**96n),real_eth_after:'100',token_reserve_after:'100',cumulative_volume_after:'100',traded_at:new Date(),
 transaction_hash:hash(id),block_hash:hash(999),block_number:id,log_index:0,...extra });
try {
 for(const file of (await readdir(new URL('../db/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) {
  const source=await readFile(new URL('../db/migrations/'+file,import.meta.url),'utf8');await db.begin(tx=>tx.unsafe(source));
 }
 // A06: leave Pinata pending, then read via the only connection in the pool.
 let release, pins=0;
 const gate=new Promise(resolve=>{release=resolve});
 const pin=async()=>{pins++;await gate;return {cid:'bafkrei'+'a'.repeat(52),pinataFileId:'test-id'}};
 const deps={'./client':{getDatabase:()=>db},'../pinata':{pinTokenImage:pin}};
 const first=await load('app/lib/db/token-images.ts',deps),second=await load('app/lib/db/token-images.ts',deps);
 const image=Buffer.from('synthetic WebP boundary'),wallet=addr(3);
 const uploads=Array.from({length:20},()=>first.storeTokenImage(image,wallet));
 for(let i=0;i<200&&pins===0;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(pins,1);
 let timer;
 try {await Promise.race([db`SELECT 1`,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Pinata holds the SQL connection')),1000)})]);}finally{clearTimeout(timer)}
 await assert.rejects(second.storeTokenImage(image,wallet), /already uploading/);
 release();const results=await Promise.all(uploads);assert.equal(results.length,20);assert.equal(pins,1);
 await second.storeTokenImage(image,wallet);assert.equal(pins,1,'Another replica reuses the committed image');
 assert.equal((await db`SELECT * FROM public.token_image_upload_leases`).length,0);
 // Crashed lease is reclaimed; stale owner must not finalize or erase its replacement.
 let releaseOld, oldStarted=false;
 const old=await load('app/lib/db/token-images.ts',{'./client':{getDatabase:()=>db},'../pinata':{pinTokenImage:async()=>{oldStarted=true;await new Promise(r=>{releaseOld=r});return {cid:'bafkrei'+'b'.repeat(52),pinataFileId:'old'}}}});
 const oldRequest=old.storeTokenImage(Buffer.from('stale'),wallet);
 const rejected=assert.rejects(oldRequest,/reservation expired/);
 while(!oldStarted)await new Promise(r=>setTimeout(r,5));
 const replacement=randomUUID();await db`UPDATE public.token_image_upload_leases SET owner=${replacement}`;
 releaseOld();await rejected;
 assert.equal((await db`SELECT owner::TEXT FROM public.token_image_upload_leases`)[0].owner,replacement);
 await db`UPDATE public.token_image_upload_leases SET expires_at=NOW()-INTERVAL '1 second'`;
 let freshPins=0;
 const fresh=await load('app/lib/db/token-images.ts',{'./client':{getDatabase:()=>db},'../pinata':{pinTokenImage:async()=>({cid:'bafkrei'+String.fromCharCode(99+freshPins++).repeat(52),pinataFileId:'new'})}});
 await fresh.storeTokenImage(Buffer.from('stale'),wallet);
 // A failed commit is never reported as success, and releases the reservation.
 await db.unsafe(`CREATE FUNCTION fail_upload_test() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test commit failure'; END $$;
 CREATE CONSTRAINT TRIGGER fail_upload_test AFTER INSERT ON public.token_images DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_upload_test();`);
 await assert.rejects(fresh.storeTokenImage(Buffer.from('failure'),wallet), /test commit failure/);
 assert.equal((await db`SELECT * FROM public.token_image_upload_leases`).length,0);
 await db.unsafe('DROP TRIGGER fail_upload_test ON public.token_images; DROP FUNCTION fail_upload_test();');
 const failed=await load('app/lib/db/token-images.ts',{'./client':{getDatabase:()=>db},'../pinata':{pinTokenImage:async()=>{throw Error('Pinata failed')}}});
 await assert.rejects(failed.storeTokenImage(Buffer.from('provider failure'),wallet), /Pinata failed/);
 assert.equal((await db`SELECT * FROM public.token_image_upload_leases`).length,0);

 // A02: real trigger journal, missed notifications and atomic recovery.
 const chartMath=await load('app/lib/live/chart.ts');
 const chart=await load('app/lib/live/chart-cache.ts',{'./chart':chartMath});
 const delivery=await load('app/lib/db/market-delivery.ts',{'../../config/deployment':{INDEXER_SCHEMA:'indexer_v2'},'../../config/korum-network':{KORUM_CHAIN_ID:chain},
 './client':{getDatabase:()=>db},'../cache/redis':{redisCacheKey:key},'../live/chart-cache':chart});
 const reconcile=await load('app/lib/live/debate-reconcile.ts');
 await db`INSERT INTO indexer_v2.camp_trades ${db(trade(1))}`;
 const initial=await delivery.pendingMarketDeliveries(['event-1']);assert.equal(initial.length,1);
 assert.equal(initial[0].needsReset,false);
 await db`UPDATE indexer_v2.camp_trades SET ingested_at=NOW() WHERE event_id='event-1'`;
 assert.equal((await delivery.pendingMarketDeliveries(['event-1']))[0].version,initial[0].version,'Replayed upserts do not create journal churn');
 await db`UPDATE indexer_v2.camp_trades SET eth_gross=101,token_address=${addr(2)} WHERE event_id='event-1'`;
 await delivery.acknowledgeMarketDeliveries(initial);
 const corrected=await delivery.pendingMarketDeliveries(['event-1']);assert.equal(corrected.length,1,'Old ACK cannot erase a concurrent correction');
 assert.equal(corrected[0].needsReset,true,'Corrections require a reset even if an insertion webhook arrives late');
 assert.deepEqual(Array.from(corrected[0].tokens),[addr(1),addr(2)]);
 await db`DELETE FROM indexer_v2.camp_trades WHERE event_id='event-1'`;
 assert.notEqual((await delivery.pendingMarketDeliveries(['event-1']))[0].version,corrected[0].version);
 // Transaction rollback also rolls back its outbox record.
 await assert.rejects(db.begin(async tx=>{await tx`INSERT INTO indexer_v2.camp_trades ${tx(trade(2))}`;throw Error('rollback')}));
 assert.equal((await delivery.pendingMarketDeliveries(['event-2'])).length,0);
 await db`INSERT INTO indexer_v2.camp_trades ${db(trade(3,{chain_id:4663}))}`;
 await db`UPDATE indexer_v2.market_delivery_outbox SET first_pending_at=NOW()-INTERVAL '31 seconds'`;
 await redis.set(key('live','debate-metadata-fingerprint-v1'),'same');
 await redis.set(key('live','snapshot-metadata'),'old');
 await redis.set(chart.tokenRevisionKey(key,addr(9)),'untouched');
 let probes=0,recoveries=0;
 const probe=async()=>{probes++;return 'same'};
 const recover=async(lease,owner)=>{recoveries++;await delivery.recoverMarketDeliveries(redis,lease,owner)};
 const replicas=await Promise.all(Array.from({length:4},()=>load('app/lib/live/debate-reconcile.ts')));
 await Promise.all(Array.from({length:100},(_,i)=>replicas[i%4].reconcileDebateMetadata(redis,key,probe,recover)));
 assert.equal(probes,1);assert.equal(recoveries,1);
 assert.equal((await delivery.pendingMarketDeliveries(['event-1'])).length,0);
 assert.notEqual(await redis.get(key('live','snapshot-metadata')),'old');
 assert.ok(await redis.get(chart.tokenRevisionKey(key,addr(1))));assert.ok(await redis.get(chart.tokenRevisionKey(key,addr(2))));
 assert.equal(await redis.get(chart.tokenRevisionKey(key,addr(9))),'untouched');
 assert.equal((await db`SELECT * FROM indexer_v2.market_delivery_outbox WHERE chain_id=4663`).length,1);
 const metadata=await redis.get(key('live','snapshot-metadata'));
 await redis.del(key('live','debate-metadata-probe-v1'));
 await reconcile.reconcileDebateMetadata(redis,key,probe,recover);
 assert.equal(await redis.get(key('live','snapshot-metadata')),metadata,'No missed event means no periodic cache invalidation');
 // Redis failure must retain SQL work; a lost/expired lease cannot ACK either.
 await db`INSERT INTO indexer_v2.camp_trades ${db(trade(4))}`;
 await db`UPDATE indexer_v2.market_delivery_outbox SET first_pending_at=NOW()-INTERVAL '31 seconds'`;
 await assert.rejects(delivery.recoverMarketDeliveries({eval:async()=>{throw Error('Redis unavailable')}},'lease','owner'));
 await delivery.recoverMarketDeliveries(redis,'missing-lease','owner');
 assert.equal((await delivery.pendingMarketDeliveries(['event-4'])).length,1);
 const current=await delivery.pendingMarketDeliveries(['event-4']);await delivery.acknowledgeMarketDeliveries(current);
 assert.equal((await delivery.pendingMarketDeliveries(['event-4'])).length,0);
 // A large missed burst on one token is drained by one shared invalidation.
 await db.unsafe(`INSERT INTO indexer_v2.market_delivery_outbox (chain_id,event_id,tokens,first_pending_at)
 SELECT $1, 'burst-' || n, ARRAY[$2::TEXT], NOW()-INTERVAL '31 seconds' FROM generate_series(1,1000) n`,[chain,addr(1)]);
 const recoveryLease=key('test-recovery-lease');await redis.set(recoveryLease,'owner','EX',60);
 await delivery.recoverMarketDeliveries(redis,recoveryLease,'owner');
 assert.equal((await db`SELECT COUNT(*)::INT AS count FROM indexer_v2.market_delivery_outbox WHERE chain_id=${chain}`)[0].count,0);
 // A commit AFTER the Redis invalidation remains in the journal. It must not
 // disappear just because its transaction began before the recovery snapshot.
 await db`INSERT INTO indexer_v2.camp_trades ${db(trade(5))}`;
 await db`UPDATE indexer_v2.market_delivery_outbox SET first_pending_at=NOW()-INTERVAL '31 seconds'`;
 let inserted=false;
 await delivery.recoverMarketDeliveries({eval:async(...args)=>{
   const result=await redis.eval(...args);await peer`INSERT INTO indexer_v2.camp_trades ${peer(trade(6))}`;inserted=true;return result;
 }},recoveryLease,'owner');
 assert.equal(inserted,true);
 assert.equal((await delivery.pendingMarketDeliveries(['event-5'])).length,0);
 assert.equal((await delivery.pendingMarketDeliveries(['event-6'])).length,1,'A later commit cannot be ACKed by an earlier recovery snapshot');
 await db`UPDATE indexer_v2.market_delivery_outbox SET first_pending_at=NOW()-INTERVAL '31 seconds'`;
 await assert.rejects(delivery.recoverMarketDeliveries({eval:async(...args)=>{
   const result=await redis.eval(...args);await peer`UPDATE indexer_v2.camp_trades SET eth_gross=102 WHERE event_id='event-6'`;return result;
 }},recoveryLease,'owner'),error=>error.code==='40001');
 assert.equal((await delivery.pendingMarketDeliveries(['event-6'])).length,1,'Concurrent correction rolls back journal deletion');
 await delivery.recoverMarketDeliveries(redis,recoveryLease,'owner');
 assert.equal((await delivery.pendingMarketDeliveries(['event-6'])).length,0);
 console.log('Market delivery passed: Pinata releases the SQL pool, deduplication/leases/crash recovery, outbox insert/update/delete/rollback, stale ACK protection, 100 readers/4 replicas/one probe, chain isolation and Redis failure.');
} finally {
 const keys=await redis.keys(namespace+':*');if(keys.length)await redis.del(...keys);
 await redis.quit();await peer.end({timeout:2});await db.end({timeout:2});await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end({timeout:2});
}

// 300 real PostgreSQL markets, isolated Redis cache, no external RPC or wallets.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import postgres from 'postgres';
import Redis from 'ioredis';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const url=new URL(process.env.KORUM_TEST_DATABASE_URL || 'postgres://korum_test@127.0.0.1:16482/postgres');
const redisUrl=new URL(process.env.KORUM_TEST_REDIS_URL || 'redis://127.0.0.1:16481');
for(const target of [url,redisUrl])assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname));
const admin=postgres(url.href,{max:1,onnotice(){}});
const name='korum_explore_test_'+randomUUID().replaceAll('-','');
await admin.unsafe(`CREATE DATABASE "${name}"`);url.pathname='/'+name;
const db=postgres(url.href,{max:4,onnotice(){},connection:{statement_timeout:20000}}),redis=new Redis(redisUrl.href,{maxRetriesPerRequest:1});
redis.on('error',()=>{});
const namespace='korum-explore-test:'+randomUUID(),key=(...p)=>[namespace,...p].join(':');
const chain=46630,addr=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0'),wad=10n**18n;
async function load(path,deps={},env={}) {
 const exports={};const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
  {exports,console,Date,Map,Set,Promise,URL,URLSearchParams,Response,setTimeout,process:{env},require:n=>{if(n==='server-only')return {};if(n in deps)return deps[n];if(n.startsWith('node:'))return require(n);throw Error(n)}});
 return exports;
}
try {
 for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.begin(async tx=>tx.unsafe(await readFile('db/migrations/'+file,'utf8')));
 const now=Date.now(),creator=addr(90000);
 const versuses=[],camps=[];
 for(let id=1;id<=300;id++){
  versuses.push({chain_id:chain,versus_id:String(id),factory_address:addr(90001),creator_wallet:creator,config_id:0,creator_fee_recipient:creator,
   token_a_address:addr(id*2),token_b_address:addr(id*2+1),created_at:new Date(now-(301-id)*3600_000),title:'Versus '+id,description:'Synthetic',category:id===1?'Mémes':'Crypto',socials_json:'{}',transaction_hash:hash(id),block_hash:hash(99999),block_number:id,log_index:0});
  for(let side=0;side<2;side++)camps.push({chain_id:chain,versus_id:String(id),side,token_address:addr(id*2+side),economics_id:1,quote_asset:addr(0),name:'Token '+id+'-'+side,symbol:'T'+id+side,uri:'',virtual_eth:String(wad),graduation_eth:String(wad),total_supply:String(1000n*wad),transaction_hash:hash(1000+id*2+side),block_hash:hash(99999),block_number:id,log_index:side});
 }
 await db`INSERT INTO indexer_v2.versuses ${db(versuses)}`;
 await db`INSERT INTO indexer_v2.versus_camps ${db(camps)}`;
 const trade=(id,token,volume)=>({event_id:'trade-'+id,chain_id:chain,token_address:token,trader_address:addr(70000),referrer_address:addr(0),venue:0,kind:0,is_buy:true,
  eth_gross:String(volume*wad),token_amount:String(wad),fee_total:'0',fee_creator:'0',fee_referrer:'0',fee_platform:'0',tier_fee_bps:0,tier_creator_share_bps:0,snipe_tax_bps:0,
  sqrt_price_x96_after:String(2n**96n),real_eth_after:String(wad),token_reserve_after:String(999n*wad),cumulative_volume_after:String(volume*wad),traded_at:new Date(now-60_000),transaction_hash:hash(10000+id),block_hash:hash(99999),block_number:10000+id,log_index:0});
 await db`INSERT INTO indexer_v2.camp_trades ${db([trade(1,addr(2),100n),trade(2,addr(3),50n),trade(3,addr(600),1n)])}`;
 // Fresh bulk fixtures need planner statistics, as a populated database would.
 await db.unsafe('ANALYZE');
 const shared=await load('app/lib/explore-page.ts'),math=await load('app/lib/markets/math.ts'),maintained=await load('app/lib/cache/maintained.ts');
 const debateCache=await load('app/lib/live/debate-cache.ts',{'../cache/maintained':maintained});
 const rankCache=await load('app/lib/live/explore-cache.ts',{'../cache/maintained':maintained,'./debate-cache':debateCache});
 const snapshot=await load('app/lib/live/debate-snapshot.ts');
 let modelReads=0;
 const model=await load('app/lib/db/debates.ts',{
  '../../config/deployment':{INDEXER_SCHEMA:'indexer_v2'},'../../config/korum-network':{KORUM_CHAIN_ID:chain,KORUM_CHAIN:{name:'Test'}},react:{cache:fn=>fn},
  '../badges':{calculateBadgeProgress:()=>[]},'../cache/redis':{connectedRedis:async()=>redis,redisCacheKey:key,rememberJson:async(k,t,fn)=>fn()},'../cache/maintained':maintained,'../live/debate-cache':debateCache,'../live/debate-snapshot':snapshot,
  './watchlist':{},'../live/debate-reconcile':{reconcileDebateMetadata:async()=>{}},'./market-delivery':{},'../markets/quote-usd':{getEthUsdQuote:async()=>({value:2000})},'../markets/math':math,'../public-asset-url':{publicAssetUrl:x=>x},'./client':{getDatabase:()=>({unsafe:async(q,args)=>{modelReads++;if(process.env.KORUM_EXPLAIN_EXPLORE){const plan=await db.unsafe('EXPLAIN (FORMAT JSON) '+q,args);await writeFile('/tmp/korum-explore-detail-plan.json',JSON.stringify(plan,null,2));}const start=performance.now();const rows=await db.unsafe(q,args);console.log('Page detail SQL ms:',Math.round(performance.now()-start));return rows}})},
 },{REDIS_URL:redisUrl.href,KORUM_GOLDSKY_WEBHOOK_SECRET:'x'.repeat(32)});
 let queries=0,hydrated=0;
 const dependencies={
  '../../config/deployment':{INDEXER_SCHEMA:'indexer_v2'},'../../config/korum-network':{KORUM_CHAIN_ID:chain},
  '../cache/redis':{redisCacheKey:key,connectedRedis:async()=>redis,rememberJson:async(k,t,fn)=>fn()},'../cache/maintained':maintained,'../live/explore-cache':rankCache,
  '../markets/math':math,'../markets/quote-usd':{getEthUsdQuote:async()=>({value:2000})},'../explore-page':shared,
  './client':{getDatabase:()=>({unsafe:async(q,args)=>{queries++;if(process.env.KORUM_EXPLAIN_EXPLORE && queries===1){const plan=await db.unsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+q,args);await writeFile('/tmp/korum-explore-ranking-plan.json',JSON.stringify(plan,null,2));const result=plan[0]['QUERY PLAN'][0];console.log(JSON.stringify({planning:result['Planning Time'],execution:result['Execution Time'],jit:result.JIT}));}return db.unsafe(q,args)}})},
  './debates':{reconcileIndexedMarkets:async()=>{},getIndexedDebatesByIds:async ids=>{hydrated+=ids.length;return model.getIndexedDebatesByIds(ids)}},
 };
 const env={REDIS_URL:redisUrl.href,KORUM_GOLDSKY_WEBHOOK_SECRET:'x'.repeat(32)};
 const explore=await load('app/lib/db/explore.ts',dependencies,env);
 const before=performance.now(),ranks=await explore.loadExploreRanks();const rankMs=performance.now()-before;
 assert.equal(ranks.length,300);assert.equal(ranks.find(r=>r.id==='1').traders,1,'Same wallet in both camps counted once');
 assert.equal((await explore.loadExploreRanks([addr(2)])).length,1,'Event updates read only affected markets');
 const options={...shared.DEFAULT_EXPLORE_OPTIONS,category:'All',sort:'volume'};
 let selected=explore.selectExplorePage(ranks,options,2000,now);
 assert.equal(selected.ids[0],'1','The active old market is beyond the latest 100 and 250 yet ranks first');
 assert.equal(selected.total,300);assert.equal(selected.totalPages,25);assert.equal(selected.ids.length,12);
 assert.equal(explore.selectExplorePage(ranks,{...options,sort:'holders'},2000,now).ids[0],'300','Ties break by ID descending');
 assert.equal(explore.selectExplorePage(ranks,{...options,category:'Memes'},2000,now).ids[0],'1','Accent-normalized categories');
 assert.equal(explore.selectExplorePage(ranks,{...options,age:'24h'},2000,now).total,23,'Age boundary remains strict');
 assert.equal(explore.selectExplorePage(ranks,{...options,tradersMin:1},2000,now).total,2);
 assert.equal(explore.selectExplorePage(ranks,{...options,marketCapMin:3000},2000,now).total,1);
 assert.equal(explore.selectExplorePage(ranks,{...options,marketCapMin:3000},null,now).total,0,'Quote fallback preserves ETH units');
 assert.equal(explore.selectExplorePage(ranks,{...options,page:999},2000,now).page,25);
 assert.equal(explore.selectExplorePage([],{...options,page:999},2000,now).page,1);
 assert.equal(explore.selectExplorePage(ranks,options,2000,now+86400_000).ids[0],'300','Quiet volumes expire without SQL');
 assert.equal(explore.selectExplorePage(ranks,shared.DEFAULT_EXPLORE_OPTIONS,2000,now).total,12,'HotTake remains globally limited to top 12');
 for(const invalid of ['page=0','page=NaN','sort=DROP','tradersMin=1.5','marketCapMin=Infinity'])assert.throws(()=>shared.parseExploreOptions(new URLSearchParams(invalid)));
 queries=0;hydrated=0;
 const page=await explore.getExplorePage(options);
 assert.equal(modelReads,1,'The cold page hydrates 12 details in one SQL batch without constructing a 250-market catalog');
 assert.equal(await redis.get(debateCache.debateCatalogKey(key)),null);
 assert.equal(page.items.length,12);assert.equal(page.items[0].id,1);assert.equal(page.items[0].volume24h,300000);
 assert.equal(page.items[0].tokenA.marketCap,2000);assert.equal(hydrated,12);
 assert.equal('description' in page.items[0],false);assert.equal('circulatingSupply' in page.items[0].tokenA,false);
 const replicas=await Promise.all(Array.from({length:4},()=>load('app/lib/db/explore.ts',{...dependencies,'../cache/maintained':maintained,'./debates':{reconcileIndexedMarkets:async()=>{},getIndexedDebatesByIds:async()=>[]}},env)));
 await Promise.all(Array.from({length:100},(_,i)=>replicas[i%4].getExplorePage({...options,page:i%25+1})));
 assert.equal(queries,1,'Filters/pages/100 readers reuse the shared SQL ranking');
 const chartMath=await load('app/lib/live/chart.ts'),chart=await load('app/lib/live/chart-cache.ts',{'./chart':chartMath});
 await db`UPDATE indexer_v2.camp_trades SET eth_gross=${String(200n*wad)} WHERE event_id='trade-1'`;
 const changes=await rankCache.prepareExploreMutation(redis,key,[addr(2)],'new-rank',tokens=>explore.loadExploreRanks(tokens));
 assert.equal(changes.mutations.length,1);assert.equal(queries,2);
 const details=await debateCache.prepareDebateMutations(redis,key,[addr(2)],'new-rank',model.loadIndexedDebateRowsByIds);
 const previous=await redis.get(key('live','revision'))??'0';
 assert.equal(await redis.eval(chart.publishChartScript,3,key('live','revision'),key('live','markets'),key('event'),
  'new-rank','{}',previous,1,'signature',JSON.stringify([...changes.revisions,...details.revisions]),JSON.stringify([...changes.mutations,...details.mutations]),JSON.stringify(details.mappings)),1);
 const updated=await explore.getExplorePage(options);
 assert.equal(queries,2,'Publication maintains the ranking without a full SQL rebuild');assert.equal(updated.items[0].volume24h,500000);
 const route=await load('app/api/versus/route.ts',{'../../lib/db/debates':{getIndexedDebatesWithDiagnostic:async()=>[]},'../../lib/db/explore':explore,'../../lib/explore-page':shared});
 assert.equal((await route.GET(new Request('https://test/api/versus?view=explore&page=-1'))).status,400);
 assert.deepEqual(await (await route.GET(new Request('https://test/api/versus'))).json(),[],'Legacy consumers retain the list contract');

 // Analytics uses the complete indexed history, including the old market.
 const analyticsHelpers=await load('app/lib/analytics.ts');
 let analyticsReads=0;
 const analytics=await load('app/lib/db/analytics.ts',{
  '../../config/deployment':{INDEXER_SCHEMA:'indexer_v2'},'../../config/korum-network':{KORUM_CHAIN_ID:chain},
  '../cache/redis':{redisCacheKey:key,rememberJson:async(k,t,fn)=>fn()},'../markets/math':math,'../analytics':analyticsHelpers,
  '../markets/quote-usd':{getEthUsdQuote:async()=>({value:2000})},
  './client':{getDatabase:()=>({unsafe:async(q,args)=>{analyticsReads++;return db.unsafe(q,args)}})},
 });
 let stats=await analytics.getAnalytics('day');
 assert.equal(analyticsReads,2,'Category totals share the aggregate scan, with no third SQL query');
 assert.equal(stats.volumeEth,251);assert.equal(stats.categories.find(row=>row.name==='Mémes').volumeEth,250);
 assert.equal(stats.categories.reduce((sum,row)=>sum+row.volumeEth,0),stats.volumeEth);
 await db`UPDATE indexer_v2.camp_trades SET traded_at=NOW()-INTERVAL '2 days' WHERE event_id='trade-2'`;
 stats=await analytics.getAnalytics('day');assert.equal(stats.volumeEth,201);
 assert.equal((await analytics.getAnalytics('week')).volumeEth,251,'Categories and totals follow the selected period');

 // Rank before filtering; reuse the same real SQL projection for unrelated searches and sorts.
 await db`INSERT INTO indexer_v2.camp_trades ${db([{...trade(4,addr(600),500n),trader_address:addr(70001)}])}`;
 let leaderboardReads=0;const rankingCache=new Map();
 const leaderboard=await load('app/lib/db/leaderboard.ts',{
  'viem':require('viem'),'../../config/deployment':{INDEXER_SCHEMA:'indexer_v2'},'../../config/korum-network':{KORUM_CHAIN_ID:chain},
  '../cache/redis':{redisCacheKey:key,rememberJson:async(k,t,fn)=>{if(!rankingCache.has(k))rankingCache.set(k,fn());return rankingCache.get(k)}},
  '../markets/quote-usd':{getEthUsdQuote:async()=>null},'../badges':{calculateBadgeProgress:()=>({overall:null})},
  '../markets/pnl':{getLaunchConfig:async()=>({tier1Num:1,tier1Den:2,tier2Num:3,tier2Den:4,fee1Bps:100,fee2Bps:200,fee3Bps:300})},
  './client':{getDatabase:()=>({unsafe:async(q,args)=>{leaderboardReads++;return db.unsafe(q,args)}})},
 });
 const boards=await Promise.all(Array.from({length:100},(_,i)=>leaderboard.getTraderLeaderboard({search:i%2?addr(70000):addr(70001),sort:i%3?'volume':'pnl'})));
 assert.equal(leaderboardReads,2,'100 searches share one config lookup and one complete SQL ranking');
 assert.equal(boards[1].items[0].rank,2,'Searching a lower volume trader preserves the global rank');
 assert.equal(boards[2].items[0].rank,1);
 assert.equal(boards[0].items[0].volumeUsd,null);
 assert.equal((await leaderboard.getTraderLeaderboard({page:99})).totalItems,2);
 assert.equal((await leaderboard.getTraderLeaderboard({search:'missing'})).totalItems,0);
 console.log('Analytics/Leaderboard passed: complete categories, period boundaries, shared aggregate scan, 100 filtered readers and global ranks.');
 const proof={verifiedAt:new Date().toISOString(),passed:true,analytics:{markets:300,categoryTotalsComplete:true,sharedAggregateScan:true,periodBoundaries:true},leaderboard:{readers:100,configAndRankingSqlReads:leaderboardReads,globalRanksPreserved:true},markets:ranks.length,trades:3,plannerStatistics:'ANALYZE after fixture insertion',fullRankingSqlMs:Math.round(rankMs*10)/10,rankingBytes:Buffer.byteLength(JSON.stringify(ranks)),pageBytes:Buffer.byteLength(JSON.stringify(page)),checks:'old-market ranking, filters, stable ties, quiet windows, bounded DTO, 100 readers, targeted live update, validation and legacy API'};
 if(process.env.KORUM_TEST_PROOF)await writeFile(process.env.KORUM_TEST_PROOF,JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify(proof));
} finally {
 const keys=await redis.keys(namespace+':*');if(keys.length)await redis.del(...keys);await redis.quit();await db.end({timeout:2});if(process.env.KORUM_KEEP_TEST_DATABASE === "1")console.log("Retained local fixture: "+name);else await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end({timeout:2});
}

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
async function load(path,deps,globals={}){const exports={};runInNewContext(ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,Set,...globals,require:n=>{if(n in deps)return deps[n];throw Error(n)}});return exports;}
let subscribe,snapshot,serverSnapshot,timers=0,notify,stopped=0;
const clock=await load('app/hooks/useMinuteClock.ts',{react:{useSyncExternalStore:(a,b,c)=>{subscribe=a;snapshot=b;serverSnapshot=c;return b()}}},{setInterval:fn=>{timers++;notify=fn;return 1},clearInterval:()=>stopped++});
clock.useMinuteClock();assert.equal(serverSnapshot(),null);
let notifications=0;const stops=Array.from({length:100},()=>subscribe(()=>notifications++));
assert.equal(timers,1);assert.equal(typeof snapshot(),'number');notify();assert.equal(notifications,100);
stops.forEach(stop=>stop());assert.equal(stopped,1);assert.equal(snapshot(),null);
const client=new QueryClient();const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40);
let wallet=a,reads=0,lastOptions,release;
let pending=new Promise(resolve=>release=resolve);
const hook=await load('app/hooks/usePendingReferral.ts',{
 react:{useCallback:fn=>fn},'@tanstack/react-query':{useQueryClient:()=>client,useQuery:options=>{lastOptions=options;return {data:client.getQueryData(options.queryKey)}}},
 '../config/deployment':{DEPLOYMENT_CACHE_SCOPE:'test'},'../components/WalletProvider':{useWallet:()=>({address:wallet,authenticated:!!wallet})},
 '../lib/referrals/client':{fetchPendingReferral:async address=>{reads++;await pending;return {walletAddress:address,referralCode:'test',evmWallet:b}}},
});
hook.usePendingReferral();const firstOptions=lastOptions;const first=new QueryObserver(client,firstOptions);const stop1=first.subscribe(()=>{});
hook.usePendingReferral();const second=new QueryObserver(client,lastOptions);const stop2=second.subscribe(()=>{});
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
await flush();assert.equal(reads,1,'Two trade panels share one pending-referral request');
const owner=hook.usePendingReferral();wallet=b;hook.usePendingReferral();const secondWalletKey=lastOptions.queryKey;
client.setQueryData(secondWalletKey,{walletAddress:b,referralCode:'other',evmWallet:a});
await owner.clear();release();await flush();
assert.equal(client.getQueryData(firstOptions.queryKey),null,'A pending request cannot resurrect a cleared referral');
assert.equal(client.getQueryData(secondWalletKey).referralCode,'other','Clearing the old wallet leaves the new wallet untouched');
wallet=null;assert.equal(hook.usePendingReferral().referral,null);assert.equal(lastOptions.enabled,false);
stop1();stop2();client.clear();
console.log('Local sharing passed: 100 clock subscribers / one timer, two referral panels / one request, wallet switch and pending-clear isolation.');

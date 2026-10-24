// The server recovery timer is shared by subscribers, not instantiated per user.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const timers=new Map();let id=0,probes=0,connections=0,release;
let gate=new Promise(resolve=>{release=resolve});
const handlers=new Map();
const subscriber={on:(name,fn)=>handlers.set(name,fn),connect:async()=>{connections++},subscribe:async()=>{},disconnect(){}};
const redis={status:'ready',duplicate:()=>subscriber};
const deps={
 '../cache/redis':{connectedRedis:async()=>redis,redisCacheKey:(...p)=>p.join(':')},
 '../../config/deployment':{},'../db/client':{},'../markets/math':{},'./chart-cache':{},'../markets/venue':{},'./debate-cache':{},'./explore-cache': { prepareExploreMutation: async () => ({ revisions: [], mutations: [] }) }, '../db/explore': {}, './profile-cache':{},'../db/market-delivery':{},
 '../db/debates':{reconcileIndexedMarkets:async()=>{probes++;if(gate)await gate}},
};
const exports={};
const source=await readFile(new URL('../app/lib/live/server.ts',import.meta.url),'utf8');
runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
 exports,console,Map,Set,
 setInterval:(fn,ms)=>{assert.equal(ms,60000);const timer={id:++id,unref(){}};timers.set(timer,fn);return timer},
 clearInterval:timer=>timers.delete(timer),
 require:name=>{if(name==='server-only')return {};if(name.startsWith('node:'))return require(name);if(name in deps)return deps[name];throw Error(name)},
});
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
const stops=await Promise.all(Array.from({length:100},()=>exports.subscribeMarkets(()=>{})));
await flush();assert.equal(connections,1);assert.equal(timers.size,1);assert.equal(probes,1);
const tick=[...timers.values()][0];tick();await flush();assert.equal(probes,1,'A slow probe never overlaps another probe on the same process');
release();gate=null;await flush();tick();await flush();assert.equal(probes,2,'Recovery runs with an open SSE connection even without HTTP reads or new trades');
stops.slice(0,99).forEach(stop=>stop());assert.equal(timers.size,1);
stops[99]();assert.equal(timers.size,0,'The timer stops when the last subscriber leaves');
const stop=await exports.subscribeMarkets(()=>{});await flush();assert.equal(timers.size,1);assert.equal(connections,1);stop();
console.log('Market hub passed: 100 subscribers share one connection and recovery timer; no overlapping probes; idle cleanup and remount.');

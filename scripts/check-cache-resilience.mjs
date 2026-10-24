// Real isolated Redis keys; deterministic cache faults, SQL represented by gates.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import Redis from 'ioredis';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const url = new URL(process.env.KORUM_TEST_REDIS_URL || 'redis://127.0.0.1:16481');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
const redis = new Redis(url.href, { maxRetriesPerRequest: 1 });
redis.on('error', () => {});
const namespace = 'korum-resilience-test:' + randomUUID();
async function load(path, deps = {}, globals = {}) {
 const source = await readFile(new URL('../' + path, import.meta.url),'utf8');
 const exports = {};
 runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
  { exports, console, Date, Map, Set, Promise, setTimeout, process:{env:{}}, ...globals,
   require:name=>{ if(name==='server-only')return {};if(name in deps)return deps[name];if(name.startsWith('node:'))return require(name);throw Error(name); } });
 return exports;
}
try {
 const cache = await load('app/lib/cache/redis.ts', { ioredis:{default:class {constructor(){return redis}}}, '../../config/deployment':{DEPLOYMENT_CACHE_SCOPE:'test'} },
  {process:{env:{REDIS_URL:url.href,KORUM_CACHE_NAMESPACE:namespace}}});
 const key=cache.redisCacheKey, a='0x'+'a'.repeat(40), b='0x'+'b'.repeat(40);
 let loads=0;
 const read=token=>cache.rememberJson(key('market','trades',token),30,async()=>({read:++loads}),undefined,token);
 await read(a);await read(b);assert.equal(loads,2);
 await redis.mset(key('live','revision'),'trade-a',key('live','chart-revision',a),'trade-a');
 await read(b);assert.equal(loads,2,'A trade on A preserves B');
 await read(a);assert.equal(loads,3,'The affected token refreshes');
 await cache.invalidateIndexedDebateCaches();await read(a);await read(b);
 assert.equal(loads,5,'Metadata changes still invalidate both tokens');
 let release;const gate=new Promise(resolve=>{release=resolve});
 const raced=cache.rememberJson(key('market','raced',a),30,async()=>{await gate;return 'old'},undefined,a);
 await new Promise(resolve=>setTimeout(resolve,30));
 await redis.set(key('live','chart-revision',a),'new');release();await raced;
 assert.equal(await cache.rememberJson(key('market','raced',a),30,async()=>'new',undefined,a),'new','A raced fill cannot poison the new revision');

 const maintained=await load('app/lib/cache/maintained.ts');
 for(const phase of ['read','lease','store','release']) {
  let count=0,releaseSql,started=false;
  const gate=new Promise(resolve=>{releaseSql=resolve});
  const value=key('maintained',phase);
  const keys={value,revision:value+':revision',metadata:value+':metadata',guard:value+':guard'};
  const faulty=new Proxy(redis,{get(target,prop){
   if(prop==='set')return (...args)=>phase==='lease'?Promise.reject(Error('lost lease connection')):target.set(...args);
   if(prop==='eval')return (script,...args)=>{
    const fail=phase==='read'&&script.includes('local value =') || phase==='store'&&script.includes('ARGV[7]') || phase==='release'&&script.includes('DEL');
    return fail?Promise.reject(Error('cache failure '+phase)):target.eval(script,...args);
   };
   const member=target[prop];return typeof member==='function'?member.bind(target):member;
  }});
  const diagnostics=Array.from({length:100},()=>({status:'MISS'}));
  const readers=diagnostics.map(d=>maintained.readMaintained(faulty,keys,async()=>{count++;started=true;await gate;return ['fresh'];},d));
  while(!started)await new Promise(resolve=>setTimeout(resolve,5));
  releaseSql();const results=await Promise.all(readers);
  assert.equal(count,1,phase+': 100 readers share one SQL load');assert.ok(results.every(result=>result[0]==='fresh'));
  if(phase!=='release')assert.equal(diagnostics[0].status,'BYPASS');
 }
 let sqlFailures=0;
 await assert.rejects(maintained.readMaintained(redis,{value:key('sql-failure'),revision:key('sr'),metadata:key('sm'),guard:key('sg')},async()=>{sqlFailures++;throw Error('SQL unavailable')}),/SQL unavailable/);
 assert.equal(sqlFailures,1,'A SQL error is not retried as a Redis failure');
 console.log('Cache resilience passed: token isolation, metadata invalidation, raced fills, 100 shared readers through read/lease/store/release failures, SQL error propagation.');
} finally {
 const keys=await redis.keys(namespace+':*');if(keys.length)await redis.del(...keys);await redis.quit();
}

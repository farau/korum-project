// Real SSE route with deterministic publication; no SQL, session cookies or network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const wallet='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),held='0x'+'c'.repeat(40),unrelated='0x'+'d'.repeat(40);
const hash=wallet=>createHash('sha256').update(wallet).digest('hex');
let session={address:wallet},listener,authReads=0;
const dependencies={
 '../../../lib/auth/session':{getWalletSession:async()=>{authReads++;return session}},
 '../../../lib/live/profile-cache':{profileWalletHash:hash},
 '../../../lib/live/server':{subscribeMarkets:async fn=>{listener=fn;return ()=>{listener=null}}},
 '../../../lib/cache/redis':{consumeRateLimit:async()=>({allowed:true}),redisCacheKey:(...p)=>p.join(':')},
 'node:crypto':{createHash},
};
const exports={};
runInNewContext(ts.transpileModule(await readFile('app/api/markets/live/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
 exports,URL,Response,ReadableStream,TextEncoder,Set,process:{env:{REDIS_URL:'test',KORUM_GOLDSKY_WEBHOOK_SECRET:'test'}},
 setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},require:n=>{if(n in dependencies)return dependencies[n];throw Error(n)},
});
const request=params=>new Request('http://localhost/api/markets/live?'+params);
assert.equal((await exports.GET(request('profile='+other))).status,401);
assert.equal((await exports.GET(request('profile=bad'))).status,400);
session=null;assert.equal((await exports.GET(request('profile='+wallet))).status,401);session={address:wallet};
const response=await exports.GET(request(`profile=${wallet}&profileTokens=${held}`));
assert.equal(response.status,200);const reader=response.body.getReader();await reader.read();
const decode=result=>JSON.parse(new TextDecoder().decode(result.value).split('data: ')[1].trim());
const notice={revision:'r',tokens:[unrelated],reset:false,trades:[],profileWallets:[hash(other)]};
let received=false;const pending=reader.read().then(value=>{received=true;return value});
listener(notice);for(let i=0;i<20;i++)await Promise.resolve();
assert.equal(received,false,'An unrelated trade produces no Profile SSE frame');
listener({...notice,profileWallets:[hash(wallet)]});let payload=decode(await pending);
assert.equal(payload.profileChanged,true);assert.equal(payload.profileWallet,wallet);assert.equal('profileWallets' in payload,false);
listener({...notice,tokens:[held]});assert.equal(decode(await reader.read()).profileChanged,true,'Held-token prices refresh PNL');
listener({...notice,profileWallets:undefined});assert.equal(decode(await reader.read()).profileChanged,true,'Unknown old actors recover conservatively');
listener({...notice,reset:true});assert.equal(decode(await reader.read()).reset,true);
await reader.cancel();
const before=authReads;const publicResponse=await exports.GET(request('feed=1'));assert.equal(authReads,before,'Public feed does not read a session');
const publicReader=publicResponse.body.getReader();await publicReader.read();listener({...notice,profileWallets:[hash(wallet)]});payload=decode(await publicReader.read());
assert.equal(payload.profileChanged,false);assert.equal('profileWallet' in payload,false);assert.equal('profileWallets' in payload,false);
await publicReader.cancel();
console.log('Profile SSE passed: authenticated wallet scope, unrelated events suppressed, open-position price changes, correction recovery and no actor hashes exposed publicly.');

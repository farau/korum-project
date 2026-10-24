// Preserve real Wagmi cookie decoding at the server/client provider boundary.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { cookieToInitialState } from 'wagmi';
import ts from 'typescript';
const require=createRequire(import.meta.url);
async function load(path,deps){const exports={};runInNewContext(ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{if(n in deps)return deps[n];if(n==='react/jsx-runtime')return require(n);throw Error(n)}});return exports;}
const config={storage:{key:'korum-rainbowkit-wagmi-v1'}};
const state={chainId:46630,current:'test-wallet',status:'connected'};
const raw='korum-rainbowkit-wagmi-v1.store='+JSON.stringify({state});
const layout=await load('app/(app)/layout.tsx',{
 'next/headers':{headers:async()=>new Headers({cookie:raw}),cookies:async()=>({has:()=>true,toString:()=>{throw Error('Re-encoding cookie loses Wagmi state')}})},
 '../lib/auth/session':{SESSION_COOKIE_NAME:'test'},'../components/RainbowKitProvider':{default:()=>null},'../components/AppFrame':{default:()=>null},
});
const tree=await layout.default({children:null});assert.equal(tree.props.cookies,raw);assert.equal(tree.props.hasSessionCookie,true);
const provider=await load('app/components/RainbowKitProvider.tsx',{
 '@rainbow-me/rainbowkit/styles.css':{},'@rainbow-me/rainbowkit':{},
 '@tanstack/react-query':{QueryClient:class{},QueryClientProvider:()=>null},
 react:{useState:fn=>[fn(),()=>{}],useMemo:fn=>fn()},wagmi:{cookieToInitialState,WagmiProvider:()=>null},
 '../config/rainbowkit':{wagmiConfig:config},'./WalletProvider':{},'../hooks/useWatchlist':{},
});
assert.deepEqual(provider.default({...tree.props}).props.initialState,state);
assert.equal(provider.default({cookies:'korum-rainbowkit-wagmi-v1.store=invalid'}).props.initialState,undefined);
assert.equal(provider.default({cookies:null}).props.initialState,undefined);
console.log('Public wallet boundary passed: raw cookie round-trip, restored state and safe malformed-cookie fallback.');

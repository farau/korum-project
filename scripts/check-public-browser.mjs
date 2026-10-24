// Functional and transfer checks against the local production build only.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.KORUM_PLAYWRIGHT_MODULE || 'playwright');
const base=new URL(process.env.KORUM_TEST_BASE_URL || 'http://127.0.0.1:3217');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname));
const browser=await chromium.launch({headless:true,executablePath:process.env.KORUM_CHROME_PATH});
const results=[];
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==base.origin)return route.abort();
   requests.push(url.pathname+url.search);
   return route.continue();
  });
  await page.goto(new URL('/privacy',base).href,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Privacy Policy',exact:true}).waitFor();
  const initial=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/_next/static/') && e.name.endsWith('.js')).map(e=>({url:new URL(e.name).pathname,bytes:e.decodedBodySize})));
  assert.equal(requests.some(url=>url.startsWith('/api/auth/')||url.startsWith('/api/rpc')||url.startsWith('/api/watchlist')),false,'Anonymous public load needs no wallet/session calls');
  // Page contents must not remount when the independently mounted wallet SDK activates.
  await page.evaluate(()=>{window.auditPublicHeading=document.querySelector('main h1')});
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  const after=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/_next/static/') && e.name.endsWith('.js')).map(e=>({url:new URL(e.name).pathname,bytes:e.decodedBodySize})));
  assert.ok(after.length>initial.length,'Wallet modules load only after intent');
  assert.equal(await page.evaluate(()=>window.auditPublicHeading===document.querySelector('main h1')),true,'Opening the wallet preserves the public page DOM');
  // Wallet initialization writes a Wagmi JSON cookie. A subsequent SSR request
  // must preserve its encoding when crossing into the interactive route group.
  const next=await page.goto(new URL('/explore',base).href,{waitUntil:'domcontentloaded'});
  assert.equal(next.status(),200);
  await page.getByRole('button',{name:'All',exact:true}).waitFor();
  assert.equal(await page.locator('.card-grid article').count()>0,true);
  assert.deepEqual(errors,[]);
  results.push({width,publicJsBytes:initial.reduce((n,e)=>n+e.bytes,0),publicJsFiles:initial.length,walletAdditionalJsBytes:after.filter(e=>!initial.some(i=>i.url===e.url)).reduce((n,e)=>n+e.bytes,0),walletModalOpened:true,pagePreserved:true,interactiveNavigationWithCookie:true,errors});
  await page.close();
 }
 const page=await browser.newPage();const errors=[];const paths=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==base.origin)return route.abort();paths.push(url.pathname+url.search);return route.continue()});
 await page.goto(new URL('/analytics',base).href,{waitUntil:'domcontentloaded'});
 await page.locator('.fee-bar-row2').filter({hasText:'Mémes'}).waitFor();
 assert.equal(paths.some(path=>path==='/api/versus'),false,'Analytics no longer requests the legacy latest-100 list');
 await page.locator('.table-matchup-group').filter({hasText:'Token 1-0'}).waitFor();
 assert.ok(await page.locator('.table-matchup-group').count()<=8);
 await page.getByRole('button',{name:'Weekly',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('button[aria-pressed="true"]')?.textContent==='Weekly');
 assert.deepEqual(errors,[]);
 results.push({analytics:true,completeCategories:true,oldMarketInTop:true,noLegacyRequest:true,errors});
 await page.close();
 const proof={verifiedAt:new Date().toISOString(),scope:'Local production build, synthetic SQL, external browser requests blocked; uncompressed executed JS resources, not field Core Web Vitals',results};
 if(process.env.KORUM_TEST_PROOF)await writeFile(process.env.KORUM_TEST_PROOF,JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify(proof));
}finally{await browser.close()}

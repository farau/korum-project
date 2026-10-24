// Local production-build comparison; requires an external Playwright installation.
// KORUM_PLAYWRIGHT_MODULE may be an absolute path to playwright-core/index.mjs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.KORUM_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.KORUM_PERF_ORIGIN || 'http://127.0.0.1:3317';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Local test server required');
const output = process.env.KORUM_PERF_OUTPUT || join(tmpdir(), 'korum-explore-performance');
fs.mkdirSync(output, { recursive: true });
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.KORUM_CHROME_PATH});
 const results=[];
 try {
  const warm=await browser.newPage(); await warm.goto(origin+'/explore'); await warm.close();
  const scenarios=[
   ...Array.from({length:3},(_,i)=>[{theme:'dark',baseline:true,dpr:1,width:390,run:i+1},{theme:'dark',baseline:false,dpr:1,width:390,run:i+1}]).flat(),
   {theme:'light',baseline:false,dpr:1,width:390,run:1},
   {theme:'dark',baseline:false,dpr:2,width:390,run:1},
   {theme:'light',baseline:false,dpr:2,width:390,run:1},
   {theme:'dark',baseline:false,dpr:1,width:1440,run:1},
   {theme:'light',baseline:false,dpr:1,width:1440,run:1},
  ];
  for(const scenario of scenarios.filter(s => !process.env.KORUM_PERF_TIMING_ONLY || (s.theme === 'dark' && s.dpr === 1 && s.width === 390))){
   const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.width<600?844:900},deviceScaleFactor:scenario.dpr,isMobile:scenario.width<600,hasTouch:scenario.width<600});
   const page=await context.newPage(), cdp=await context.newCDPSession(page);
   await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1600000/8,uploadThroughput:750000/8});
   await page.addInitScript(({theme,baseline})=>{
    localStorage.setItem('korum-theme',theme);
    window.perfCheck={lcp:[]};
    new PerformanceObserver(list=>{for(const e of list.getEntries())window.perfCheck.lcp.push({ms:e.startTime,size:e.size,tag:e.element?.tagName,url:e.url})}).observe({type:'largest-contentful-paint',buffered:true});
    if(baseline){const style=document.createElement('style');style.textContent=`@media(max-width:600px){html .explore-page{--explore-art:url('/design-vdef/home/${theme}.webp') !important}}`;
     const observer=new MutationObserver(()=>{if(document.head){document.head.append(style);observer.disconnect()}});observer.observe(document,{childList:true,subtree:true});}
   },scenario);
   const network=[],ids=new Map(),errors=[];
   cdp.on('Network.requestWillBeSent',e=>{const row={url:e.request.url,type:e.type};network.push(row);ids.set(e.requestId,row)});
   cdp.on('Network.responseReceived',e=>{const row=ids.get(e.requestId);if(row){row.status=e.response.status;row.mime=e.response.mimeType}});
   cdp.on('Network.loadingFinished',e=>{const row=ids.get(e.requestId);if(row)row.bytes=e.encodedDataLength});
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/explore',{waitUntil:'load',timeout:90000});
   await page.waitForTimeout(2000);
   const data=await page.evaluate(()=>({lcp:window.perfCheck.lcp.at(-1),background:getComputedStyle(document.querySelector('.explore-page'),'::before').backgroundImage,theme:document.documentElement.dataset.theme,scrollWidth:document.documentElement.scrollWidth,width:innerWidth,text:document.querySelector('.mini-hero')?.innerText}));
   const images=network.filter(r=>r.url.includes('/design-vdef/home/'));
   const expected=scenario.baseline||scenario.width>600?`${scenario.theme}.webp`:`${scenario.theme}-mobile${scenario.dpr>=2?'@2x':''}.webp`;
   assert.equal(images.length,1,'One background download per visit');assert.ok(images[0].url.endsWith('/'+expected),JSON.stringify(images));
   assert.equal(data.scrollWidth,data.width,'No horizontal overflow');assert.equal(data.theme,scenario.theme);assert.deepEqual(errors,[]);
   if(scenario.run===1) await page.screenshot({path:join(output, `explore-${scenario.theme}-${scenario.width}-${scenario.dpr}-${scenario.baseline?'before':'after'}.png`)});
   const result={...scenario,...data,images,requests:network.length,completedBytes:network.reduce((n,r)=>n+(r.bytes||0),0),errors};results.push(result);
   fs.writeFileSync(join(output, 'browser-proof.json'),JSON.stringify({browser:browser.version(),scenarios:results},null,2));
   console.log(JSON.stringify({theme:scenario.theme,baseline:scenario.baseline,width:scenario.width,dpr:scenario.dpr,run:scenario.run,lcpMs:data.lcp?.ms,imageBytes:images[0].bytes,errors}));
   await context.close();
  }
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

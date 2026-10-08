import { chromium } from 'playwright';
import { writeFile, stat } from 'node:fs/promises';
async function publicDnsA(hostname) {
  try {
    const r = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(hostname) + "&type=A&cd=true", {
      signal: AbortSignal.timeout(7000)
    });
    if (!r.ok) return null;
    const data=await r.json();
    const a=(data.Answer || []).find(x=>x.type===1 && /^\d{1,3}(\.\d{1,3}){3}$/.test(x.data));
    return a ? a.data : null;
  } catch (e) { console.warn("[DNS] DoH unavailable for",hostname,String(e).slice(0,120));return null; }
}
const originHosts=["flixer.su","plsdontscrapemelove.flixer.su"];
const aRecords=await Promise.all(originHosts.map(publicDnsA));
const mappings=originHosts.map((h,i)=>aRecords[i] ? "MAP " + h + " " + aRecords[i] : "").filter(Boolean);
console.log("[DNS] Origin mappings",mappings.length,"of",originHosts.length);
const chromeArgs=["--no-sandbox"];
if (mappings.length) chromeArgs.push("--host-resolver-rules=" + mappings.join(", "));
const browser = await chromium.launch({headless:true,args:chromeArgs});

const ctx=await browser.newContext();
const page=await ctx.newPage();
const wasmResources=[];
const scripts=[];
page.on('response',r=>{
 const u=r.url();
 if (u.includes('/assets/wasm/') || u.includes('/assets/client/')) {
   const item={path:new URL(u).pathname,status:r.status(),contentType:r.headers()['content-type']||''};
   const promise=r.body().then(async bytes=>{
     item.bytes=bytes.length;
     if(u.endsWith('.wasm')) {
       const path='/tmp/flixer-img-data.wasm';
       await writeFile(path,bytes);
       const mod=await WebAssembly.compile(bytes);
       item.imports=WebAssembly.Module.imports(mod);
       item.exports=WebAssembly.Module.exports(mod);
       item.localPath=path;
       wasmResources.push(item);
     } else if(u.endsWith('.js')) {
       const path='/tmp/flixer-'+new URL(u).pathname.split('/').at(-1);
       await writeFile(path,bytes);
       item.localPath=path;
       scripts.push(item);
     }
   }).catch(e=>{item.error=String(e)});
   promises.push(promise);
 }
});
const promises=[];
const reqPaths=[];
page.on('request',r=>{if(r.url().includes('wasm')||r.url().includes('img_data'))reqPaths.push(r.url());});
page.on('console',m=>{if(/WASM|enhance|source/i.test(m.text())) console.log('BROWSER_NOTE',m.text().slice(0,230))});
try{
 await page.goto('https://flixer.su/watch/movie/9502',{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForTimeout(15000);
 const forced=await page.evaluate(async()=>{try{const u='https://plsdontscrapemelove.flixer.su/assets/wasm/img_data_bg.wasm';const r=await fetch(u);const data=await r.arrayBuffer();return {status:r.status,size:data.byteLength,contentType:r.headers.get('content-type')}}catch(e){return {error:String(e)}}});
 console.log('WASM_FORCED_FETCH',JSON.stringify(forced));
 const glue=await page.evaluate(async()=>{
   try { const r=await fetch('https://plsdontscrapemelove.flixer.su/assets/wasm/img_data.js');return r.ok ? await r.text() : null; }
   catch(e) {return null;}
 });
 if(glue){ await writeFile('/tmp/flixer-img-data.js',glue);console.log('WASM_GLUE_FETCH',glue.length);}
 else console.log('WASM_GLUE_FETCH_FAILED');

 await page.waitForTimeout(1500);
 await Promise.allSettled(promises);
 console.log('WASM_AUDIT',JSON.stringify({wasmResources,scripts,reqPaths,video:await page.locator('video').count()},null,2).slice(0,12000));
 if(!wasmResources.length)process.exitCode=1;
}catch(e){console.log('WASM_AUDIT_ERROR',String(e));process.exitCode=1}
await ctx.close();await browser.close();

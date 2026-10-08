import { chromium } from "playwright";
import {writeFile} from "node:fs/promises";
const hosts=["flixer.su","plsdontscrapemelove.flixer.su"];
const maps=[];
for(const h of hosts){
 try{
  const r=await fetch("https://dns.google/resolve?name="+h+"&type=A&cd=true",{signal:AbortSignal.timeout(9000)});
  const j=await r.json();const ip=(j.Answer||[]).find(x=>x.type===1)?.data;
  if(ip)maps.push("MAP "+h+" "+ip);
 }catch(e){console.log("DNS_LOOKUP_ERROR",h,String(e).slice(0,120))}
}
const args=["--no-sandbox"];
if(maps.length)args.push("--host-resolver-rules="+maps.join(", "));
const headless=process.env.FLIXER_HEADFUL!=="1";
const browser=await chromium.launch({headless,args});
console.log("BROWSER_RUN_MODE",headless?"headless":"headed");
const context=await browser.newContext({viewport:{width:1365,height:900}});
const page=await context.newPage();
let item=null;
const cipherResults=[];
const apiResults=[];
const failures=[];
const browserErrors=[];
const badStatuses=[];
function safeError(t){return String(t||"").replace(/https?:\/\/[^\s\"']+/g,'[URL]').slice(0,260);}
page.on('pageerror',e=>{if(browserErrors.length<12)browserErrors.push(safeError(e.message));});
page.on('console',m=>{if(['error','warning'].includes(m.type())&&browserErrors.length<18)browserErrors.push(m.type()+': '+safeError(m.text()));});
page.on('requestfailed',req=>{if(failures.length<35)failures.push({path:(()=>{try{return new URL(req.url()).pathname}catch{return ''}})(),reason:safeError(req.failure()?.errorText)});});
const promises=[];
page.on("response",r=>{
 const u=r.url(),req=r.request();
 if(r.status()>=400&&badStatuses.length<30)badStatuses.push({path:new URL(u).pathname,status:r.status()});
 if(u.includes("/api/tmdb/"))apiResults.push({path:new URL(u).pathname,status:r.status()});
 if(!u.includes("/api/tmdb/movie/9502/images")||r.status()!==200)return;
 const headers=req.headers(),key=headers["x-api-key"];
 const server=(headers["x-server"]||"").toLowerCase();
 if(!globalThis.__flixerPrintedHeaderSchema && server==="alpha"){
  globalThis.__flixerPrintedHeaderSchema=true;
  console.log("ALPHA_REQUEST_HEADER_SCHEMA",Object.keys(headers).sort().filter(n=>!["cookie","authorization"].includes(n)).map(n=>({
    name:n,bytes:String(headers[n]).length,
    value: ["accept","origin","referer","x-server","x-only-sources"].includes(n)?String(headers[n]).slice(0,110):undefined
  })));
 }
 const onlySources=headers["x-only-sources"]==="1";
 if(server==="alpha" && !globalThis.__flixerContextCaptured) {
  globalThis.__flixerContextCaptured=true;
  promises.push(writeFile("/tmp/flixer-browser-public-headers.json",JSON.stringify({
    fingerprintLite:headers["x-fingerprint-lite"]||"",
    clientFingerprint:headers["x-client-fingerprint"]||"",
    userAgent:headers["user-agent"]||""
  })).catch(e=>console.log("HEADER_CONTEXT_SAVE_ERROR",String(e).slice(0,90))));
 }
 if(!/^[0-9a-f]{64}$/i.test(key||"")) {
   console.log("CIPHER_REQUEST_KEY_NOT_AVAILABLE",{status:r.status(),server,onlySources,headerNames:Object.keys(headers).filter(x=>x.startsWith("x-"))});
   return;
 }
 const candidate={status:r.status(),suppliedKey:key,body:"",server,onlySources};
 promises.push(r.text().then(t=>{
   candidate.body=t;
   cipherResults.push(candidate);
   console.log("LIVE_CIPHER_CAPTURED",{status:r.status(),bytes:t.length,server,onlySources,hasKey:true});
 }).catch(e=>console.log("CIPHER_BODY_ERROR",String(e).slice(0,140))));
});
try{await page.goto("https://flixer.su/watch/movie/9502",{waitUntil:"domcontentloaded",timeout:38000});await page.waitForTimeout(20000)}catch(e){console.log("BROWSER_PAGE_ERROR",String(e).slice(0,300))}
await Promise.allSettled(promises);
console.log("PAGE_DIAGNOSTICS",JSON.stringify({url:page.url(),title:await page.title().catch(()=>""),body:(await page.locator("body").innerText().catch(()=>"")).slice(0,450),apiResults:apiResults.slice(0,16),failures,badStatuses,browserErrors,meta:await page.evaluate(()=>({scriptCount:document.scripts.length,readyState:document.readyState,videoCount:document.querySelectorAll('video').length,hasTmdbBase:!!window.TMDB_API_BASE_URL})).catch(()=>({}))}));
const mediaCipher=cipherResults.find(x=>x.onlySources && x.server==="alpha" && x.body.length>100);
const serverListCipher=cipherResults.find(x=>!x.onlySources && x.body.length>100);
const chosen=mediaCipher || cipherResults.find(x=>x.onlySources && x.body.length>100);
if(serverListCipher) {
 await writeFile("/tmp/flixer-fixture-serverlist.json",JSON.stringify(serverListCipher));
 console.log("LIVE_SERVERLIST_FIXTURE_READY",{bytes:serverListCipher.body.length});
}
if(chosen){
 const classification=(()=>{
   try{const o=JSON.parse(chosen.body);return {looksJson:true,keys:Object.keys(o).slice(0,8)}}
   catch{return {looksJson:false,isBase64:/^[A-Za-z0-9+/=\\s]+$/.test(chosen.body),charCount:chosen.body.length}}
 })();
 console.log("LIVE_MEDIA_CIPHER_SHAPE",classification);
 const inPage=await page.evaluate(async ({body,key})=>{
   const m=window.wasmImgData;
   if(!m || !m.ready || typeof m.process_img_data!=="function")return {ready:false,reason:"WASM_NOT_READY"};
   try{
     const data=JSON.parse(await m.process_img_data(body,key));
     const sources=Array.isArray(data.sources)?data.sources:Array.isArray(data.sources?.sources)?data.sources.sources:[];
     const urls=sources.filter(x=>typeof x?.url==="string"&&/^https?:/.test(x.url)).length;
     return {ready:true,decoded:true,sources:sources.length,mediaUrlCount:urls,rootKeys:Object.keys(data).slice(0,8)};
   }catch(e){return {ready:true,decoded:false,error:String(e).slice(0,90)}}
 },{body:chosen.body,key:chosen.suppliedKey}).catch(e=>({error:String(e).slice(0,110)}));
 console.log("BROWSER_WASM_SAME_CIPHER_PARITY",inPage);
 await writeFile("/tmp/flixer-fixture.json",JSON.stringify(chosen));
 console.log("LIVE_MEDIA_CIPHER_FIXTURE_READY",{server:chosen.server,bytes:chosen.body.length});
}else{
 console.log("LIVE_MEDIA_CIPHER_FIXTURE_UNAVAILABLE",{captureCount:cipherResults.length,servers:cipherResults.map(x=>({server:x.server,onlySources:x.onlySources,bytes:x.body.length}))});
 process.exitCode=2;
}
await context.close();await browser.close();

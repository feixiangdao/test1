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
 if(!u.includes("/api/tmdb/movie/9502/images")||item||r.status()!==200)return;
 const headers=req.headers(),key=headers["x-api-key"];
 if(!/^[0-9a-f]{64}$/i.test(key||"")) {
   console.log("CIPHER_REQUEST_KEY_NOT_AVAILABLE",{status:r.status(),keys:Object.keys(headers).filter(x=>x.startsWith("x-"))});
   return;
 }
 item={status:r.status(),suppliedKey:key,body:""};
 promises.push(r.text().then(t=>{item.body=t;console.log("LIVE_CIPHER_CAPTURED",{status:r.status(),bytes:t.length,hasKey:true})}).catch(e=>console.log("CIPHER_BODY_ERROR",String(e))));
});
try{await page.goto("https://flixer.su/watch/movie/9502",{waitUntil:"domcontentloaded",timeout:38000});await page.waitForTimeout(20000)}catch(e){console.log("BROWSER_PAGE_ERROR",String(e).slice(0,300))}
await Promise.allSettled(promises);
console.log("PAGE_DIAGNOSTICS",JSON.stringify({url:page.url(),title:await page.title().catch(()=>""),body:(await page.locator("body").innerText().catch(()=>"")).slice(0,450),apiResults:apiResults.slice(0,16),failures,badStatuses,browserErrors,meta:await page.evaluate(()=>({scriptCount:document.scripts.length,readyState:document.readyState,videoCount:document.querySelectorAll('video').length,hasTmdbBase:!!window.TMDB_API_BASE_URL})).catch(()=>({}))}));
if(item?.body?.length>100){
 await writeFile("/tmp/flixer-fixture.json",JSON.stringify(item));
 console.log("LIVE_CIPHER_FIXTURE_READY");
}else{
 console.log("LIVE_CIPHER_FIXTURE_UNAVAILABLE");
 process.exitCode=2;
}
await context.close();await browser.close();

// Capture only the current site's own browser-origin ciphertext and matching
// client request key for temporary local interoperability testing.
// No fixture, key, media URL, or response body is uploaded or committed.
import { chromium } from "playwright";
import {writeFile} from "node:fs/promises";

async function dns(host) {
 try {
  const r=await fetch("https://dns.google/resolve?name="+encodeURIComponent(host)+"&type=A&cd=true",{signal:AbortSignal.timeout(6000)});
  const j=await r.json();
  return (j.Answer||[]).find(x=>x.type===1)?.data||"";
 }catch(_){return "";}
}
const hosts=["flixer.su","plsdontscrapemelove.flixer.su"];
const ips=await Promise.all(hosts.map(dns));
const maps=hosts.map((h,i)=>ips[i]?"MAP "+h+" "+ips[i]:"").filter(Boolean);
const args=["--no-sandbox",...(maps.length?["--host-resolver-rules="+maps.join(", ")]:[])];
const browser=await chromium.launch({headless:true,args});
const ctx=await browser.newContext({viewport:{width:1300,height:800}});
const page=await ctx.newPage();
const cases=[];
const pending=[];
const seen=new Set();
page.on("response",resp=>{
 const u=resp.url();
 if(!/\/api\/tmdb\/(?:movie|tv)\//.test(u)||!/\/images(?:\?|$)/.test(u))return;
 const req=resp.request(), key=req.method()+" "+new URL(u).pathname+" "+resp.status();
 if(seen.has(key))return;
 seen.add(key);
 pending.push((async()=>{
  const h=await req.allHeaders(),body=await resp.text();
  const candidate={
    status:resp.status(),source:(h["x-server"]||"").slice(0,24),
    suppliedKey:h["x-api-key"]||"",
    body,onlySources:h["x-only-sources"]||"",
    urlPath:new URL(u).pathname
  };
  cases.push(candidate);
 })().catch(e=>console.log("BROWSER_CAPTURE_WARN",String(e).slice(0,120))));
});
try {
 await page.goto("https://flixer.su/watch/movie/9502",{waitUntil:"domcontentloaded",timeout:40000});
 await page.waitForTimeout(16000);
 await Promise.allSettled(pending);
 const matches=cases.filter(c=>c.status===200&&c.suppliedKey.length===64&&c.body.length>100);
 console.log("BROWSER_SOURCE_FIXTURE_SUMMARY",JSON.stringify({
   requests:cases.length,validKeyResponses:matches.length,
   statuses:cases.map(c=>c.status),sources:cases.map(c=>c.source),
   ciphertextLengths:cases.map(c=>c.body.length)
 }));
 if(matches.length){
  await writeFile("/tmp/flixer-fixture.json",JSON.stringify(matches[0]));
  console.log("BROWSER_SOURCE_FIXTURE_READY");
 } else {
  console.log("BROWSER_SOURCE_FIXTURE_NOT_AVAILABLE");
 }
} catch(e){console.log("BROWSER_SOURCE_CAPTURE_ERROR",String(e).slice(0,180))}
finally {await ctx.close();await browser.close();}

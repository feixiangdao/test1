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
const browser=await chromium.launch({headless:process.env.FLIXER_HEADED!=="1",args});
const ctx=await browser.newContext({viewport:{width:1300,height:800}});
const page=await ctx.newPage();
page.on("console",m=>{if(/WASM|source|error/i.test(m.text()))console.log("BROWSER_RUNTIME_NOTE",m.text().slice(0,170))});
const cases=[];
const pending=[];
const seen=new Set();
page.on("response",resp=>{
 const u=resp.url();
 if(!/\/api\/tmdb\/(?:movie|tv)\//.test(u)||!/\/images(?:\?|$)/.test(u))return;
 const req=resp.request();
 pending.push((async()=>{
  const h=await req.allHeaders();
  const key=req.method()+" "+new URL(u).pathname+" "+resp.status()+" "+(h["x-server"]||"")+" "+(h["x-only-sources"]||"");
  if(seen.has(key))return;
  seen.add(key);
  const body=await resp.text();
  const candidate={
    status:resp.status(),source:(h["x-server"]||"").slice(0,24),
    suppliedKey:h["x-api-key"]||"",
    body,onlySources:h["x-only-sources"]||"",
    urlPath:new URL(u).pathname,headerNames:Object.keys(h).filter(k=>k.startsWith("x-"))
  };
  cases.push(candidate);
 })().catch(e=>console.log("BROWSER_CAPTURE_WARN",String(e).slice(0,120))));
});
try {
 const target=process.env.FLIXER_TARGET_URL||"https://flixer.su/watch/movie/9502";
 if(!/^https:\/\/flixer\.su\/watch\/(movie|tv)\/[0-9/]+$/.test(target))throw Error("UNSUPPORTED_TEST_TARGET");
 await page.goto(target,{waitUntil:"domcontentloaded",timeout:40000});
 await page.waitForTimeout(16000);
 await Promise.allSettled(pending);
 const matches=cases.filter(c=>c.status===200&&c.suppliedKey.length===64&&c.body.length>100);
 console.log("BROWSER_SOURCE_FIXTURE_SUMMARY",JSON.stringify({
   requests:cases.length,validKeyResponses:matches.length,
   statuses:cases.map(c=>c.status),sources:cases.map(c=>c.source),
   ciphertextLengths:cases.map(c=>c.body.length),headerNames:[...new Set(cases.flatMap(c=>c.headerNames))]
 }));
 if(matches.length){
  const audited=[];
  for(const c of matches){
   const result=await page.evaluate(async(arg)=>{
     const wasm=window.wasmImgData;
     if(!wasm||typeof wasm.process_img_data!=="function")return {available:false,decoded:false};
     try{
       const data=JSON.parse(await wasm.process_img_data(arg.body,arg.key));
       const arr=Array.isArray(data?.sources)?data.sources:[];
       return {available:true,decoded:true,entries:arr.length,media:arr.filter(x=>typeof x?.url==="string"&&x.url.startsWith("http")).length};
     }catch(e){return {available:true,decoded:false,error:String(e).slice(0,45)}}
   },{body:c.body,key:c.suppliedKey});
   audited.push({server:c.source||"list",mediaRequest:c.onlySources==="1",...result});
  }
  console.log("BROWSER_WASM_SELFTEST",JSON.stringify(audited));
  const picked=matches.find(c=>c.onlySources==="1" && c.source==="alpha") || matches.find(c=>c.onlySources==="1") || matches[0];
  await writeFile("/tmp/flixer-fixture.json",JSON.stringify(picked));
  console.log("BROWSER_SELECTED_SOURCE_KIND",JSON.stringify({server:picked.source||null,isMediaRequest:picked.onlySources==="1",ciphertextBytes:picked.body.length}));
  console.log("BROWSER_SOURCE_FIXTURE_READY");
 } else {
  console.log("BROWSER_SOURCE_FIXTURE_NOT_AVAILABLE");
 }
} catch(e){console.log("BROWSER_SOURCE_CAPTURE_ERROR",String(e).slice(0,180))}
finally {await ctx.close();await browser.close();}

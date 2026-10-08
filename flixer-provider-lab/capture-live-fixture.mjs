import { chromium } from "playwright";
import {writeFile} from "node:fs/promises";
const HOST="plsdontscrapemelove.flixer.su";
let ip="";
try {
  const r=await fetch("https://dns.google/resolve?name="+HOST+"&type=A&cd=true",{signal:AbortSignal.timeout(9000)});
  const j=await r.json();ip=(j.Answer||[]).find(x=>x.type===1)?.data||"";
}catch(e){console.log("DNS_LOOKUP_ERROR",String(e).slice(0,120))}
const args=["--no-sandbox"];
if(ip)args.push("--host-resolver-rules=MAP flixer.su "+ip+", MAP "+HOST+" "+ip);
const browser=await chromium.launch({headless:true,args});
const context=await browser.newContext({viewport:{width:1365,height:900}});
const page=await context.newPage();
let item=null;
const promises=[];
page.on("response",r=>{
 const u=r.url(),req=r.request();
 if(!u.includes("/api/tmdb/movie/9502/images")||item||r.status()!==200)return;
 const headers=req.headers(),key=headers["x-api-key"];
 if(!/^[0-9a-f]{64}$/i.test(key||"")) {
   console.log("CIPHER_REQUEST_KEY_NOT_AVAILABLE",{status:r.status(),keys:Object.keys(headers).filter(x=>x.startsWith("x-"))});
   return;
 }
 item={status:r.status(),suppliedKey:key,body:""};
 promises.push(r.text().then(t=>{item.body=t;console.log("LIVE_CIPHER_CAPTURED",{status:r.status(),bytes:t.length,hasKey:true})}).catch(e=>console.log("CIPHER_BODY_ERROR",String(e))));
});
try{await page.goto("https://flixer.su/watch/movie/9502",{waitUntil:"domcontentloaded",timeout:38000});await page.waitForTimeout(16000)}catch(e){console.log("BROWSER_PAGE_ERROR",String(e).slice(0,300))}
await Promise.allSettled(promises);
if(item?.body?.length>100){
 await writeFile("/tmp/flixer-fixture.json",JSON.stringify(item));
 console.log("LIVE_CIPHER_FIXTURE_READY");
}else{
 console.log("LIVE_CIPHER_FIXTURE_UNAVAILABLE");
 process.exitCode=2;
}
await context.close();await browser.close();

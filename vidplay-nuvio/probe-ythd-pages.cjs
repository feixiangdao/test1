const {chromium}=require("playwright");
const TARGET="https://ythd.org/embed/tt5442430";
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const ctx=await browser.newContext({viewport:{width:1400,height:840},userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"});
 const page=await ctx.newPage(),list=[];
 page.on("request",r=>{
   const u=r.url();if(/ythd\.org|stellarconductornexus\.com/i.test(u)) list.push({kind:"req",host:new URL(u).host,path:new URL(u).pathname,method:r.method(),hasBody:!!r.postData()});
 });
 page.on("response",async r=>{
   const u=r.url();if(!/ythd\.org|stellarconductornexus\.com/i.test(u))return;
   const entry={kind:"res",host:new URL(u).host,path:new URL(u).pathname,status:r.status(),mime:r.headers()["content-type"]||""};
   list.push(entry);
   if(/\/embed\/|\/vs_src\.php|\/assets\/sbx\.js/.test(u)){
     try {
       const t=await r.text();entry.len=t.length;
       entry.flags={dataHash:/data-hash/i.test(t),stellar:/stellarconductornexus/i.test(t),cloudnestra:/cloudnestra/i.test(t),iframe:/iframe/i.test(t),hls:/\.m3u8/i.test(t),fetch:/fetch\s*\(|\.ajax\(|XMLHttpRequest/i.test(t)};
       for(const term of ["vs_src.php","stellarconductornexus.com","data-hash","m3u8","cloudnestra.com","<iframe","file:"]){
          let i=t.indexOf(term);if(i>=0) {
            // Remove potential secret values from logging before sharing publicly.
            let excerpt=t.slice(Math.max(0,i-90),i+190).replace(/https?:\/\/[^\s"'<>]+/g,(x)=>{try{return new URL(x).host}catch(e){return"[url]"}});
            (entry.hints||(entry.hints=[])).push({term,sample:excerpt.replace(/[A-Za-z0-9_-]{30,}/g,"[redacted]").slice(0,230)});
          }
       }
     }catch(e){entry.error=e.message.slice(0,70)}
   }
 });
 try{const resp=await page.goto(TARGET,{waitUntil:"domcontentloaded",timeout:26000});await page.waitForTimeout(5500);
 console.log("PAGE",JSON.stringify({status:resp.status(),title:await page.title(),frames:page.frames().map(f=>{let u=f.url();try{let a=new URL(u);return{host:a.host,path:a.pathname}}catch(e){return{url:u}}})}));
 for(const target of [
   {url:"https://ythd.org/vs_src.php",referer:TARGET},
   {url:"https://stellarconductornexus.com/embed/movie/tt5442430",referer:TARGET},
   {url:"https://stellarconductornexus.com/embed/player/movie/tt5442430",referer:"https://stellarconductornexus.com/embed/movie/tt5442430"}
 ]){try{let r=await ctx.request.get(target.url,{headers:{referer:target.referer},timeout:12000});let t=await r.text();console.log("DIRECT",JSON.stringify({host:new URL(target.url).host,path:new URL(target.url).pathname,status:r.status(),len:t.length,playerToken:/player|video|iframe|m3u8/i.test(t),challenge:/Just a moment|Turnstile|challenge-platform/i.test(t)}))}catch(e){console.log("DIRECT_ERROR",new URL(target.url).pathname,e.message.slice(0,100))}}
 console.log("NETWORK",JSON.stringify(list).slice(0,28000));
 }catch(e){console.log("ERROR",e.message.slice(0,200))}
 await browser.close();
})().catch(e=>{console.error("FATAL",e.stack);process.exitCode=1});

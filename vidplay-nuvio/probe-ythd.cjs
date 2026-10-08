const {chromium}=require("playwright");
const target="https://ythd.org/embed/tt5442430";
const safe=(url)=>{try{let x=new URL(url);return {host:x.hostname,path:x.pathname.slice(0,75),media:/\.m3u8(?:[?#]|$)/i.test(url)}}catch(_){return{invalid:true}}};
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const context=await browser.newContext({userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",viewport:{width:1366,height:850}});
 const page=await context.newPage();
 const traffic=[];
 page.on("response",r=>{let u=r.url();if(/ythd\.org|cloudnestra|\.m3u8|\.mp4|\.mpd|tmstr\d|cdn/i.test(u))traffic.push({...safe(u),status:r.status()});});
 page.on("framenavigated",f=>{if(f!==page.mainFrame())console.log("FRAME",JSON.stringify(safe(f.url())))});
 try{
 const res=await page.goto(target,{waitUntil:"domcontentloaded",timeout:26000});
 await page.waitForTimeout(5000);
 const info=await page.evaluate(()=>({
 title:document.title,
 hashes:[...document.querySelectorAll("[data-hash]")].map(e=>({tag:e.tagName,attribute:"data-hash",length:e.getAttribute("data-hash")?.length})).slice(0,8),
 frames:[...document.querySelectorAll("iframe")].map(e=>({src:e.src?new URL(e.src).hostname+" "+new URL(e.src).pathname.slice(0,75):"",hasSrc:!!e.getAttribute("src")})),
 scripts:[...document.scripts].map(e=>e.src).filter(Boolean).slice(0,20),
 playerJS:document.documentElement.innerHTML.includes("cloudnestra"),
 htmlLength:document.documentElement.innerHTML.length
 }));
 console.log("TOP",JSON.stringify({status:res.status(),...info}));
 let full=await page.content();
 let hash=full.match(/data-hash=["']([^"']+)["']/i)?.[1]||"";
 console.log("DATA_HASH",JSON.stringify({exists:!!hash,len:hash.length}));
 if(hash){
    const rcp="https://cloudnestra.com/rcp/"+encodeURIComponent(hash);
    let a=await context.request.get(rcp,{headers:{referer:target},timeout:12000});
    let html=await a.text();
    console.log("RCP",JSON.stringify({status:a.status(),len:html.length,cloudnestra:html.includes("prorcp")}));
    let ph=html.match(/src:\s*['"]\/prorcp\/([^'"]+)['"]/i)?.[1]||html.match(/["']\/prorcp\/([^'"]+)['"]/i)?.[1]||"";
    console.log("PRORCP_HASH",JSON.stringify({exists:!!ph,len:ph.length}));
    if(ph){
      let b=await context.request.get("https://cloudnestra.com/prorcp/"+encodeURIComponent(ph),{headers:{referer:rcp},timeout:12000});
      let h2=await b.text();
      let fm=h2.match(/file:\s*["']([^"']+)["']/i)?.[1]||"";
      console.log("PRORCP",JSON.stringify({status:b.status(),len:h2.length,hasFile:!!fm,hasHLS:/\.m3u8/i.test(fm),containsVariantPlaceholder:/\{v\d+\}/i.test(fm),potentialURLs:fm.split(/\s+or\s+/i).length}));
      if(fm){
         let raw=fm.split(/\s+or\s+/i)[0].trim().replace(/\{v1\}/gi,"cloudnestra.com");
         if(/^https:\/\/[^ "']+\.m3u8(?:[?#]|$)/i.test(raw)){
            let pr=await context.request.get(raw,{headers:{referer:"https://cloudnestra.com/"},timeout:12000});
            let txt=await pr.text();
            console.log("HLS_VALIDATION",JSON.stringify({status:pr.status(),valid:txt.startsWith("#EXTM3U"),length:txt.length,variants:(txt.match(/#EXT-X-STREAM-INF/g)||[]).length,cdn:safe(raw).host}));
         }
      }
    }
 }
 console.log("TRAFFIC",JSON.stringify(traffic.slice(0,50)));
 }catch(e){console.log("ERROR",e.message.slice(0,350));}
 finally{await browser.close()}
})().catch(e=>{console.error("FATAL",e.message);process.exitCode=1});

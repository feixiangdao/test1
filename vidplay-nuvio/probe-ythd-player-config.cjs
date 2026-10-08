const {chromium}=require("playwright");
const target="https://ythd.org/embed/tt5442430";
const phrases=["api/","source","manifest","m3u8","stream","token","decrypt","encrypted","hls.load","fetch(","CONFIG","vsdec","initPlayer","quality","sources","playerData","videoUrl","playlist"];
function around(t,term){const i=t.toLowerCase().indexOf(term.toLowerCase());if(i<0)return null;return t.slice(Math.max(0,i-110),i+230).replace(/https?:\/\/[^\s"'<>]+/g,x=>{try{return "<"+new URL(x).hostname+">"}catch(e){return"<url>"}}).replace(/[A-Za-z0-9_-]{35,}/g,"[opaque]")}
(async()=>{
 const b=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const ctx=await b.newContext({userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"});
 const page=await ctx.newPage(), captured=[];
 page.on("response",async r=>{
  const u=r.url();
  if(!(/ythd\.org\/vs_src\.php|stellarconductornexus\.com\/embed\/(movie|player|iframe_player\/assets\/(player|vsdec))/i.test(u)))return;
  const item={host:new URL(u).host,path:new URL(u).pathname,status:r.status()};
  try{const t=await r.text();item.len=t.length;item.samples=phrases.map(x=>({keyword:x,text:around(t,x)})).filter(x=>x.text).slice(0,22);if(item.path==="/vs_src.php"){let j=JSON.parse(t);item.jsonKeys=Object.keys(j);if(j.src){try{let u2=new URL(j.src);item.srcHost=u2.hostname;item.srcPath=u2.pathname}catch(e){}}}
   if(/\/embed\/player\/|\/embed\/movie\//.test(item.path)){
    item.inlineScriptCount=(t.match(/<script\b/gi)||[]).length;
    item.htmlTop=t.slice(0,600).replace(/https?:\/\/[^\s"'<>]+/g,"[url]");
   }
   if(/\/assets\/player\.js/.test(item.path)){
    item.apiPatterns=[...t.matchAll(/['"]((?:\/api\/|api\/|https:\/\/)[^\s"'\\]{2,120})['"]/g)].slice(0,20).map(x=>x[1].replace(/[A-Za-z0-9_-]{35,}/g,"[opaque]"));
   }
  }catch(e){item.error=e.message.slice(0,90)}
  captured.push(item);
 });
 try{await page.goto(target,{waitUntil:"domcontentloaded",timeout:24000});await page.waitForTimeout(6500);
 const endpoint="https://ythd.org/vs_src.php?type=movie&id=tt5442430";
 try{let r=await ctx.request.get(endpoint,{headers:{referer:target,"X-Requested-With":"XMLHttpRequest"},timeout:13000});let t=await r.text();let j={};try{j=JSON.parse(t)}catch(e){}console.log("API_DIRECT",JSON.stringify({status:r.status(),len:t.length,keys:Object.keys(j),srcHost:j.src?new URL(j.src).host:null,srcPath:j.src?new URL(j.src).pathname:null}));}catch(e){console.log("API_DIRECT_ERR",e.message.slice(0,120))}
 console.log("CAPTURE",JSON.stringify(captured).slice(0,27500));
 }catch(e){console.log("ERR",e.message.slice(0,170))}
 await b.close();
})().catch(e=>{console.error(e.stack);process.exitCode=1});

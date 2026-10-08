const {chromium}=require("playwright");
const cases=[
{kind:"movie",page:"https://vidplay.top/movie/51381-watch-life-2017-online",servers:["V2","V3"]},
{kind:"tv",page:"https://vidplay.top/watchseries/abbott-elementary-online-free/season/1/episode/1",servers:["V2","V3"]}
];
(async()=>{
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
for(const target of cases){
 const context=await browser.newContext({userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",viewport:{width:1300,height:800}});
 const page=await context.newPage();
 const signals=[];
 page.on("request",r=>{const u=r.url();if(/(?:\/ajax\/|\/embed\/|\.m3u8|\.mp4|\.mpd)/i.test(u)){let x;try{x=new URL(u)}catch(e){return}signals.push({kind:"request",host:x.hostname,path:x.pathname,method:r.method(),queryKeys:[...x.searchParams.keys()]});}});
 page.on("response",async r=>{const u=r.url();if(/(?:\/ajax\/|\/embed\/|\.m3u8|\.mp4|\.mpd)/i.test(u)){let x;try{x=new URL(u)}catch(e){return}let info={kind:"response",host:x.hostname,path:x.pathname,status:r.status(),queryKeys:[...x.searchParams.keys()]};if(/\/ajax\//.test(x.pathname)){try{let text=await r.text();info.bodyLength=text.length;info.challenge=/Just a moment|challenge-platform/i.test(text);info.hasIframe=/<iframe\b/i.test(text);info.hasMedia=/\.m3u8|\.mp4|\.mpd/i.test(text);}catch(e){info.readError=e.message.slice(0,100)}}signals.push(info);}});
 try{
  const rr=await page.goto(target.page,{waitUntil:"domcontentloaded",timeout:26000});await page.waitForTimeout(1100);
  console.log("CASE",JSON.stringify({kind:target.kind,pageStatus:rr.status(),title:await page.title()}));
  for(const name of target.servers){
    let el=page.locator("a").filter({hasText:new RegExp("#"+name+"\\b")}).first();
    try{if(!await el.count()){console.log("NOT_FOUND",name);continue;}await el.click({timeout:4000});await page.waitForTimeout(1800);
       const frames=page.frames().map(f=>{try{const u=new URL(f.url());return {host:u.host,path:u.pathname}}catch(e){return {path:"blank"}}});
       console.log("SERVER",JSON.stringify({name,frames,signals:signals.slice(-13)}));
    }catch(e){console.log("SERVER_ERROR",JSON.stringify({name,error:e.message.slice(0,220)}))}
  }
 }catch(e){console.log("CASE_ERROR",JSON.stringify({kind:target.kind,error:e.message.slice(0,220)}))}
 await context.close();
}
await browser.close();
})().catch(e=>{console.error("FATAL",e.stack);process.exitCode=1});
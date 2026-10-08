const {chromium}=require("playwright");
const root="https://ythd.org/embed/tt5442430";
function safeURL(v,b){try{const u=new URL(v,b);return{host:u.host,path:u.pathname,keys:[...u.searchParams.keys()]}}catch(_){return null}}
(async()=>{
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"});
const page=await ctx.newPage(),records=[],metaURLs=[],playerURLs=[];
page.on("response",async r=>{
 const u=r.url(),h=new URL(u).hostname,path=new URL(u).pathname;
 if(!/stellarconductornexus\.com|data\.vidsrc\.sh|data\.vidsrcme\.ru/i.test(h))return;
 const record={host:h,path,status:r.status()};
 if(/^\/embed\/(?:movie|player\/movie)/.test(path)){
  try{
   const html=await r.text(),m=html.match(/window\.(?:CONFIG|CFG)\s*=\s*(\{[^\n]*\})\s*;/);
   if(m){
    const o=JSON.parse(m[1]);
    record.configuration={keys:Object.keys(o),api:safeURL(o.api,u),metaApi:safeURL(o.metaApi,u),streamBase:safeURL(o.streamBase,u),turnstile:!!o.turnstile,turnstileVerify:safeURL(o.turnstileVerify,u),apiTokenPresent:!!o.apiToken,apiTokenRefresh:!!o.apiTokenRefresh,playerUrl:safeURL(o.playerUrl,u)};
    if(o.metaApi)metaURLs.push(o.metaApi);if(o.api)playerURLs.push(o.api);
   }
  }catch(e){record.error=e.message.slice(0,100)}
 }
 if(/data\.vidsrc/.test(h)) {
  record.kind="DATA_API";try{const txt=await r.text();record.len=txt.length;const o=JSON.parse(txt);record.keys=Object.keys(o);record.statusCode=o.status_code;record.contentKeys=o.data?Object.keys(o.data):[];record.streamDataType=typeof o.data?.stream_urls;record.encrypted=!!o.vs}catch(e){record.parseFail=e.message.slice(0,100)}
 }
 records.push(record);
});
try{
  await page.goto(root,{waitUntil:"domcontentloaded",timeout:25000});
  await page.waitForTimeout(6500);
  const uniq=[...new Set(metaURLs)];
  for(const u of uniq.slice(0,2)){
   try{
    const r=await ctx.request.get(u,{timeout:9000,headers:{referer:"https://stellarconductornexus.com/"}});
    let js;try{js=await r.json()}catch(e){}
    records.push({step:"EXPLICIT_METADATA_FETCH",url:safeURL(u),status:r.status(),jsonKeys:js?Object.keys(js):[],statusCode:js?.status_code,contentKeys:js?.data?Object.keys(js.data):[],hasStreams:!!js?.data?.stream_urls});
   }catch(e){records.push({step:"EXPLICIT_METADATA_FETCH",url:safeURL(u),error:e.message.slice(0,100)})}
  }
  console.log("RESULT",JSON.stringify({records,metaAPIcount:uniq.length,playerAPIcount:playerURLs.length}).slice(0,18500));
}catch(e){console.log("ERROR",e.message.slice(0,150))}
finally{await browser.close()}
})().catch(e=>{console.error("FATAL",e.message);process.exitCode=1});
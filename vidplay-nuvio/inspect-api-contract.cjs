const {chromium}=require('playwright');
const root='https://ythd.org/embed/tt5442430';
const hostOnly=(url)=>{try{const u=new URL(url);return{host:u.hostname,path:u.pathname,queryKeys:[...u.searchParams.keys()].filter(k=>!/^utm_/.test(k))}}catch(e){return{bad:true}}};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',viewport:{width:1280,height:800}});
 const page=await ctx.newPage();const responses=[];
 page.on('response',async r=>{
   const u=r.url();if(!/vidsrcme\.ru|stellarconductornexus\.com|ythd\.org|challenges\.cloudflare\.com/.test(u))return;
   const info={...hostOnly(u),status:r.status(),contentType:(r.headers()['content-type']||'').split(';')[0]};
   if(/stellarconductornexus\.com\/embed\/(movie\/|player\/)/.test(u)){
      try{
        const html=await r.text();
        const m=html.match(/window\.(?:CONFIG|CFG)\s*=\s*(\{[^\n]*\})/);
        if(m){const cfg=JSON.parse(m[1]);info.cfg={keys:Object.keys(cfg),api:cfg.api?hostOnly(cfg.api):null,metaApi:cfg.metaApi?hostOnly(cfg.metaApi):null,streamBase:cfg.streamBase?hostOnly(cfg.streamBase):null,hasSingleUseToken:!!cfg.apiToken,tokenRefreshEnabled:!!cfg.apiTokenRefresh,turnstile:!!cfg.turnstile,turnstileVerify:cfg.turnstileVerify?hostOnly(cfg.turnstileVerify):null,playerUrl:cfg.playerUrl?hostOnly(new URL(cfg.playerUrl,u)):null};}
      }catch(e){info.parseError=e.message.slice(0,110)}
   }
   if(/data\.vidsrcme\.ru/.test(u)){try{const txt=await r.text();if(txt.length<150000){let json=JSON.parse(txt);info.bodyShape={keys:Object.keys(json),statusCode:json.status_code,hasStreamData:!!json.data?.stream_urls,streamDataKind:typeof json.data?.stream_urls,vsWasm:!!json.vs?.wasm_url};}}catch(e){info.bodyErr=e.message.slice(0,80)}}
   responses.push(info);
 });
 try{
  const resp=await page.goto(root,{waitUntil:'domcontentloaded',timeout:27000});
  await page.waitForTimeout(8000);
  console.log('SUMMARY',JSON.stringify({rootStatus:resp.status(),frameHosts:page.frames().map(f=>hostOnly(f.url())),apiResponses:responses.filter(x=>/data\.vidsrcme\.ru/.test(x.host)),otherResponses:responses.filter(x=>/stellarconductornexus\.com\/embed\/(movie|player)/.test(x.host+x.path)),turnstileRequests:responses.filter(x=>/challenges\.cloudflare/.test(x.host)).map(x=>({status:x.status,path:x.path})).slice(0,12)}).slice(0,23000));
 }catch(e){console.log('ERR',e.message.slice(0,180))}
 finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
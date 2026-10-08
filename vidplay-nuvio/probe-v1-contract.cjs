const {chromium}=require('playwright');
const url='https://ythd.org/embed/tt5442430';
const redactUrl=s=>{try{let x=new URL(s);return{xHost:x.hostname,xPath:x.pathname,keys:Array.from(x.searchParams.keys())}}catch(e){return null}};
(async()=>{
const b=await chromium.launch({headless:true,args:['--no-sandbox']});const p=await b.newPage({viewport:{width:1280,height:800},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'});
const infos=[];
p.on('response',async r=>{try{
 const u=new URL(r.url());if(!/stellarconductornexus\.com$/.test(u.hostname)||!/^\/embed\/(?:movie\/|player\/movie\/)/.test(u.pathname))return;
 let html=await r.text(),m=html.match(/window\.(?:CFG|CONFIG)\s*=\s*(\{[^\n]+?\})\s*;/);if(!m)return;let c=JSON.parse(m[1]);
 infos.push({path:u.pathname,status:r.status(),keys:Object.keys(c),metaApi:redactUrl(c.metaApi),api:redactUrl(c.api),playerUrl:redactUrl(c.playerUrl?new URL(c.playerUrl,u.href).href:''),verify:redactUrl(c.turnstileVerify),turnstile:!!c.turnstile,hasToken:!!c.apiToken,tokenRefresh:!!c.apiTokenRefresh,streamBase:redactUrl(c.streamBase)});
 }catch(e){infos.push({err:e.message.slice(0,130)})}});
try{let r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:27000});await p.waitForTimeout(7000);console.log('CONFIG_SHAPES',JSON.stringify({rootStatus:r.status(),frames:p.frames().map(f=>{try{return new URL(f.url()).hostname}catch(e){return""}}),infos}));}catch(e){console.log('FAIL',e.message.slice(0,180))}
await b.close()
})().catch(e=>{console.error(e.message);process.exitCode=1});

const {chromium}=require('playwright');
const target='https://ythd.org/embed/tt5442430';
const keep=(line)=>/api|endpoint|stream|source|src|player|vsFetch|vsdec|fetch\(|challenge|turnstile|embed\/movie|embed\/player|videoUrl|\.m3u8/i.test(line);
function redact(s){return s.replace(/[A-Za-z0-9+/=_-]{45,}/g,'[opaque]').replace(/https?:\/\/[^\s"'<>]+/g,'[url]')}
(async()=>{
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await b.newPage({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'});
let found=[];
p.on('response',async r=>{
 const path=new URL(r.url()).pathname;
 if(new URL(r.url()).hostname!=='stellarconductornexus.com')return;
 if(!(/\/embed\/(movie|player\/movie|iframe_player\/assets\/(?:player|vsdec)\.js)/.test(path)))return;
 try{
 const txt=await r.text();
 let lines=txt.split(/\r?\n/);
 let picked=lines.map((line,i)=>({i:i+1,text:line.trim()})).filter(x=>keep(x.text));
 if(path.endsWith('player.js'))picked=picked.filter(x=>/api|fetch\(|vsFetch|videoUrl|\.m3u8|stream|decrypt|token/i.test(x.text));
 const a={path,status:r.status(),totalLines:lines.length,items:picked.slice(0,65).map(x=>({line:x.i,text:redact(x.text.slice(0,220))}))};
 found.push(a);
 }catch(e){found.push({path,status:r.status(),error:e.message.slice(0,100)})}
});
await p.goto(target,{waitUntil:'domcontentloaded',timeout:24000});await p.waitForTimeout(5200);
console.log('EXTRACT',JSON.stringify(found).slice(0,26000));
await b.close();
})().catch(e=>{console.error(e.message);process.exitCode=1});

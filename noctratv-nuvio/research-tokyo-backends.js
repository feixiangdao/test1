'use strict';
const PAGE='https://noctratv.com/watch/tv/209867/1/1';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';
async function txt(url){
  const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html,*/*'}});
  if(!r.ok)throw new Error(url+' HTTP '+r.status);
  return r.text();
}
function abs(x,b){try{return new URL(x,b).href}catch{return''}}
(async()=>{
  const html=await txt(PAGE);
  const srcs=[...html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/ig)].map(m=>abs(m[1],PAGE));
  // Known current/static fallback from latest alias research.
  srcs.push('https://noctratv.com/assets/pStreamBackend-BO-fiiV-.js');
  for(const u of [...new Set(srcs)]){
    let s;try{s=await txt(u)}catch(e){console.log('ERR '+u+' '+e.message);continue}
    if(!/corazon|kickassanime|anikai/i.test(s))continue;
    console.log('ASSET '+u+' bytes='+s.length);
    const domains=[...new Set((s.match(/https?:\\?\/\\?\/[^"'\x60\\s)]+/g)||[])
      .map(x=>x.replace(/\\\//g,'/')).map(x=>{try{return new URL(x).hostname}catch{return''}}).filter(Boolean))];
    console.log('DOMAINS '+domains.join(' | '));
    for(const key of ['corazon','kickassanime','anikai','/mplayer/','zstream-tokyo-barcelona-sub','sourceId','family===','family==','case"tokyo"',"case'tokyo'",'zstream-tokyo-']){
      let p=0,n=0;
      while((p=s.toLowerCase().indexOf(key,p))>=0 && n<30){
        n++;
        const lo=Math.max(0,p-7000),hi=Math.min(s.length,p+14000);
        console.log('\n=== '+key+' #'+n+' @'+p+' ===');
        console.log(s.slice(lo,hi));
        p+=key.length;
      }
    }
  }
})().catch(e=>{console.error(e);process.exitCode=1});
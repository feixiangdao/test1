'use strict';
const ROOT='https://atlantic.st/';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
async function txt(url){
  const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html,*/*'}});
  if(!r.ok)throw new Error(url+' HTTP '+r.status);
  return r.text();
}
(async()=>{
  const html=await txt(ROOT);
  const js=[...html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/ig)]
    .map(m=>new URL(m[1],ROOT).href);
  console.log('SCRIPTS '+js.join(' | '));
  for(const u of js){
    let s;try{s=await txt(u)}catch(e){console.log('ERR '+u+' '+e.message);continue}
    if(!/helios|stream\.hls\.lol|hl_/i.test(s))continue;
    console.log('\nASSET '+u+' bytes='+s.length);
    for(const needle of ['stream.hls.lol','/helios','hl_','ns_','AES-GCM','decrypt','Moscow','Novo','Omsk']){
      let p=0,n=0;
      while((p=s.indexOf(needle,p))>=0&&n<12){
        console.log('\n=== '+needle+' #'+(++n)+' @'+p+' ===');
        console.log(s.slice(Math.max(0,p-7000),Math.min(s.length,p+14000)));
        p+=needle.length;
      }
    }
  }
})().catch(e=>{console.error(e);process.exitCode=1});
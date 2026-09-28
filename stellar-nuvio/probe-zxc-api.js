const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36';
const BASE='https://player.zxcprime.xyz';
async function get(url){
  const r=await fetch(url,{headers:{'User-Agent':UA,Referer:BASE+'/'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  return {status:r.status,url:r.url,text:await r.text()};
}
function around(text,pos,n=7000){return text.slice(Math.max(0,pos-n),Math.min(text.length,pos+n)).replace(/\s+/g,' ')}
(async()=>{
  const h=await get(BASE+'/player/movie/550');
  const srcs=[...h.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>new URL(m[1],h.url).href);
  console.log('ROUTE',h.status,h.url,'scripts',srcs.length);
  for(const u of srcs){
    let j; try{j=await get(u)}catch(e){console.log('ERR',u,e.message);continue}
    const t=j.text;
    const markers=[
      'tigasmukha',
      'i=t?[ed,...ec]:ec',
      'handleResetServers',
      'serverIndex:eL',
      'status:"queue"',
      'FIELD_MAP.path',
      '/backend_/sources/',
      'latestDate1',
      'sourcePath'
    ];
    let hit=false;
    for(const m of markers){
      let p=t.indexOf(m);
      if(p>=0){
        hit=true;
        console.log('\n===== MARKER',m,'FILE',u,'POS',p,'LEN',t.length,'=====');
        console.log(around(t,p,12000));
      }
    }
    if(hit){
      const strings=[...t.matchAll(/["']([A-Za-z][A-Za-z0-9_-]{2,40})["']/g)].map(x=>x[1]);
      const freq={}; for(const x of strings)freq[x]=(freq[x]||0)+1;
      console.log('\nCANDIDATE_STRINGS',Object.entries(freq).filter(([k,v])=>v>=1 && /^(?:[a-z][a-z0-9_-]{2,24})$/i.test(k)).sort((a,b)=>b[1]-a[1]).slice(0,350));
    }
  }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36';
const BASE='https://player.zxcprime.xyz';
async function get(url){
  const r=await fetch(url,{headers:{'User-Agent':UA,Referer:BASE+'/'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  return {status:r.status,url:r.url,text:await r.text()};
}
function uniq(a){return [...new Set(a)]}
(async()=>{
  const h=await get(BASE+'/player/movie/550');
  const srcs=[...h.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>new URL(m[1],h.url).href);
  console.log('ROUTE',h.status,h.url,'scripts',srcs.length);
  for(const u of srcs){
    let j; try{j=await get(u)}catch(e){continue}
    const t=j.text;
    if(!/tigasmukha|handleResetServers|serverIndex|status:"queue"|\/backend_\/sources\//.test(t)) continue;
    console.log('\nFILE',u,'LEN',t.length);

    // Print concise object-property inventories. These are far more useful than huge minified contexts.
    for(const key of ['path','name','label','id','server','display','title','status']){
      const re=new RegExp(key+':["\\\']([^"\\\']{1,80})["\\\']','g');
      const vals=[]; let m;
      while((m=re.exec(t))) vals.push(m[1]);
      console.log('PROP',key,uniq(vals).slice(0,250));
    }

    // Candidate arrays/objects near the player server state initializer.
    const markers=['handleResetServers','serverIndex','status:"queue"','tigasmukha','/backend_/sources/'];
    for(const marker of markers){
      let p=0,n=0;
      while((p=t.indexOf(marker,p))>=0&&n<6){
        const start=Math.max(0,p-50000), end=Math.min(t.length,p+8000);
        const seg=t.slice(start,end);
        console.log('\nMARK',marker,'POS',p);
        const objRe=/\{[^{}]{0,900}?(?:path|name|label|status):[^{}]{0,900}?\}/g;
        const objs=seg.match(objRe)||[];
        console.log('OBJECT_CANDIDATES',uniq(objs).slice(-80));
        const arrRe=/\[[^\[\]]{0,7000}?\]/g;
        const arrs=(seg.match(arrRe)||[]).filter(x=>/status|path|server|label|queue|available/.test(x));
        console.log('ARRAY_CANDIDATES',uniq(arrs).slice(-50));
        p+=marker.length;n++;
      }
    }

    // Find short string literals close to each /backend_/sources/ call.
    let q=0,k=0;
    while((q=t.indexOf('/backend_/sources/',q))>=0&&k<5){
      const seg=t.slice(Math.max(0,q-150000),q);
      const lits=[...seg.matchAll(/["']([A-Za-z][A-Za-z0-9_-]{2,32})["']/g)].map(x=>x[1]);
      console.log('PRE_SOURCE_LITERALS',uniq(lits).slice(-250));
      q+=10;k++;
    }
  }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

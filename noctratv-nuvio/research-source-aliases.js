'use strict';

const TARGETS=[
  'StreamVault','Zoisite','Sunstone','Silver','Iron',
  'Vidy','Miami','Boise','Orlando','Atlanta','Tampa','Portland',
  'Apollo','Vienna','Chase','Tokyo','Barcelona','Kyoto'
];
const PAGES=[
  'https://noctratv.com/watch/movie/238',
  'https://noctratv.com/watch/tv/1399/1/1',
  'https://noctratv.com/'
];
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';

async function txt(url){
  const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,*/*'}});
  if(!r.ok)throw new Error(url+' HTTP '+r.status);
  return r.text();
}
function abs(src,base){
  try{return new URL(src,base).href}catch(_){return''}
}
function scripts(html,base){
  const out=new Set(),re=/<script[^>]+src=["']([^"']+\.js[^"']*)["']/ig;
  let m;while((m=re.exec(html)))out.add(abs(m[1],base));
  const re2=/["']([^"']+\.(?:js|mjs)(?:\?[^"']*)?)["']/ig;
  while((m=re2.exec(html))){
    const u=abs(m[1],base);
    if(u&&new URL(u).hostname===new URL(base).hostname)out.add(u);
  }
  return [...out];
}
function urlsNear(s,i){
  const a=Math.max(0,i-1200),b=Math.min(s.length,i+1800);
  const frag=s.slice(a,b);
  return [...new Set((frag.match(/https?:\\?\/\\?\/[^"'\\s)]+/g)||[]).map(x=>x.replace(/\\\//g,'/')))].slice(0,12);
}
(async()=>{
  const assets=new Set();
  for(const p of PAGES){
    try{
      const h=await txt(p);
      console.log('PAGE '+p+' bytes='+h.length);
      scripts(h,p).forEach(x=>assets.add(x));
    }catch(e){console.log('PAGE ERR '+e.message)}
  }
  console.log('ASSETS '+assets.size);
  for(const u of assets){
    let s;
    try{s=await txt(u)}catch(e){console.log('ASSET ERR '+u+' '+e.message);continue}
    const domains=[...new Set((s.match(/https?:\\?\/\\?\/[^"'\\s)]+/g)||[]).map(function(x){
      try{return new URL(x.replace(/\\\//g,'/')).hostname}catch(_){return''}
    }).filter(Boolean))].sort();
    if(domains.length)console.log('\nDOMAINS '+u+' '+domains.join(' | '));
    const apiPaths=[...new Set((s.match(/["'`]\\?\/(?:api|v1|v2|graphql|sources?|providers?|servers?|playback)[^"'\`\\s]{0,180}/ig)||[])
      .map(x=>x.slice(1).replace(/\\\//g,'/')))].slice(0,250);
    if(apiPaths.length)console.log('API_PATHS '+u+' '+apiPaths.join(' | '));
    const interesting=[...new Set((s.match(/["'`][^"'\`]{0,100}(?:provider|source|server|playback)[^"'\`]{0,100}["'`]/ig)||[])
      .map(x=>x.slice(1,-1)).filter(x=>x.length<220))].slice(0,200);
    if(interesting.length)console.log('INTERESTING '+u+' '+interesting.join(' || '));
    for(const t of TARGETS){
      let from=0,found=0;
      while(found<6){
        const i=s.toLowerCase().indexOf(t.toLowerCase(),from);
        if(i<0)break;
        found++;from=i+t.length;
        const lo=Math.max(0,i-600),hi=Math.min(s.length,i+1000);
        const near=s.slice(lo,hi).replace(/\s+/g,' ');
        console.log('\nMATCH '+t+' asset='+u);
        console.log('NEAR '+near);
        const us=urlsNear(s,i);
        if(us.length)console.log('URLS '+us.join(' | '));
      }
    }
  }
})().catch(e=>{console.error(e);process.exitCode=1});

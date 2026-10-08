// Public asset diagnostic; no credential access or video downloads.
const b='https://flixer.su';
const urls=[b+'/assets/js/index-52585954.js',b+'/assets/js/VideoPlayer-52585954.js'];
const patterns=[
 {name:'API strings',regex:/\/api\/[A-Za-z0-9_./?=&-]{2,110}/g,max:65},
 {name:'media / player strings',regex:/stream[s]?|source[s]?|embed|player|server[s]?|m3u8|\.mp4|\.mpd|hls|tmdb|episode|proxy|videoUrl/gi,max:38},
 {name:'domains and paths',regex:/https?:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9_./?=&-]*)?/g,max:55},
 {name:'bundled file paths',regex:/assets\/js\/[A-Za-z0-9._-]+\.js/g,max:85}
];
async function main(){
 for(const url of urls){
  let content='';
  try {const r=await fetch(url,{signal:AbortSignal.timeout(15000)});content=await r.text();console.log('ASSET',url,r.status,content.length);}catch(e){console.log('ERROR',url,String(e));continue}
  for(const {name,regex,max} of patterns){
   const found=[...content.matchAll(regex)],uniq=[],seen=new Set();
   for(const m of found){const s=String(m[0]);if(!seen.has(s.toLowerCase())){seen.add(s.toLowerCase());uniq.push({s,p:m.index})};if(uniq.length>=max)break}
   console.log('PATTERN',name,'unique-count',uniq.length,'samples',JSON.stringify(uniq.map(x=>x.s)));
  }
  for(const re of [/\/api\/tmdb/g,/api\/[^"']{0,65}/g,/VideoPlayer-/g,/cineby.su/g,/streaming|watch\/movie|watch\/tv|fetchSources|fetchServers|playerSources|embedUrl|movieApi|videoUrl/gi]){
   let ms=[...content.matchAll(re)].slice(0,13);const seen=new Set();
   for(let m of ms){let s=content.slice(Math.max(0,m.index-260),Math.min(content.length,m.index+310)).replace(/[\n\r\t]/g,' ');if(seen.has(s))continue;seen.add(s);console.log('CONTEXT',String(re),m.index,s)}
  }
 }
}
main().catch(e=>{console.log('FATAL',e.message);process.exitCode=1});

async function detailed(){
  const base='https://flixer.su/assets/js/';
  for(const asset of ['VideoPlayer-52585954.js','PlayerEmbedPage-52585954.js','SearchPage-52585954.js']){
    let r=await fetch(base+asset,{signal:AbortSignal.timeout(16000)}),s=await r.text();
    console.log('DEEP ASSET',asset,r.status,s.length);
    const vocab=['/api/','server','sources','streamUrl','videoUrl','streaming','url:','m3u8','vidsrc','vidfast','vidlink','vidnest','videasy','vixsrc','getServers','fetchSources','getSources','playerConfig','streamSources','hlsUrl','sourceType','sourceId','plsdontscrapemelove','iframe','tmdbId','embed'];
    const skip=p=>/hls.js|Hls|FragmentTracker|handshake/i.test(s.slice(Math.max(0,p-40),p+60));
    for(const word of vocab){
      let re=new RegExp(word.replace(/[.*+?^$()|[\]{}]/g,'\\$&'),'gi'),ms=[...s.matchAll(re)];
      const a=ms.filter(x=>x.index>480000 && !skip(x.index)).slice(0,4);
      if(a.length)console.log('DEEP MATCH',asset,word,ms.length,JSON.stringify(a.map(x=>({offset:x.index,excerpt:s.slice(Math.max(0,x.index-170),x.index+230)}))));
    }
    const hosts=[...s.matchAll(/https?:\/\/([A-Za-z0-9_.-]+\.[A-Za-z]{2,})(?:\/[A-Za-z0-9_./?=&%-]+)?/g)]
      .filter(m=>m.index>460000)
      .map(m=>m[0]);
    console.log('DEEP URLs',asset,JSON.stringify([...new Set(hosts)].slice(0,100)));
    const end=s.slice(Math.max(0,s.length-8000));
    if(asset.includes('VideoPlayer'))console.log('VIDEO_PLAYER_TAIL',end);
  }
  for(const u of [
    'https://plsdontscrapemelove.flixer.su/api/tmdb/movie/550?language=en-US',
    'https://api.flixer.su/api/tmdb/movie/550?language=en-US'
  ]){
   try{
    let r=await fetch(u,{signal:AbortSignal.timeout(9000)}),t=await r.text();
    console.log('API CHECK',u,r.status,r.headers.get('content-type'),t.slice(0,500));
   }catch(e){console.log('API CHECK',u,String(e.message))}
  }
}
detailed().catch(e=>console.log('DEEP ERROR',String(e.message)));

async function sourceFunctions(){
 const names=['index-52585954.js','VideoPlayer-52585954.js','useQueries-52585954.js','useContentSections-52585954.js'];
 const patterns=['nc','ac','rc','oc','lc','xr','poster_sources','serverName','fetchMovie','fetchTV','sources-with-title'];
 for(const file of names) {
   const res=await fetch('https://flixer.su/assets/js/'+file,{signal:AbortSignal.timeout(15000)});
   const s=await res.text();
   console.log('FUNCTION_ASSET',file,res.status,s.length,'HEAD',s.slice(0,650));
   for(const p of patterns) {
     const escaped=p.replace(/[.*+?^$()|[\]{}]/g,'\\$&');
     const re=/^[a-z]{1,10}$/.test(p)?new RegExp('(?:^|[,{; ])'+escaped+'\\s*=','gm'):new RegExp(escaped,'g');
     const found=[...s.matchAll(re)].slice(0,p==='poster_sources'?8:3);
     for (const f of found) console.log('FUNCTION_CODE',file,p,f.index,s.slice(Math.max(0,f.index-600),f.index+2600));
   }
 }
}
sourceFunctions().catch(e=>console.log('FUNCTION ERROR',e.message));

async function inspectSourceEngine(){
  const url='https://flixer.su/assets/js/WatchPartyOverlay-52585954.js';
  const res=await fetch(url,{signal:AbortSignal.timeout(16000)}),s=await res.text();
  console.log('ENGINE_HEAD',res.status,s.length,s.slice(0,900));
  console.log('ENGINE_TAIL',s.slice(-2700));
  const terms=['poster_sources','/api/','sources','getSources','getStreams','server','provider','decrypt','resolve','watch/','/movie/','tmdbId','axios','https://','fetch(','fetch','function nc','function ac'];
  for(const term of terms){
    const re=new RegExp(term.replace(/[.*+?^$()|[\]{}]/g,'\\$&'),'gi');
    const all=[...s.matchAll(re)];
    console.log('ENGINE COUNT',term,all.length);
    for(const m of all.slice(0,term==='poster_sources'?13:5))console.log('ENGINE CTX',term,m.index,s.slice(Math.max(0,m.index-380),m.index+600));
  }
  const parts=[...s.matchAll(/https?:\/\/[a-zA-Z0-9.-]+(?:\/[a-zA-Z0-9_./?=&%-]+)?/g)].map(m=>m[0]);
  console.log('ENGINE URLS',JSON.stringify([...new Set(parts)].slice(0,120)));
}
inspectSourceEngine().catch(e=>console.log('ENGINE ERROR',String(e.message)));

async function exactEngine(){
 const url='https://flixer.su/assets/js/WatchPartyOverlay-52585954.js';
 const r=await fetch(url,{signal:AbortSignal.timeout(16000)}),s=await r.text();
 for(const n of ['Mr','Dr','Pr','Ir','Or','Xr','Vr','Hr','Gr','Wr','Jr']){
   const re=new RegExp('(?:const |let |var |,|;|\\s)'+n+'\\s*=','g');
   const ms=[...s.matchAll(re)];
   console.log('FN_COUNT',n,ms.length);
   for(const m of ms.slice(0,2))console.log('FN_CODE',n,m.index,s.slice(Math.max(0,m.index-240),Math.min(s.length,m.index+5100)));
 }
}
exactEngine().catch(e=>console.log('FN_ERROR',e.message));

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

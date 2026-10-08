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

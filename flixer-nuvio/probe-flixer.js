// Diagnostic-only network probe for flixer.su. Does not log in, bypass access controls, or save video.
const dns=require('node:dns').promises;
const base='https://flixer.su';
const paths=['/','/search','/search?q=Interstellar','/movies','/shows','/movie/550','/watch/movie/550'];
async function one(path,ua) {
 const url=base+path;
 try {
   const res=await fetch(url,{signal:AbortSignal.timeout(11000),redirect:'follow',headers:{'user-agent':ua,'accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'}});
   const body=await res.text();
   const title=(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'';
   const scripts=[...body.matchAll(/<script\b[^>]*src=["']([^"']+)/gi)].map(m=>new URL(m[1],res.url).href);
   const inline=[...body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean);
   const links=[...body.matchAll(/<a\b[^>]*href=["']([^"']+)/gi)].map(m=>m[1]);
   const hints=(body.match(/(?:__NEXT_DATA__|__NUXT__|__INITIAL_STATE__|movie\/[a-z0-9-]+|\/api\/[a-z0-9/?=&._-]+|m3u8|\.mp4|vidsrc|vidfast|videasy|movie-web|flixhq|react-router|vite|__BUILD_VERSION__)/gi)||[]).slice(0,45);
   console.log(JSON.stringify({kind:'page',url,status:res.status,final:res.url,type:res.headers.get('content-type'),len:body.length,title,scripts:scripts.slice(0,15),inlineCount:inline.length,links:links.slice(0,12),hints,head:body.slice(0,750).replace(/\s+/g,' ')}));
   return scripts;
 } catch(e){console.log(JSON.stringify({kind:'page',url,error:String(e.message)}));return[]}
}
async function main(){
 try{console.log('dns',await dns.lookup('flixer.su',{all:true}));}catch(e){console.log('dns error',e.code,e.message)}
 const uaChrome='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
 const uaBot='Googlebot';
 const scriptSet=new Set();
 for(const p of paths)for(const sc of await one(p,uaChrome))scriptSet.add(sc);
 await one('/',uaBot);
 for(const sc of [...scriptSet].slice(0,8)){
   try{
     const r=await fetch(sc,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':uaChrome}});
     const t=await r.text();
     const hits=[...t.matchAll(/.{0,80}(?:\/api\/[a-z0-9/._?=&-]+|https?:\/\/[a-z0-9.-]+(?:\/api)?|vidsrc|videasy|vidfast|tmdb|embed|player).{0,100}/gi)].slice(0,24).map(m=>m[0]);
     console.log(JSON.stringify({kind:'asset',url:sc,status:r.status,len:t.length,hits}));
   }catch(e){console.log(JSON.stringify({kind:'asset',url:sc,error:String(e.message)}))}
 }
}
main().catch(e=>{console.log('fatal',String(e));process.exitCode=1});
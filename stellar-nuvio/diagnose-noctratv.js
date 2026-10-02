const targets=[
  ['vidsrc-query','https://vidsrc.me/embed/movie?tmdb=550'],
  ['vsembed-path','https://vsembed.ru/embed/movie/550'],
  ['vsembed-query','https://vsembed.ru/embed/movie?tmdb=550']
];
const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36';
function safeUrl(u){try{const x=new URL(u);return x.origin+x.pathname}catch(_){return u}}
(async()=>{
  for(const [label,url] of targets){
    try{
      const r=await fetch(url,{headers:{'User-Agent':UA,'Referer':'https://www.noctra.tv/'}});
      const t=await r.text();
      console.log('\n['+label+'] status='+r.status+' ct='+(r.headers.get('content-type')||'')+' len='+t.length+' final='+safeUrl(r.url));
      const scripts=[...t.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(m=>new URL(m[1],r.url).href);
      console.log('scripts='+scripts.map(s=>safeUrl(s)).join(' | '));
      const ifr=[...t.matchAll(/<iframe[^>]+src=["']([^"']+)/gi)].map(m=>new URL(m[1],r.url).href);
      console.log('iframes='+ifr.map(s=>safeUrl(s)).join(' | '));
      console.log('hasM3U8='+/\.m3u8/i.test(t)+' hasMPD='+/\.mpd/i.test(t)+' hasFetch='+/fetch\s*\(/i.test(t)+' hasXHR='+/XMLHttpRequest/i.test(t));
      const apiish=[...t.matchAll(/(?:https?:\\?\/\\?\/[^"'\s<>]+|\/[A-Za-z0-9_./?-]*(?:api|source|stream|server)[A-Za-z0-9_./?=&%-]*)/gi)]
        .map(m=>String(m[0]).replace(/\\\//g,'/')).slice(0,20);
      console.log('apiish='+apiish.map(s=>safeUrl(s)).join(' | '));
    }catch(e){console.log('['+label+'] ERR '+(e&&e.message?e.message:e))}
  }
})().catch(e=>{console.error(e);process.exitCode=1});

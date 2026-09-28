const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36';

async function fetchText(url){
  const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'text/html,application/javascript,*/*',Referer:'https://zxcstream.xyz/'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  return {r,t:await r.text()};
}

function snippets(label,url,text){
  const terms=['backend','servers','token','fetch(','axios','m3u8','mp4','stream','source','tmdb','imdb','icarus','berkas','orion','athena','download','api/','/api'];
  let any=false;
  for(const term of terms){
    let p=0,n=0;
    while((p=text.toLowerCase().indexOf(term.toLowerCase(),p))>=0&&n<8){
      if(!any){console.log('\n###',label,url,'len',text.length);any=true}
      console.log('TERM',term,'@',p,text.slice(Math.max(0,p-320),Math.min(text.length,p+720)).replace(/\s+/g,' '));
      p+=term.length;n++;
    }
  }
}

(async()=>{
  const routes=[
    'https://zxcstream.xyz/movie/550',
    'https://zxcstream.xyz/player/movie/550',
    'https://player.zxcprime.xyz/movie/550',
    'https://player.zxcprime.xyz/player/movie/550',
    'https://zxcstream.icu/movie/550',
    'https://zxcstream.icu/player/movie/550'
  ];
  const chunks=new Map();
  for(const u of routes){
    try{
      const {r,t}=await fetchText(u);
      console.log('\nROUTE',u,'=>',r.status,r.url,r.headers.get('content-type'),'len',t.length);
      snippets('HTML',r.url,t);
      const srcs=[...t.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>new URL(m[1],r.url).href);
      console.log('SCRIPTS',srcs.length,srcs);
      for(const s of srcs){
        if(chunks.has(s))continue;
        try{
          const x=await fetchText(s);
          console.log('CHUNK FETCH',x.r.status,s,'len',x.t.length);
          chunks.set(s,x.t);
        }catch(e){console.log('CHUNK ERR',s,e.message)}
      }
    }catch(e){console.log('ROUTE ERR',u,e.message)}
  }
  for(const [u,t] of chunks) snippets('JS',u,t);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

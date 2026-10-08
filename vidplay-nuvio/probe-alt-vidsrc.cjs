// Read-only interoperability probe for current public VidSrc player flow.
// No challenge bypass, cookie reuse, user session forwarding, or token logging.
const UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36";
const BASE="https://vidsrc.sh",PLAYER="https://stellarconductornexus.com";
function shape(value){
  try{let u=new URL(value);return {host:u.host,path:u.pathname,keys:[...u.searchParams.keys()]}}catch(e){return null}
}
async function req(url,referer){
  const r=await fetch(url,{method:"GET",signal:AbortSignal.timeout(9000),headers:{Referer:referer,"User-Agent":UA,"Accept":"text/html,application/json,*/*"}});
  const t=await r.text();
  return{r,t};
}
function parseCfg(html,label){let m=html.match(new RegExp("window\\\\."+label+"\\\\s*=\\\\s*(\\\\{[^\\\\n]*?\\\\})\\\\s*;"));return m?JSON.parse(m[1]):null;}
(async()=>{
  const traces=[];
  const tests=[
    ["tmdb-id","https://vidsrc.sh/vs_src.php?type=movie&id=395992"],
    ["imdb-id","https://vidsrc.sh/vs_src.php?type=movie&id=tt5442430"]
  ];
  for(const [label,endpoint] of tests){
    const x={label};
    try{
      const one=await req(endpoint,BASE+"/");
      x.bootstrap={http:one.r.status,mime:one.r.headers.get("content-type"),bytes:one.t.length};
      if(!one.r.ok){traces.push(x);continue}
      let j=JSON.parse(one.t);
      x.bootstrap.hasSrc=!!j.src;
      x.bootstrap.srcShape=shape(j.src);
      let playerPage=new URL(j.src||"",PLAYER);
      if(playerPage.origin!==PLAYER||!playerPage.pathname.startsWith("/embed/")){x.error="unexpected embed host";traces.push(x);continue;}
      x.playerPage=shape(playerPage.href);
      let two=await req(playerPage.href,BASE+"/");
      x.landing={http:two.r.status,bytes:two.t.length};
      if(!two.r.ok){traces.push(x);continue}
      let cfg=parseCfg(two.t,"CFG");
      x.landing.cfgKeys=cfg?Object.keys(cfg):[];
      x.landing.markerFlags={hasCFG:two.t.includes("window.CFG"),hasPlayerURL:two.t.includes("playerUrl"),hasTurnstile:/turnstile/i.test(two.t),hasChallenge:/Just a moment|challenge-platform|cf-chl/i.test(two.t),hasIframe:/<iframe/i.test(two.t),hasAPI:/data.vidsrc.sh/i.test(two.t)};
      if(!cfg||!cfg.playerUrl){traces.push(x);continue}
      let inner=new URL(cfg.playerUrl,PLAYER);
      if(inner.origin!==PLAYER||!inner.pathname.startsWith("/embed/")){x.error="unexpected inner player";traces.push(x);continue}
      x.innerPage=shape(inner.href);
      let three=await req(inner.href,playerPage.href);
      x.inner={http:three.r.status,bytes:three.t.length};
      if(!three.r.ok){traces.push(x);continue}
      let p=parseCfg(three.t,"CONFIG");
      x.inner.cfgKeys=p?Object.keys(p):[];
      x.inner.turnstile=!!p?.turnstile;
      x.inner.hasSignedToken=!!p?.apiToken;
      x.inner.api=shape(p?.api||p?.streamBase);
      if(!p?.apiToken||p?.turnstile){traces.push(x);continue}
      let api=new URL(p.api||p.streamBase||"", "https://data.vidsrc.sh");
      if(api.origin!=="https://data.vidsrc.sh"||api.pathname!=="/api.php"){x.error="unexpected API host";traces.push(x);continue}
      api.searchParams.set("stream_urls","");
      api.searchParams.set("api_token",p.apiToken);
      let media=await req(api.href,inner.href);
      x.authorizedMedia={http:media.r.status,bytes:media.t.length};
      try{let doc=JSON.parse(media.t);x.authorizedMedia.statusCode=doc.status_code;
        x.authorizedMedia.hasStreamURLs=!!doc.data?.stream_urls;x.authorizedMedia.streamType=typeof doc.data?.stream_urls;
        x.authorizedMedia.hasWasmURL=!!doc.vs?.wasm_url;x.authorizedMedia.error=doc.error||null;
      }catch(e){x.authorizedMedia.badJSON=true}
    }catch(e){x.error=e.name+":"+e.message.slice(0,110)}
    traces.push(x);
  }
  console.log("VIDSRC_PUBLIC_CHAIN",JSON.stringify(traces));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

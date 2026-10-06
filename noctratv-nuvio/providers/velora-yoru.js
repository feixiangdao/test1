// NoctraTV · Velora · Yoru
// Current ZStream Magnolia resolver with rotating Wings API discovery.
// Flow:
//   db.wingsdatabase.com metadata
//   -> discover current VidKing/Videasy api.* host if needed
//   -> /seed?mediaId=...
//   -> Yoru (/cdn) + Neon (/vsrc, fallback /neon2), enc=2
//   -> local MagnoliaCipher decrypt
//   -> direct HLS/DASH validation.
// No iframe and no external decrypt service.

var DEFAULT_BASE="https://api.speedracelight.com";
var DB="https://db.wingsdatabase.com";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

var RUNTIME={
  base:DEFAULT_BASE,
  origin:"https://www.vidking.net",
  discoveredAt:0
};

var PLAYER_ORIGINS=[
  "https://www.vidking.net",
  "https://vidking.net",
  "https://www.vidking.to",
  "https://vidking.to",
  "https://www.vidking.com",
  "https://vidking.com",
  "https://player.videasy.to",
  "https://player.videasy.net",
  "https://player.videasy.com",
  "https://player.videasy.cc"
];

var YORU={id:"astral",label:"Astral",paths:["/cdn/sources-with-title"],isYoru:true};
var NEON={id:"neon",label:"Neon",paths:["/vsrc/sources-with-title","/neon2/sources-with-title"],isYoru:false};

function clean(v){return v==null?"":String(v).trim();}
function mul32(a,b){return Math.imul(a>>>0,b>>>0)>>>0;}
function rotl(x,n){
  x>>>=0;n=(n>>>0)&31;
  if(!n)return x;
  return ((x<<n)|(x>>>(32-n)))>>>0;
}
function murmurMix(x){
  x>>>=0;
  x^=x>>>16;
  x=mul32(x,2246822507);
  x^=x>>>13;
  x=mul32(x,3266489909);
  x^=x>>>16;
  return x>>>0;
}
function utf8Bytes(s){return new TextEncoder().encode(String(s));}
function b64urlBytes(s){
  s=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  var raw=atob(s),a=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i)&255;
  return a;
}
function magnoliaDecrypt(payload,seed,mediaId){
  var bytes;
  try{bytes=b64urlBytes(payload);}catch(_){return null;}
  if(!bytes||bytes.length<4)return null;

  var fnv=2166136261>>>0;
  var sb=utf8Bytes(seed);
  for(var j=0;j<sb.length;j++)fnv=mul32((fnv^(sb[j]>>>0))>>>0,16777619);

  var a=(murmurMix(murmurMix(fnv)) ^ murmurMix(((mediaId>>>0)^2654435769)>>>0))>>>0;
  var state=new Uint32Array(61),present=new Array(61).fill(false);
  for(var ii=0;ii<8;ii++){
    var t=a%61;
    a=rotl((a+2654435769)>>>0,(7+(7&(ii>>>0)))>>>0);
    state[t]=(a^murmurMix(a))>>>0;
    present[t]=true;
    a=murmurMix((a+(t>>>0))>>>0);
  }

  var acc=murmurMix((2779096485^a)>>>0),counter=0,word=0;
  for(var i=0;i<bytes.length;i++){
    if((i&3)===0){
      var n=acc%61,d=state[n]>>>0;
      counter=(counter+1)>>>0;
      var inner=(d^mul32(2654435769,counter))>>>0;
      var v=(acc^inner)>>>0;
      if(present[n])v=(v|(acc&inner))>>>0;
      word=(rotl((v+acc)>>>0,n)^rotl(acc,(n*7)>>>0))>>>0;
      acc=murmurMix((word+2654435769)>>>0);
      state[n]=acc;present[n]=true;
    }
    bytes[i]^=(acc>>>((i&3)*8))&255;
  }
  if(bytes[0]!==0x6d||bytes[1]!==0x76||bytes[2]!==0x6d||bytes[3]!==0x31)return null;
  return bytes.slice(4);
}
function decodeBody(raw,seed,mediaId){
  var s=String(raw||"").trim();
  if(!s)return null;
  if(s[0]==="{"||s[0]==="["){
    try{return JSON.parse(s);}catch(_){return null;}
  }
  var dec=magnoliaDecrypt(s,seed,mediaId>>>0);
  if(!dec)return null;
  try{return JSON.parse(new TextDecoder("utf-8").decode(dec));}catch(_){return null;}
}
function withTimeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false;
    var timer=setTimeout(function(){
      if(done)return;done=true;reject(new Error(label+" timeout"));
    },ms);
    Promise.resolve(p).then(function(v){
      if(done)return;done=true;clearTimeout(timer);resolve(v);
    },function(e){
      if(done)return;done=true;clearTimeout(timer);reject(e);
    });
  });
}
function apiHeaders(origin){
  origin=clean(origin||RUNTIME.origin).replace(/\/$/,"");
  return{
    "User-Agent":UA,
    "Origin":origin,
    "Referer":origin+"/",
    "Accept":"application/json,text/plain,*/*",
    "Cache-Control":"no-cache, no-store, must-revalidate",
    "Pragma":"no-cache"
  };
}
function mediaHeaders(){
  var o=clean(RUNTIME.origin||"https://www.vidking.net").replace(/\/$/,"");
  return{"User-Agent":UA,"Origin":o,"Referer":o+"/"};
}
function getJson(url,headers,ms){
  return withTimeout(fetch(url,{headers:headers||{}}),ms||10000,"fetch").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.json();
  });
}
function getText(url,headers,ms){
  return withTimeout(fetch(url,{headers:headers||{}}),ms||10000,"fetch").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.text();
  });
}
function metadata(tmdbId,mediaType){
  var show=mediaType==="tv";
  var url=DB+"/3/"+(show?"tv":"movie")+"/"+encodeURIComponent(String(tmdbId))+
    "?append_to_response=external_ids&language=en";
  return getJson(url,{"User-Agent":UA,"Accept":"application/json"},10000).then(function(m){
    var title=clean(show?(m.name||m.original_name):(m.title||m.original_title));
    if(!title)throw new Error("metadata title missing");
    var date=clean(show?m.first_air_date:m.release_date);
    var ext=m&&m.external_ids&&typeof m.external_ids==="object"?m.external_ids:{};
    return{
      id:Number(m.id||tmdbId),
      title:title,
      year:date.length>=4?date.slice(0,4):"",
      imdb:clean(ext.imdb_id),
      totalSeasons:show?clean(m.number_of_seasons):"",
      show:show
    };
  });
}
function probeSeed(base,origin,id){
  base=clean(base).replace(/\/$/,"");
  if(!/^https:\/\/api\./i.test(base))return Promise.resolve(null);
  var url=base+"/seed?mediaId="+encodeURIComponent(String(id));
  return withTimeout(fetch(url,{headers:apiHeaders(origin)}),8000,"seed").then(function(r){
    if(!r.ok)return null;
    return r.json().catch(function(){return null;});
  }).then(function(j){
    var seed=clean(j&&j.seed);
    return seed?{base:base,origin:origin,seed:seed}:null;
  }).catch(function(){return null;});
}
function extractApiBases(source){
  var s=String(source||"").replace(/\\\//g,"/");
  var re=/https:\/\/api\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/ig,m,out=[],seen={};
  while((m=re.exec(s))!==null){
    var u=clean(m[0]).replace(/\/$/,"");
    if(!u||/wingsdatabase\.com$/i.test(u))continue;
    if(!seen[u]){seen[u]=1;out.push(u);}
  }
  out.sort(function(a,b){
    function score(u){
      var i=s.indexOf(u),w=i<0?"":s.slice(Math.max(0,i-220),i+u.length+220),n=1;
      if(/sources-with-title/i.test(w))n+=5;
      if(/\/seed/i.test(w))n+=4;
      if(/enc/i.test(w))n+=1;
      return n;
    }
    return score(b)-score(a);
  });
  return out;
}
function scriptUrls(html,page){
  var re=/<script\b[^>]*\bsrc=["']([^"']+)["']/ig,m,out=[],seen={};
  while((m=re.exec(String(html||"")))!==null){
    try{
      var u=new URL(m[1],page).toString();
      if(/\.js(?:\?|$)/i.test(u)&&!seen[u]){seen[u]=1;out.push(u);}
    }catch(_){}
  }
  return out.slice(0,8);
}
function pagePaths(origin){
  if(/vidking/i.test(origin))return[origin+"/embed/movie/550",origin+"/"];
  return[origin+"/movie/550",origin+"/"];
}
function discoverFromOrigin(origin,id){
  var paths=pagePaths(origin),pi=0,bases=[];
  function nextPage(){
    if(pi>=paths.length)return Promise.resolve(null);
    var page=paths[pi++];
    return getText(page,{
      "User-Agent":UA,
      "Accept":"text/html,application/xhtml+xml,*/*",
      "Referer":origin+"/"
    },5000).then(function(html){
      bases=bases.concat(extractApiBases(html));
      var scripts=scriptUrls(html,page),si=0;
      function nextScript(){
        if(si>=scripts.length)return probeBases();
        var src=scripts[si++];
        return getText(src,{"User-Agent":UA,"Referer":origin+"/"},5000)
          .then(function(js){
            bases=bases.concat(extractApiBases(js));
            return nextScript();
          }).catch(function(){return nextScript();});
      }
      function probeBases(){
        var uniq=[],seen={};
        [DEFAULT_BASE].concat(bases).forEach(function(x){if(x&&!seen[x]){seen[x]=1;uniq.push(x);}});
        var bi=0;
        function nextBase(){
          if(bi>=uniq.length)return Promise.resolve(null);
          var b=uniq[bi++];
          return probeSeed(b,origin,id).then(function(r){return r||nextBase();});
        }
        return nextBase();
      }
      return nextScript();
    }).catch(function(){return nextPage();});
  }
  return nextPage();
}
function discoverApi(id){
  var age=Date.now()-Number(RUNTIME.discoveredAt||0);
  if(RUNTIME.base&&age<6*60*60*1000){
    return probeSeed(RUNTIME.base,RUNTIME.origin,id).then(function(r){
      if(r)return r;
      return discoverApiFresh(id);
    });
  }
  return discoverApiFresh(id);
}
function discoverApiFresh(id){
  var oi=0;
  function next(){
    if(oi>=PLAYER_ORIGINS.length)return Promise.resolve(null);
    var origin=PLAYER_ORIGINS[oi++];
    return discoverFromOrigin(origin,id).then(function(r){
      if(r){
        RUNTIME.base=r.base;
        RUNTIME.origin=r.origin;
        RUNTIME.discoveredAt=Date.now();
        console.log("[Noctra/Velora/Yoru] discovered "+r.base+" via "+r.origin);
        return r;
      }
      return next();
    });
  }
  // Try known default with several origins before loading player bundles.
  var i=0;
  function quick(){
    if(i>=Math.min(6,PLAYER_ORIGINS.length))return next();
    var origin=PLAYER_ORIGINS[i++];
    return probeSeed(DEFAULT_BASE,origin,id).then(function(r){
      if(r){
        RUNTIME.base=r.base;RUNTIME.origin=r.origin;RUNTIME.discoveredAt=Date.now();
        return r;
      }
      return quick();
    });
  }
  return quick();
}
function makeQuery(m,season,episode,seed){
  var q=[
    "title="+encodeURIComponent(m.title),
    "mediaType="+(m.show?"tv":"movie"),
    "year="+encodeURIComponent(m.year),
    "episodeId="+encodeURIComponent(String(m.show?(episode||1):1)),
    "seasonId="+encodeURIComponent(String(m.show?(season||1):1)),
    "tmdbId="+encodeURIComponent(String(m.id)),
    "imdbId="+encodeURIComponent(m.imdb)
  ];
  if(m.show)q.push("totalSeasons="+encodeURIComponent(m.totalSeasons));
  q.push("enc=2","seed="+encodeURIComponent(seed));
  return q.join("&");
}
function qualityNum(q){
  q=String(q||"").toLowerCase();
  if(/4k|2160/.test(q))return 2160;
  var m=q.match(/(1440|1080|720|480|360)/);
  return m?parseInt(m[1],10):0;
}
function qualityLabel(q){
  var n=qualityNum(q);
  return n===2160?"4K":n?n+"p":"Auto";
}
function fetchPath(base,path,m,season,episode,seed,provider){
  var url=base+path+"?"+makeQuery(m,season,episode,seed);
  return getText(url,apiHeaders(RUNTIME.origin),12000).then(function(raw){
    var root=decodeBody(raw,seed,m.id>>>0);
    if(!root)throw new Error("decrypt failed");
    var srcs=Array.isArray(root.sources)?root.sources:[],picks=[];
    srcs.forEach(function(item){
      var u=clean(item&&item.url);
      if(!/^https?:\/\//i.test(u))return;
      var q=clean(item&&item.quality),kind=clean(item&&item.type).toLowerCase(),low=u.toLowerCase();
      if(provider.isYoru){
        picks.push({url:u,quality:q,type:"hls",branch:provider});
      }else if(low.indexOf(".m3u8")>=0||kind==="m3u8"||kind==="hls"){
        picks.push({url:u,quality:q,type:"hls",branch:provider});
      }else if(low.indexOf(".mpd")>=0||kind==="dash"||kind==="mpd"){
        picks.push({url:u,quality:q,type:"dash",branch:provider});
      }
    });
    return picks;
  });
}
function fetchProvider(base,provider,m,season,episode,seed){
  var paths=provider.paths||[],i=0;
  function next(){
    if(i>=paths.length)return Promise.resolve([]);
    var path=paths[i++];
    return fetchPath(base,path,m,season,episode,seed,provider).then(function(rows){
      return rows&&rows.length?rows:next();
    }).catch(function(e){
      console.log("[Noctra/Velora/Yoru] "+provider.id+" "+path+" "+(e&&e.message?e.message:e));
      return next();
    });
  }
  return next();
}
function verifyPick(pick){
  var h=mediaHeaders();
  if(pick.type==="hls"){
    return withTimeout(fetch(pick.url,{headers:h}),10000,"HLS").then(function(r){
      if(!r.ok)throw new Error("HLS HTTP "+r.status);
      return r.text();
    }).then(function(body){
      if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
      return pick;
    });
  }
  return withTimeout(fetch(pick.url,{headers:h}),10000,"DASH").then(function(r){
    if(!r.ok)throw new Error("DASH HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(!/<MPD\b/i.test(String(body||"")))throw new Error("not DASH");
    return pick;
  });
}
function rowsFromPicks(picks){
  return Promise.all((picks||[]).map(function(p){
    return verifyPick(p).then(function(v){
      var q=qualityLabel(v.quality);
      return{
        name:"NoctraTV · Velora · Yoru",
        title:"Velora · Yoru · Magnolia "+v.branch.label+" · "+(v.quality||q),
        url:v.url,
        quality:q,
        type:v.type,
        provider:"noctra-velora-yoru",
        headers:mediaHeaders(),
        subtitles:[]
      };
    }).catch(function(e){
      console.log("[Noctra/Velora/Yoru] "+p.branch.id+" verify "+(e&&e.message?e.message:e));
      return null;
    });
  })).then(function(rows){return rows.filter(Boolean);});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(tmdbId==null)return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var m,seedInfo;
  return metadata(tmdbId,mediaType)
    .then(function(x){m=x;return discoverApi(m.id);})
    .then(function(info){
      if(!info)throw new Error("no live Wings API discovered");
      seedInfo=info;
      RUNTIME.base=info.base;RUNTIME.origin=info.origin;
      return fetchProvider(info.base,YORU,m,season,episode,info.seed);
    })
    .then(function(yoru){
      return fetchProvider(seedInfo.base,NEON,m,season,episode,seedInfo.seed).then(function(neon){
        yoru.sort(function(a,b){return qualityNum(b.quality)-qualityNum(a.quality);});
        var neonPick=neon.find(function(x){return x.type==="hls";})||
                     neon.find(function(x){return x.type==="dash";});
        var picks=yoru.slice();
        if(neonPick)picks.push(neonPick);
        return rowsFromPicks(picks);
      });
    })
    .then(function(rows){
      var out=[],seen={};
      rows.sort(function(a,b){return qualityNum(b.quality)-qualityNum(a.quality);});
      rows.forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}});
      console.log("[Noctra/Velora/Yoru] "+mediaType+" "+tmdbId+" streams="+out.length+
        " api="+RUNTIME.base+" origin="+RUNTIME.origin);
      return out;
    })
    .catch(function(e){
      console.log("[Noctra/Velora/Yoru] "+(e&&e.message?e.message:e));
      return[];
    });
}
module.exports={getStreams:getStreams};

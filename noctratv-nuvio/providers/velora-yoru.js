// NoctraTV · Velora · Yoru
// Current ZStream native Magnolia implementation.
// Evidence: ZStream MagnoliaSource.swift + MagnoliaCipher.swift.
// Flow:
// db.wingsdatabase.com metadata -> api.wingsdatabase.com/seed ->
// /cdn (Yoru/Astral) + /neon2 (Neon/Petal), enc=2 ->
// local MagnoliaCipher decrypt -> direct HLS/DASH.
// No iframe, no dec-videasy dependency.

var BASE="https://api.wingsdatabase.com";
var DB="https://db.wingsdatabase.com";
var REFERER="https://player.videasy.to/";
var ORIGIN="https://www.videasy.to";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
var PROVIDERS=[
  {id:"astral",label:"Astral",path:"/cdn/sources-with-title",isYoru:true},
  {id:"neon",label:"Neon",path:"/neon2/sources-with-title",isYoru:false}
];

function clean(v){return v==null?"":String(v).trim();}
function u32(x){return x>>>0;}
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
function utf8Bytes(s){
  return new TextEncoder().encode(String(s));
}
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
  for(var j=0;j<sb.length;j++){
    fnv=mul32((fnv^(sb[j]>>>0))>>>0,16777619);
  }

  var a=(murmurMix(murmurMix(fnv)) ^ murmurMix(((mediaId>>>0)^2654435769)>>>0))>>>0;
  var state=new Uint32Array(61);
  var present=new Array(61).fill(false);

  for(var ii=0;ii<8;ii++){
    var t=a%61;
    a=rotl((a+2654435769)>>>0,(7+(7&(ii>>>0)))>>>0);
    state[t]=(a^murmurMix(a))>>>0;
    present[t]=true;
    a=murmurMix((a+(t>>>0))>>>0);
  }

  var acc=murmurMix((2779096485^a)>>>0);
  var counter=0,word=0;
  for(var i=0;i<bytes.length;i++){
    if((i&3)===0){
      var n=acc%61;
      var d=state[n]>>>0;
      counter=(counter+1)>>>0;
      var inner=(d^mul32(2654435769,counter))>>>0;
      var v=(acc^inner)>>>0;
      if(present[n])v=(v|(acc&inner))>>>0;
      word=(rotl((v+acc)>>>0,n) ^ rotl(acc,(n*7)>>>0))>>>0;
      acc=murmurMix((word+2654435769)>>>0);
      state[n]=acc;
      present[n]=true;
    }
    bytes[i]^=(acc>>>((i&3)*8))&255;
  }
  if(bytes[0]!==0x6d||bytes[1]!==0x76||bytes[2]!==0x6d||bytes[3]!==0x31)return null;
  return bytes.slice(4);
}
function decodeBody(text,seed,mediaId){
  text=String(text||"").trim();
  if(!text)return null;
  if(text[0]==="{"||text[0]==="["){
    try{return JSON.parse(text);}catch(_){return null;}
  }
  var dec=magnoliaDecrypt(text,seed,mediaId>>>0);
  if(!dec)return null;
  try{return JSON.parse(new TextDecoder("utf-8").decode(dec));}catch(_){return null;}
}
function headers(){
  return{"User-Agent":UA,"Referer":REFERER,"Accept":"application/json"};
}
function mediaHeaders(){
  return{"User-Agent":UA,"Referer":REFERER,"Origin":ORIGIN};
}
function withTimeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false;
    var t=setTimeout(function(){if(done)return;done=true;reject(new Error(label+" timeout"));},ms);
    Promise.resolve(p).then(function(v){if(done)return;done=true;clearTimeout(t);resolve(v);},
      function(e){if(done)return;done=true;clearTimeout(t);reject(e);});
  });
}
function json(url){
  return withTimeout(fetch(url,{headers:headers()}),10000,"fetch").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.json();
  });
}
function text(url){
  return withTimeout(fetch(url,{headers:headers()}),10000,"fetch").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.text();
  });
}
function metadata(tmdbId,mediaType){
  var show=mediaType==="tv";
  var url=DB+"/3/"+(show?"tv":"movie")+"/"+encodeURIComponent(String(tmdbId))+
    "?append_to_response=external_ids&language=en";
  return json(url).then(function(m){
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
function getSeed(id){
  return json(BASE+"/seed?mediaId="+encodeURIComponent(String(id))).then(function(j){
    var seed=clean(j&&j.seed);
    if(!seed)throw new Error("seed missing");
    return seed;
  });
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
  q.push("enc=2");
  q.push("seed="+encodeURIComponent(seed));
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
function fetchProvider(p,m,season,episode,seed){
  var url=BASE+p.path+"?"+makeQuery(m,season,episode,seed);
  return text(url).then(function(raw){
    var root=decodeBody(raw,seed,m.id>>>0);
    var srcs=root&&Array.isArray(root.sources)?root.sources:[];
    var picks=[];
    srcs.forEach(function(item){
      var u=clean(item&&item.url);
      if(!/^https?:\/\//i.test(u))return;
      var q=clean(item&&item.quality);
      if(p.isYoru){
        picks.push({url:u,quality:q,type:"hls",branch:p});
        return;
      }
      var kind=clean(item&&item.type).toLowerCase();
      var low=u.toLowerCase();
      if(low.indexOf(".m3u8")>=0||kind==="m3u8"||kind==="hls")
        picks.push({url:u,quality:q,type:"hls",branch:p});
      else if(low.indexOf(".mpd")>=0||kind==="dash"||kind==="mpd")
        picks.push({url:u,quality:q,type:"dash",branch:p});
    });
    return picks;
  }).catch(function(e){
    console.log("[Noctra/Velora/Yoru] "+p.id+" "+(e&&e.message?e.message:e));
    return[];
  });
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
      var name="NoctraTV · Velora · Yoru";
      return{
        name:name,
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
  var m,seed;
  return metadata(tmdbId,mediaType)
    .then(function(x){m=x;return getSeed(m.id);})
    .then(function(s){seed=s;return fetchProvider(PROVIDERS[0],m,season,episode,seed);})
    .then(function(yoru){
      return fetchProvider(PROVIDERS[1],m,season,episode,seed).then(function(neon){
        // Preserve native behavior: all Yoru quality picks + first preferred Neon.
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
      console.log("[Noctra/Velora/Yoru] "+mediaType+" "+tmdbId+" streams="+out.length);
      return out;
    })
    .catch(function(e){
      console.log("[Noctra/Velora/Yoru] "+(e&&e.message?e.message:e));
      return[];
    });
}
module.exports={getStreams:getStreams};

// Stellar · Cineby — Nuvio local scraper
// VidKing / speedracelight backend with on-device HLS preflight.
// Only streams that return a real #EXTM3U on the current device are exposed.

var API = "https://api.speedracelight.com";
var TMDB = "https://api.themoviedb.org/3";
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";
var UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36";
var HEADERS = {
  "User-Agent": UA,
  "Origin": "https://www.vidking.net",
  "Referer": "https://www.vidking.net/"
};

var PROVIDERS = [
  { name: "Yoru", endpoint: "cdn/sources-with-title" },
  { name: "Breach", endpoint: "m4uhd/sources-with-title" },
  { name: "hdmovie", endpoint: "hdmovie/sources-with-title" }
];

var Hl = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580];
var _f = [1732584193,4023233417,2562383102,271733878];
var Js = 61, Sf = 8, ms = 2654435769;
var MAGIC = [109,118,109,49];

function clean(v){ return v == null ? "" : String(v).trim(); }
function bf(l){ return ((l * (l + 1)) & 1) === 0; }
function odd(l){ return ((l * (l + 1)) & 1) === 1; }

function ci(l){
  l >>>= 0;
  l ^= l >>> 16;
  l = Math.imul(l, 2246822507) >>> 0;
  l ^= l >>> 13;
  l = Math.imul(l, 3266489909) >>> 0;
  l ^= l >>> 16;
  return l >>> 0;
}
function ps(l,o){
  l >>>= 0; o &= 31;
  if(o===0) return l >>> 0;
  return ((l << o) | (l >>> (32-o))) >>> 0;
}
function Af(l){
  var o=_f[0]>>>0;
  for(var e=0;e<l.length;e++) o=ps((o^Math.imul(l.charCodeAt(e),Hl[e&15]))>>>0,5);
  return ci(o);
}
function wf(l){
  var o=new Array(256);
  for(var i=0;i<256;i++)o[i]=i;
  var e=0;
  for(var j=0;j<256;j++){
    e=(e+o[j]+l.charCodeAt(j%l.length))&255;
    var r=o[j];o[j]=o[e];o[e]=r;
  }
  return o;
}
function vf(l){
  var o=2166136261;
  for(var e=0;e<l.length;e++)o=Math.imul(o^l.charCodeAt(e),16777619)>>>0;
  return ci(o);
}
function Nf(l,o,e){ return (((l^o)>>>0)|((l&o&e)>>>0))>>>0; }
function Rf(l,o){
  if(odd(l.length)) return {S:wf(l),acc:Af(l)};
  var e=new Array(Js);
  var i=ci(vf(l)^ci((o>>>0)^ms))>>>0;
  for(var r=0;r<Sf;r++){
    if(bf(r)){
      var n=i%Js;
      i=ps((i+ms)>>>0,7+(r&7));
      e[n]=(i^ci(i))>>>0;
      i=ci((i+n)>>>0);
    }else{
      e[r]=Hl[r&15];
    }
  }
  return {S:e,acc:ci(i^2779096485)>>>0};
}
function Cf(l,o){
  var e=l.S,i=l.acc,r=i%Js,n=0-+(r in e),u=e[r]>>>0,d=Math.imul(ms,o+1)>>>0;
  var g=Nf(i,(u^d)>>>0,n);
  g=(ps((g+i)>>>0,r&31)^ps(i,Math.imul(r,7)&31))>>>0;
  i=ci((g+ms)>>>0);e[r]=i>>>0;l.acc=i;return i>>>0;
}
function keystream(seed,tmdb,len){
  var st=Rf(seed,tmdb),out=new Uint8Array(len),n=0,u=0;
  while(u<len){
    var d=Cf(st,n++);
    out[u++]=d&255;
    if(u<len)out[u++]=(d>>>8)&255;
    if(u<len)out[u++]=(d>>>16)&255;
    if(u<len)out[u++]=(d>>>24)&255;
  }
  return out;
}
function base64UrlBytes(value){
  var s=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  var bin=atob(s),out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i)&255;
  return out;
}
function bytesToBase64Url(bytes){
  var bin="";
  for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function decryptPayload(payload,seed,tmdb){
  var b=base64UrlBytes(payload),ks=keystream(seed,tmdb,b.length);
  for(var i=0;i<b.length;i++)b[i]^=ks[i];
  for(var j=0;j<MAGIC.length;j++)if(b[j]!==MAGIC[j])throw new Error("bad seed");
  return new TextDecoder("utf-8").decode(b.slice(MAGIC.length));
}
function encryptForTest(text,seed,tmdb){
  var body=new TextEncoder().encode(String(text));
  var b=new Uint8Array(MAGIC.length+body.length);
  for(var i=0;i<MAGIC.length;i++)b[i]=MAGIC[i];
  b.set(body,MAGIC.length);
  var ks=keystream(seed,tmdb,b.length);
  for(var j=0;j<b.length;j++)b[j]^=ks[j];
  return bytesToBase64Url(b);
}
function qRank(q){
  var s=clean(q).toLowerCase();
  if(s.indexOf("2160")>=0||s.indexOf("4k")>=0)return 2160;
  var m=s.match(/(\d{3,4})/);return m?parseInt(m[1],10):0;
}
function fetchTimed(url,opts,ms){
  opts=opts||{};
  var timer=null,signal=null;
  try{
    if(typeof AbortSignal!=="undefined"&&typeof AbortSignal.timeout==="function"){
      signal=AbortSignal.timeout(ms);
      var copy={};Object.keys(opts).forEach(function(k){copy[k]=opts[k];});
      copy.signal=signal;opts=copy;
    }
  }catch(_){}
  var timeout=new Promise(function(_,reject){
    timer=setTimeout(function(){reject(new Error("timeout "+ms+"ms"));},ms);
  });
  return Promise.race([fetch(url,opts),timeout]).then(function(r){
    if(timer)clearTimeout(timer);return r;
  },function(e){
    if(timer)clearTimeout(timer);throw e;
  });
}
function tmdbMeta(tmdbId,mediaType){
  var type=mediaType==="tv"?"tv":"movie";
  var url=TMDB+"/"+type+"/"+encodeURIComponent(String(tmdbId))+"?api_key="+encodeURIComponent(TMDB_KEY)+"&append_to_response=external_ids";
  return fetch(url,{headers:{"Accept":"application/json","User-Agent":UA}}).then(function(r){
    if(!r.ok)throw new Error("TMDB HTTP "+r.status);
    return r.json();
  }).then(function(j){
    var date=clean(type==="tv"?j.first_air_date:j.release_date);
    return {
      title:clean(type==="tv"?j.name:j.title),
      year:date?date.slice(0,4):"",
      imdbId:clean(j.external_ids&&j.external_ids.imdb_id)
    };
  });
}
function fetchSeed(tmdbId){
  var url=API+"/seed?mediaId="+encodeURIComponent(String(tmdbId));
  return fetch(url,{headers:HEADERS}).then(function(r){
    if(!r.ok)throw new Error("seed HTTP "+r.status);
    return r.json();
  }).then(function(j){
    if(!j||!j.seed)throw new Error("seed missing");
    return String(j.seed);
  });
}
function query(meta,provider,seed){
  var params={
    title:meta.title,
    mediaType:meta.mediaType,
    year:meta.year||"",
    episodeId:String(meta.episode||1),
    seasonId:String(meta.season||1),
    tmdbId:String(meta.tmdbId),
    imdbId:meta.imdbId||"",
    enc:"2",
    seed:seed,
    _t:String(Date.now())
  };
  var qs=Object.keys(params).map(function(k){return encodeURIComponent(k)+"="+encodeURIComponent(String(params[k]));}).join("&");
  var url=API+"/"+provider.endpoint+"?"+qs;
  return fetchTimed(url,{headers:{
    "User-Agent":UA,
    "Origin":"https://www.vidking.net",
    "Referer":"https://www.vidking.net/",
    "Cache-Control":"no-cache, no-store, must-revalidate",
    "Pragma":"no-cache"
  }},7000).then(function(r){
    if(!r.ok)throw new Error(provider.name+" HTTP "+r.status);
    return r.text();
  }).then(function(body){
    var j=null;
    try{j=JSON.parse(body);}catch(_){
      j=JSON.parse(decryptPayload(body,seed,parseInt(meta.tmdbId,10)));
    }
    if(!j||!Array.isArray(j.sources))return null;
    return {
      provider:provider.name,
      sources:j.sources||[],
      playlist:clean(j.playlist),
      subtitles:Array.isArray(j.subtitles)?j.subtitles:[]
    };
  }).catch(function(e){
    console.log("[Stellar/Cineby] "+provider.name+" "+(e&&e.message?e.message:e));
    return null;
  });
}
function mapSubs(list){
  return (list||[]).filter(function(s){return s&&s.url;}).slice(0,20).map(function(s,i){
    return {id:clean(s.lang||s.language||("sub"+i)),url:String(s.url),lang:clean(s.lang||s.language||"en")};
  });
}
function hlsProbe(url,headers){
  return fetchTimed(url,{headers:headers},5000).then(function(r){
    if(!r.ok)return false;
    var ct=clean(r.headers&&r.headers.get&&r.headers.get("content-type")).toLowerCase();
    return r.text().then(function(t){
      return t.indexOf("#EXTM3U")>=0 || ct.indexOf("mpegurl")>=0;
    });
  }).catch(function(){return false;});
}
function candidateRows(result){
  if(!result)return[];
  var rows=[],subs=mapSubs(result.subtitles);
  (result.sources||[]).forEach(function(s){
    var url=clean(s&&s.url);
    if(!/^https?:\/\//i.test(url))return;
    rows.push({url:url,quality:clean(s.quality)||"Auto",server:result.provider,subtitles:subs});
  });
  if(result.playlist&&/^https?:\/\//i.test(result.playlist)){
    rows.push({url:result.playlist,quality:"Auto",server:result.provider,subtitles:subs});
  }
  return rows;
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||!(mediaType==="movie"||mediaType==="tv"))return Promise.resolve([]);
  var meta=null;
  return tmdbMeta(tmdbId,mediaType).then(function(m){
    meta={
      tmdbId:String(tmdbId),mediaType:mediaType,title:m.title,year:m.year,imdbId:m.imdbId,
      season:mediaType==="tv"?(season||1):1,episode:mediaType==="tv"?(episode||1):1
    };
    if(!meta.title)throw new Error("title missing");
    return fetchSeed(tmdbId);
  }).then(function(seed){
    return Promise.all(PROVIDERS.map(function(p){return query(meta,p,seed);}));
  }).then(function(groups){
    var candidates=[],seen={};
    (groups||[]).forEach(function(g){
      candidateRows(g).forEach(function(row){
        if(seen[row.url])return;seen[row.url]=1;candidates.push(row);
      });
    });
    candidates.sort(function(a,b){return qRank(b.quality)-qRank(a.quality);});
    candidates=candidates.slice(0,12);
    return Promise.all(candidates.map(function(row){
      return hlsProbe(row.url,HEADERS).then(function(ok){return ok?row:null;});
    }));
  }).then(function(rows){
    var out=[];
    (rows||[]).forEach(function(row){
      if(!row)return;
      var label="Cineby · "+row.quality+" · "+row.server;
      out.push({
        name:label,
        title:label,
        url:row.url,
        quality:row.quality,
        provider:"stellar-cineby",
        headers:HEADERS,
        subtitles:row.subtitles||[]
      });
    });
    console.log("[Stellar/Cineby] playable="+out.length);
    return out;
  }).catch(function(e){
    console.error("[Stellar/Cineby] "+(e&&e.message?e.message:e));
    return [];
  });
}

module.exports={
  getStreams:getStreams,
  decryptPayload:decryptPayload,
  encryptForTest:encryptForTest,
  qRank:qRank
};

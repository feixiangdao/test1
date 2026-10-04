// NoctraTV · ZStream · Tokyo
// Current Tokyo anime resolver using ani.pm's direct Settlar session chain.
// Flow:
//   TMDB TV metadata -> exact ani.pm catalog match -> playback-bootstrap
//   -> formal Settlar session -> embed session API -> direct media.settlar.io HLS.
// No iframe is returned. Final HLS is validated before exposing it to Nuvio.

var ANI="https://ani.pm";
var EMBED="https://embed.settlar.io";
var MEGAPLAY_KEY="i?LMTAx0Q6,:}50U";
var MEGAPLAY_IV="W0;27ToaUpl_P%'c";
var MEGAPLAY_CDN_SECRET="MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
var MEGAPLAY_TTL=21600;
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="439c478a771f35c05022f9feabcca01c";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function hasTimers(){try{return typeof setTimeout==="function"&&typeof clearTimeout==="function";}catch(_){return false;}}
function withTimeout(p,ms,label){
  if(!hasTimers())return p;
  return new Promise(function(resolve,reject){
    var done=false;
    var t=setTimeout(function(){
      if(done)return;done=true;reject(new Error(label+" timeout"));
    },ms);
    Promise.resolve(p).then(function(v){
      if(done)return;done=true;clearTimeout(t);resolve(v);
    },function(e){
      if(done)return;done=true;clearTimeout(t);reject(e);
    });
  });
}
function headers(referer,accept){
  return {
    "User-Agent":UA,
    "Referer":referer||ANI+"/",
    "Accept":accept||"application/json,text/plain,*/*"
  };
}
function getJson(url,referer,ms){
  return withTimeout(fetch(url,{headers:headers(referer)}),ms||10000,"GET").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.text();
  }).then(function(t){
    if(!clean(t))throw new Error("empty JSON");
    return JSON.parse(t);
  });
}
function norm(s){
  s=clean(s);
  try{s=s.normalize("NFKD");}catch(_){}
  return s.toLowerCase()
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[’‘`´']/g,"")
    .replace(/&/g," and ")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function isAnimation(meta){
  var gs=Array.isArray(meta&&meta.genres)?meta.genres:[];
  return gs.some(function(g){return /animation/i.test(clean(g&&g.name));});
}
function tmdbMeta(id){
  var u=TMDB+"/tv/"+encodeURIComponent(String(id))+
    "?api_key="+encodeURIComponent(TMDB_KEY)+"&language=en-US";
  return getJson(u,"https://www.themoviedb.org/",9000).then(function(j){
    if(!j||!clean(j.name))throw new Error("TMDB title missing");
    return {
      name:clean(j.name),
      original:clean(j.original_name),
      originalLanguage:clean(j.original_language),
      year:clean(j.first_air_date).slice(0,4),
      animation:isAnimation(j)
    };
  });
}
function catalog(q){
  var u=ANI+"/api/anime/catalog?q="+encodeURIComponent(q)+"&page=1";
  return getJson(u,ANI+"/",9000).then(function(j){
    return j&&Array.isArray(j.items)?j.items:[];
  }).catch(function(){return[];});
}
function uniqueItems(groups){
  var out=[],seen={};
  (groups||[]).forEach(function(g){(g||[]).forEach(function(x){
    if(!x)return;
    var k=clean(x.id||x.routeId||x.slug||x.title);
    if(k&&!seen[k]){seen[k]=1;out.push(x);}
  });});
  return out;
}
function pickExact(items,meta){
  var wanted=[norm(meta.name),norm(meta.original)].filter(Boolean);
  var matches=(items||[]).filter(function(x){
    var names=[
      norm(x&&x.title),norm(x&&x.native),norm(x&&x.name),
      norm(x&&x.english),norm(x&&x.romaji)
    ].filter(Boolean);
    return wanted.some(function(w){return names.indexOf(w)>=0;});
  });
  if(!matches.length)return null;
  if(meta.year){
    var sameYear=matches.filter(function(x){
      var y=clean(x&&x.year);
      return !y||y===meta.year;
    });
    if(sameYear.length)sameYear=sameYear.filter(Boolean),matches=sameYear;
  }
  matches.sort(function(a,b){
    var at=norm(a&&a.title),bt=norm(b&&b.title),w=norm(meta.name);
    return (at===w?0:1)-(bt===w?0:1);
  });
  return matches[0]||null;
}
function findAnime(meta){
  var qs=[meta.name];
  if(meta.original&&norm(meta.original)!==norm(meta.name))qs.push(meta.original);
  return Promise.all(qs.map(catalog)).then(function(gs){
    return pickExact(uniqueItems(gs),meta);
  });
}
function maxQuality(text){
  var s=String(text||""),m,max=0,re=/RESOLUTION=\d+x(\d+)/ig;
  while((m=re.exec(s))!==null){
    var h=parseInt(m[1],10)||0;if(h>max)max=h;
  }
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}
function subtitleRows(list,label){
  if(!Array.isArray(list))return[];
  var out=[],seen={};
  list.forEach(function(s){
    var u=clean(s&&s.url);
    if(!/^https:\/\//i.test(u)||seen[u])return;
    seen[u]=1;
    var lang=clean(s&&s.srclang)||clean(s&&s.language)||"und";
    var name=clean(s&&s.label)||lang;
    out.push({url:u,language:lang,name:name+" [Tokyo "+label+"]"});
  });
  return out.slice(0,24);
}
function bootstrap(id,episode,channel){
  var u=ANI+"/api/anime/playback-bootstrap/settlar/"+
    encodeURIComponent(String(id))+"?ep="+encodeURIComponent(String(episode))+
    "&lang="+encodeURIComponent(channel)+"&backup=1";
  return getJson(u,ANI+"/",12000).catch(function(e){
    throw new Error("bootstrap "+(e&&e.message?e.message:e));
  });
}
function formalSession(selection,episode,channel){
  var q="selection="+encodeURIComponent(selection)+
    "&provider=anipm"+
    "&ep="+encodeURIComponent(String(episode))+
    "&channel="+encodeURIComponent(channel)+
    "&telemetry=0";
  return getJson(ANI+"/api/anime/settlar/session?"+q,ANI+"/",15000).catch(function(e){
    throw new Error("formal-session "+(e&&e.message?e.message:e));
  });
}
function embedSession(embedUrl){
  var m=/[?&]t=([^&#]+)/.exec(clean(embedUrl));
  if(!m)return Promise.reject(new Error("embed token missing"));
  var tok;
  try{tok=decodeURIComponent(m[1]);}catch(_){tok=m[1];}
  var u=EMBED+"/api/embed/session?t="+encodeURIComponent(tok);
  var h={
    "User-Agent":UA,
    "Accept":"application/json",
    "Accept-Language":"en-US,en;q=0.9",
    "Referer":embedUrl,
    "Sec-Fetch-Site":"same-origin",
    "Sec-Fetch-Mode":"cors",
    "Sec-Fetch-Dest":"empty"
  };
  return withTimeout(fetch(u,{headers:h}),15000,"embed-session").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  }).catch(function(e){
    throw new Error("embed-session "+(e&&e.message?e.message:e));
  });
}
function cryptoJs(){
  try{if(globalThis.CryptoJS)return globalThis.CryptoJS;}catch(_){}
  try{if(typeof require==="function")return require("crypto-js");}catch(_){}
  return null;
}
function b64urlToWord(s){
  var C=cryptoJs(); if(!C)throw new Error("CryptoJS unavailable");
  s=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  return C.enc.Base64.parse(s);
}
function wordToB64url(w){
  var C=cryptoJs(); if(!C)throw new Error("CryptoJS unavailable");
  return C.enc.Base64.stringify(w).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function megaplayDecrypt(enc){
  var C=cryptoJs(); if(!C)return"";
  try{
    var keyBytes=[];
    for(var i=0;i<MEGAPLAY_KEY.length;i++)keyBytes.push(MEGAPLAY_KEY.charCodeAt(i)&255);
    while(keyBytes.length<32)keyBytes.push(0);
    var ivBytes=[];
    for(var j=0;j<MEGAPLAY_IV.length;j++)ivBytes.push(MEGAPLAY_IV.charCodeAt(j)&255);
    while(ivBytes.length<16)ivBytes.push(0);
    function wa(bytes){
      var hex="";for(var k=0;k<bytes.length;k++)hex+=bytes[k].toString(16).padStart(2,"0");
      return C.enc.Hex.parse(hex);
    }
    var cp=C.lib.CipherParams.create({ciphertext:b64urlToWord(enc)});
    var plain=C.AES.decrypt(cp,wa(keyBytes.slice(0,32)),{iv:wa(ivBytes.slice(0,16)),mode:C.mode.CBC,padding:C.pad.Pkcs7});
    var text=plain.toString(C.enc.Utf8);
    var data=JSON.parse(text);
    if(typeof data==="string")return data;
    if(data&&data.file)return data.file;
    if(Array.isArray(data)&&data.length)return clean(data[0].file||data[0].url);
  }catch(_){}
  return"";
}
function signMegaplayUrl(url){
  var C=cryptoJs(); if(!C||!url||/[?&]token=/.test(url))return url;
  var m=String(url).match(/\/([a-f0-9]{32})\/([a-f0-9]{32})\//i);
  if(!m)return url;
  var path=m[1].toLowerCase()+"/"+m[2].toLowerCase();
  var msg=(Math.floor(Date.now()/1000)+MEGAPLAY_TTL)+"|"+path;
  var lhs=wordToB64url(C.enc.Utf8.parse(msg));
  var rhs=wordToB64url(C.HmacSHA256(msg,MEGAPLAY_CDN_SECRET));
  return url+(url.indexOf("?")>=0?"&":"?")+"token="+lhs+"."+rhs;
}
function resolveMegaPlay(boot,channel){
  var be=boot&&boot.backupEmbed;
  if(!be||be.available===false||!clean(be.url))return Promise.resolve(null);
  var pageUrl=clean(be.url),mm=/^(https?:\/\/[^/]+)/.exec(pageUrl);
  if(!mm)return Promise.resolve(null);
  var host=mm[1];
  return withTimeout(fetch(pageUrl,{headers:{"User-Agent":UA,"Referer":ANI+"/"}}),12000,"megaplay-page")
    .then(function(r){if(!r.ok)throw new Error("page HTTP "+r.status);return r.text();})
    .then(function(html){
      var m=/data-id="(\d+)"/.exec(String(html||""));
      if(!m)throw new Error("data-id missing");
      var id=encodeURIComponent(m[1]);
      var hh={"User-Agent":UA,"Referer":pageUrl,"X-Requested-With":"XMLHttpRequest","Accept":"application/json"};
      var newer=host+"/stream/getSourcesNew?id="+id+"&id="+id+"&type="+encodeURIComponent(channel);
      return withTimeout(fetch(newer,{headers:hh}),12000,"megaplay-api-new").then(function(r){
        if(r.ok)return r.json();
        return withTimeout(fetch(host+"/stream/getSources?id="+id,{headers:hh}),12000,"megaplay-api-old")
          .then(function(r2){if(!r2.ok)throw new Error("api HTTP "+r2.status);return r2.json();});
      });
    })
    .then(function(sd){
      try{
        console.log("[Noctra/ZStream/Tokyo] "+channel+" megaplay keys="+Object.keys(sd||{}).join(",")+
          " sourcesType="+(sd&&sd.sources==null?"null":Array.isArray(sd&&sd.sources)?"array":typeof(sd&&sd.sources))+
          " encType="+(sd&&sd.enc==null?"null":typeof(sd&&sd.enc)));
      }catch(_){}
      var u="";
      if(sd&&sd.sources){
        if(typeof sd.sources==="string")u=sd.sources;
        else if(sd.sources.file)u=sd.sources.file;
        else if(Array.isArray(sd.sources)&&sd.sources.length)u=clean(sd.sources[0].file||sd.sources[0].url);
      }
      if(!u&&sd&&sd.enc)u=megaplayDecrypt(sd.enc);
      if(!u)throw new Error("stream missing");
      u=signMegaplayUrl(u);
      return verifyHlsWithHeaders(u,{"User-Agent":UA,"Referer":host+"/"}).then(function(v){
        var lab=channel==="dub"?"DUB":"SUB";
        var q=v.quality;
        var name="NoctraTV · ZStream · Tokyo · MegaPlay · "+lab+" · "+q;
        return{
          name:name,title:name,url:u,quality:q,type:"hls",
          provider:"noctra-zstream-tokyo",
          headers:{"User-Agent":UA,"Referer":host+"/"},
          subtitles:[],
          language:channel==="dub"?"en":"ja"
        };
      });
    }).catch(function(e){
      console.log("[Noctra/ZStream/Tokyo] "+channel+" megaplay "+(e&&e.message?e.message:e));
      return null;
    });
}
function verifyHlsWithHeaders(url,h){
  if(!/^https:\/\//i.test(clean(url)))return Promise.reject(new Error("bad HLS URL"));
  return withTimeout(fetch(url,{headers:h||{"User-Agent":UA}}),12000,"HLS")
    .then(function(r){
      if(!r.ok)throw new Error("HLS HTTP "+r.status);
      return r.text();
    }).then(function(body){
      if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
      return{quality:maxQuality(body),body:body};
    });
}
function verifyHls(url){
  return verifyHlsWithHeaders(url,{"User-Agent":UA,"Accept":"application/vnd.apple.mpegurl,*/*"});
}
function resolveChannel(anime,episode,channel){
  var id=anime&&anime.id;
  if(!id)return Promise.resolve(null);
  var bootObj=null;
  return bootstrap(id,episode,channel).then(function(b){
    bootObj=b;
    var effective=clean(b&&b.effectiveLanguage)==="dub"?"dub":"sub";
    if(effective!==channel)return null;
    if(b&&b.availability&&b.availability[channel]===false)return null;
    if(!b||!clean(b.settlarSelection))return null;
    return formalSession(clean(b.settlarSelection),episode,channel).then(function(s){
      if(!s||!clean(s.embedUrl))return null;
      return embedSession(clean(s.embedUrl)).then(function(e){
        if(!e||clean(e.kind)!=="hls"||!/^https:\/\//i.test(clean(e.source)))return null;
        return verifyHls(clean(e.source)).then(function(v){
          var lab=channel==="dub"?"DUB":"SUB";
          var q=v.quality;
          var name="NoctraTV · ZStream · Tokyo · ani.pm · "+lab+" · "+q;
          return{
            name:name,title:name,url:clean(e.source),quality:q,type:"hls",
            provider:"noctra-zstream-tokyo",
            headers:{"User-Agent":UA},
            subtitles:subtitleRows(e.subtitles,lab),
            language:clean(e.audioLang)||(channel==="dub"?"en":"ja")
          };
        });
      });
    }).catch(function(err){
      console.log("[Noctra/ZStream/Tokyo] "+channel+" settlar "+(err&&err.message?err.message:err));
      return null;
    });
  }).then(function(primary){
    if(primary)return primary;
    return resolveMegaPlay(bootObj,channel);
  }).catch(function(err){
    console.log("[Noctra/ZStream/Tokyo] "+channel+" "+(err&&err.message?err.message:err));
    return null;
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||mediaType!=="tv"||!season||!episode)return Promise.resolve([]);
  // Native Tokyo is an anime TV resolver. Until season-to-AniList mapping is
  // proven, keep non-S1 honest-zero rather than risk resolving the wrong episode.
  if(Number(season)!==1)return Promise.resolve([]);
  return tmdbMeta(tmdbId).then(function(meta){
    if(!meta.animation)return[];
    return findAnime(meta).then(function(anime){
      if(!anime){
        console.log("[Noctra/ZStream/Tokyo] exact catalog match missing for "+meta.name);
        return[];
      }
      return Promise.all([
        resolveChannel(anime,Number(episode),"sub"),
        resolveChannel(anime,Number(episode),"dub")
      ]).then(function(rows){
        var out=[],seen={};
        rows.forEach(function(x){
          if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
        });
        console.log("[Noctra/ZStream/Tokyo] tv "+tmdbId+" S"+season+"E"+episode+" streams="+out.length);
        return out;
      });
    });
  }).catch(function(e){
    console.log("[Noctra/ZStream/Tokyo] "+(e&&e.message?e.message:e));
    return[];
  });
}

module.exports={
  getStreams:getStreams,
  norm:norm,
  maxQuality:maxQuality
};

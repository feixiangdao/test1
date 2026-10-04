// NoctraTV · ZStream · Tokyo
// Current Tokyo anime resolver using ani.pm's direct Settlar session chain.
// Flow:
//   TMDB TV metadata -> exact ani.pm catalog match -> playback-bootstrap
//   -> formal Settlar session -> embed session API -> direct media.settlar.io HLS.
// No iframe is returned. Final HLS is validated before exposing it to Nuvio.

var ANI="https://ani.pm";
var EMBED="https://embed.settlar.io";
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
    "&lang="+encodeURIComponent(channel);
  return getJson(u,ANI+"/",12000);
}
function formalSession(selection,episode,channel){
  var q="selection="+encodeURIComponent(selection)+
    "&provider=anipm"+
    "&ep="+encodeURIComponent(String(episode))+
    "&channel="+encodeURIComponent(channel)+
    "&telemetry=0";
  return getJson(ANI+"/api/anime/settlar/session?"+q,ANI+"/",15000);
}
function embedSession(embedUrl){
  var m=/[?&]t=([^&#]+)/.exec(clean(embedUrl));
  if(!m)return Promise.reject(new Error("embed token missing"));
  var tok;
  try{tok=decodeURIComponent(m[1]);}catch(_){tok=m[1];}
  var u=EMBED+"/api/embed/session?t="+encodeURIComponent(tok);
  return getJson(u,embedUrl,15000);
}
function verifyHls(url){
  if(!/^https:\/\//i.test(clean(url)))return Promise.reject(new Error("bad HLS URL"));
  return withTimeout(fetch(url,{headers:{"User-Agent":UA,"Accept":"application/vnd.apple.mpegurl,*/*"}}),12000,"HLS")
    .then(function(r){
      if(!r.ok)throw new Error("HLS HTTP "+r.status);
      return r.text();
    }).then(function(body){
      if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
      return{quality:maxQuality(body),body:body};
    });
}
function resolveChannel(anime,episode,channel){
  var id=anime&&anime.id;
  if(!id)return Promise.resolve(null);
  return bootstrap(id,episode,channel).then(function(b){
    if(!b||!clean(b.settlarSelection))return null;
    var effective=clean(b.effectiveLanguage)==="dub"?"dub":"sub";
    if(effective!==channel)return null;
    if(b.availability&&b.availability[channel]===false)return null;
    return formalSession(clean(b.settlarSelection),episode,channel);
  }).then(function(s){
    if(!s||!clean(s.embedUrl))return null;
    return embedSession(clean(s.embedUrl));
  }).then(function(e){
    if(!e||clean(e.kind)!=="hls"||!/^https:\/\//i.test(clean(e.source)))return null;
    return verifyHls(clean(e.source)).then(function(v){
      var lab=channel==="dub"?"DUB":"SUB";
      var q=v.quality;
      var name="NoctraTV · ZStream · Tokyo · ani.pm · "+lab+" · "+q;
      return{
        name:name,
        title:name,
        url:clean(e.source),
        quality:q,
        type:"hls",
        provider:"noctra-zstream-tokyo",
        headers:{"User-Agent":UA},
        subtitles:subtitleRows(e.subtitles,lab),
        language:clean(e.audioLang)||(channel==="dub"?"en":"ja")
      };
    });
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

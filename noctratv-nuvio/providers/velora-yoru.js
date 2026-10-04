// NoctraTV · Velora · Yoru — current Videasy direct resolver.
// Yoru maps to Videasy "cdn/sources-with-title".
// Flow: db.videasy.net TMDB metadata -> api.videasy.net encrypted source payload
// -> enc-dec.app/dec-videasy -> direct media URLs. No iframe/WebView fallback.

var DB="https://db.videasy.net/3";
var API="https://api.videasy.net/cdn/sources-with-title";
var DEC="https://enc-dec.app/api/dec-videasy";
var PLAYER="https://player.videasy.net";
var META_KEY="ad301b7cc82ffe19273e55e4d4206885";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function qnum(v){
  var s=String(v||"").toLowerCase();
  if(/2160|4k/.test(s))return 2160;
  var m=s.match(/(1440|1080|720|480|360)/);
  return m?parseInt(m[1],10):0;
}
function qlabel(v){
  var n=qnum(v);
  return n===2160?"4K":(n?n+"p":"Auto");
}
function getJson(url,opts){
  return fetch(url,opts||{}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.json();
  });
}
function getText(url,opts){
  return fetch(url,opts||{}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.text();
  });
}
function meta(tmdbId,mediaType){
  var t=mediaType==="tv"?"tv":"movie";
  var url=DB+"/"+t+"/"+encodeURIComponent(String(tmdbId))+
    "?append_to_response=external_ids&language=en&api_key="+encodeURIComponent(META_KEY);
  return getJson(url,{headers:{"User-Agent":UA,"Accept":"application/json"}}).then(function(d){
    var title=clean(t==="tv"?(d.name||d.original_name):(d.title||d.original_title));
    var date=clean(t==="tv"?d.first_air_date:d.release_date);
    return {
      title:title,
      year:date&&date.length>=4?date.slice(0,4):"",
      imdb:clean(d&&d.external_ids&&d.external_ids.imdb_id),
      id:d&&d.id?d.id:tmdbId,
      type:t
    };
  });
}
function buildUrl(m,season,episode){
  var isTv=m.type==="tv";
  var q=[
    "title="+encodeURIComponent(m.title||""),
    "mediaType="+encodeURIComponent(m.type),
    "year="+encodeURIComponent(m.year||""),
    "episodeId="+encodeURIComponent(String(isTv?(episode||1):1)),
    "seasonId="+encodeURIComponent(String(isTv?(season||1):1)),
    "tmdbId="+encodeURIComponent(String(m.id)),
    "imdbId="+encodeURIComponent(m.imdb||"")
  ];
  return API+"?"+q.join("&");
}
function normalizeSources(dec,tmdbId){
  var r=dec&&dec.result||{};
  var srcs=Array.isArray(r.sources)?r.sources:[];
  var out=[],seen={};
  srcs.forEach(function(s){
    var u=clean(s&&(s.url||s.file));
    if(!/^https?:\/\//i.test(u)||seen[u])return;
    seen[u]=1;
    var q=qlabel(clean(s.quality)+" "+u);
    var rawQ=clean(s.quality);
    // Keep ordinary SDR sources; HDR-only branches are often device/player-specific.
    if(/HDR/i.test(rawQ))return;
    out.push({
      name:"NoctraTV · Velora · Yoru",
      title:"Velora · Yoru · "+(rawQ||q),
      url:u,
      quality:q,
      provider:"noctra-velora-yoru",
      format:/\.m3u8(?:\?|$)/i.test(u)?"m3u8":(/\.mpd(?:\?|$)/i.test(u)?"mpd":"video"),
      headers:{
        "User-Agent":UA,
        "Origin":PLAYER,
        "Referer":PLAYER+"/"
      },
      subtitles:Array.isArray(r.subtitles)?r.subtitles:[]
    });
  });
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  if(tmdbId==null)return Promise.resolve([]);
  return meta(tmdbId,mediaType)
    .then(function(m){
      return getText(buildUrl(m,season,episode),{
        headers:{
          "User-Agent":UA,
          "Accept":"*/*",
          "Origin":PLAYER,
          "Referer":PLAYER+"/",
          "Cache-Control":"no-cache"
        }
      });
    })
    .then(function(enc){
      if(!clean(enc))throw new Error("encrypted payload empty");
      return getJson(DEC,{
        method:"POST",
        headers:{
          "User-Agent":UA,
          "Content-Type":"application/json",
          "Accept":"application/json"
        },
        body:JSON.stringify({text:enc,id:String(tmdbId)})
      });
    })
    .then(function(dec){
      var out=normalizeSources(dec,tmdbId);
      console.log("[Noctra/Velora/Yoru] "+mediaType+" "+tmdbId+" streams="+out.length);
      return out;
    })
    .catch(function(e){
      console.log("[Noctra/Velora/Yoru] "+(e&&e.message?e.message:e));
      return[];
    });
}
module.exports={getStreams:getStreams};

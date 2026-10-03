// NoctraTV · Movy
// Maps the current Movy source family exposed by noctratv.com.
// Uses VidCore's Movy source endpoint to obtain direct Movy HLS URLs,
// then verifies each playlist locally before returning it to Nuvio.
// No iframe or web-player URL is returned.

var API="https://vidrack.created.app/api/sources/movy";
var REFERER="https://www.movy.bz/";
var ORIGIN="https://www.movy.bz";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";

function timeout(p,ms){
  if(typeof setTimeout!=="function") return p;
  return Promise.race([
    p,
    new Promise(function(_,rej){setTimeout(function(){rej(new Error("timeout"))},ms)})
  ]);
}

function qualityRank(q){
  var n=parseInt(String(q||"").match(/\d+/)?.[0]||"0",10);
  return n||0;
}

function requestHeaders(extra){
  var h={
    "User-Agent":UA,
    "Accept":"application/json, text/plain, */*",
    "Referer":"https://vidcore.org/"
  };
  Object.keys(extra||{}).forEach(function(k){h[k]=extra[k]});
  return h;
}

function streamHeaders(src){
  var h={};
  var inH=src&&src.headers&&typeof src.headers==="object"?src.headers:{};
  Object.keys(inH).forEach(function(k){h[k]=String(inH[k])});
  if(!h.Referer&&!h.referer) h.Referer=REFERER;
  if(!h.Origin&&!h.origin) h.Origin=ORIGIN;
  if(!h["User-Agent"]&&!h["user-agent"]) h["User-Agent"]=UA;
  return h;
}

function buildApiUrl(tmdbId,mediaType,season,episode){
  var u=API+"?id="+encodeURIComponent(String(tmdbId));
  if(mediaType==="tv"){
    u+="&type=tv&season="+encodeURIComponent(String(season==null?1:season))+
       "&episode="+encodeURIComponent(String(episode==null?1:episode));
  }
  return u;
}

function isDirectMedia(u){
  return /^https?:\/\//i.test(String(u||"")) && /\.m3u8(?:$|[?#])/i.test(String(u||""));
}

function verifyHls(src){
  if(!src||!isDirectMedia(src.url)) return Promise.resolve(null);
  var hs=streamHeaders(src);
  return timeout(fetch(src.url,{headers:hs}),7000).then(function(r){
    if(!r.ok) return null;
    return r.text().then(function(t){
      if(String(t||"").indexOf("#EXTM3U")!==0) return null;
      return {
        src:src,
        headers:hs
      };
    });
  }).catch(function(e){
    console.log("[NoctraTV/Movy] verify "+(src.quality||"auto")+" "+(e&&e.message?e.message:e));
    return null;
  });
}

function normalize(rows){
  var byQuality={};
  (rows||[]).forEach(function(s){
    if(!s||!isDirectMedia(s.url)) return;
    var q=String(s.quality||"Auto");
    var prev=byQuality[q];
    // Prefer the stable Miami moon.* path at equal quality, then keep first.
    var isMiami=/\bMiami\b/i.test(String(s.label||"")) || /moon\./i.test(String(s.url||""));
    var prevMiami=prev && (/\bMiami\b/i.test(String(prev.label||"")) || /moon\./i.test(String(prev.url||"")));
    if(!prev || (isMiami&&!prevMiami)) byQuality[q]=s;
  });
  return Object.keys(byQuality).map(function(k){return byQuality[k]})
    .sort(function(a,b){return qualityRank(b.quality)-qualityRank(a.quality)});
}

function toNuvio(v){
  var s=v.src;
  var q=String(s.quality||"Auto");
  var label=String(s.label||s.provider||"Movy");
  return {
    name:"NoctraTV · Movy",
    title:label,
    url:s.url,
    quality:q,
    provider:"noctra-movy",
    headers:v.headers
  };
}

function getStreams(tmdbId,mediaType,season,episode){
  var url=buildApiUrl(tmdbId,mediaType,season,episode);
  console.log("[NoctraTV/Movy] "+mediaType+" "+tmdbId);
  return timeout(fetch(url,{headers:requestHeaders()}),10000)
    .then(function(r){
      if(!r.ok) throw new Error("API HTTP "+r.status);
      return r.json();
    })
    .then(function(data){
      var rows=normalize(data&&Array.isArray(data.sources)?data.sources:[]);
      if(!rows.length) return [];
      return Promise.all(rows.map(verifyHls));
    })
    .then(function(verified){
      var out=(verified||[]).filter(Boolean).map(toNuvio);
      console.log("[NoctraTV/Movy] streams="+out.length);
      return out;
    })
    .catch(function(e){
      console.error("[NoctraTV/Movy] "+(e&&e.message?e.message:e));
      return [];
    });
}

module.exports={getStreams:getStreams};

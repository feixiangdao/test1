// Stellar · DooFlix — Nuvio local scraper
// TMDB direct-link API -> final redirect -> lightweight media preflight.

var BASE_API = "https://panel.watchkaroabhi.com";
var API_KEY = "qNhKLJiZVyoKdi9NCQGz8CIGrpUijujE";
var STREAM_REFERER = "https://molop.art/";
var API_HEADERS = {
  "X-Package-Name": "com.king.moja",
  "User-Agent": "dooflix",
  "X-App-Version": "305",
  "Accept": "application/json"
};
var PLAYBACK_HEADERS = {
  "Referer": STREAM_REFERER,
  "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36"
};

function clean(v){ return v == null ? "" : String(v).trim(); }

function buildApiUrl(tmdbId, mediaType, season, episode){
  if(mediaType === "tv"){
    if(!season || !episode) return "";
    return BASE_API + "/api/3/tv/" + encodeURIComponent(String(tmdbId)) +
      "/season/" + encodeURIComponent(String(season)) +
      "/episode/" + encodeURIComponent(String(episode)) +
      "/links?api_key=" + encodeURIComponent(API_KEY);
  }
  return BASE_API + "/api/3/movie/" + encodeURIComponent(String(tmdbId)) +
    "/links?api_key=" + encodeURIComponent(API_KEY);
}

function resolveLink(link){
  return fetch(link, {
    method:"GET",
    headers:PLAYBACK_HEADERS,
    redirect:"manual"
  }).then(function(r){
    var loc="";
    try{ loc=clean(r.headers.get("location")); }catch(_){}
    var finalUrl=loc || clean(r.url);
    if(!/^https?:\/\//i.test(finalUrl)) return null;
    return finalUrl;
  }).catch(function(){ return null; });
}

function preflight(url){
  var h={};
  Object.keys(PLAYBACK_HEADERS).forEach(function(k){ h[k]=PLAYBACK_HEADERS[k]; });
  h.Range="bytes=0-2047";
  return fetch(url,{headers:h,redirect:"manual"}).then(function(r){
    var status=Number(r.status)||0;
    var ct="";
    try{ ct=clean(r.headers.get("content-type")).toLowerCase(); }catch(_){}
    var ok=(status>=200&&status<300)||status===206;
    if(!ok && status>=300 && status<400){
      var loc="";
      try{loc=clean(r.headers.get("location"));}catch(_){}
      return {ok:!!loc,status:status,url:loc||url,contentType:ct};
    }
    return r.arrayBuffer().then(function(){
      return {ok:ok,status:status,url:url,contentType:ct};
    }).catch(function(){
      return {ok:ok,status:status,url:url,contentType:ct};
    });
  }).catch(function(){
    return {ok:false,status:0,url:url,contentType:""};
  });
}

function qualityFrom(obj,url){
  var raw=clean(obj && (obj.quality || obj.label || obj.resolution));
  if(raw) return raw;
  var s=clean(url).toLowerCase();
  if(s.indexOf("2160")>=0||s.indexOf("4k")>=0) return "4K";
  if(s.indexOf("1080")>=0) return "1080p";
  if(s.indexOf("720")>=0) return "720p";
  if(s.indexOf("480")>=0) return "480p";
  return "Auto";
}

function getStreams(tmdbId, mediaType, season, episode){
  var api=buildApiUrl(tmdbId,mediaType,season,episode);
  if(!api) return Promise.resolve([]);

  console.log("[Stellar/DooFlix] " + mediaType + " " + tmdbId);

  return fetch(api,{headers:API_HEADERS})
    .then(function(r){
      if(!r.ok) throw new Error("API HTTP " + r.status);
      return r.json();
    })
    .then(function(data){
      var links=Array.isArray(data && data.links) ? data.links : [];
      return Promise.all(links.slice(0,8).map(function(item){
        var link=clean(item && item.url);
        if(!/^https?:\/\//i.test(link)) return Promise.resolve(null);
        return resolveLink(link).then(function(finalUrl){
          if(!finalUrl) return null;
          return preflight(finalUrl).then(function(p){
            if(!p.ok || !/^https?:\/\//i.test(p.url)) return null;
            var q=qualityFrom(item,p.url);
            var host=clean(item && item.host) || "Server";
            var label="DooFlix · " + host + " · " + q + " · NET✓" + p.status;
            return {
              name:label,
              title:label,
              url:p.url,
              quality:q,
              provider:"stellar-dooflix",
              headers:PLAYBACK_HEADERS,
              subtitles:[]
            };
          });
        });
      }));
    })
    .then(function(rows){
      var out=[],seen={};
      (rows||[]).forEach(function(x){
        if(!x||!x.url||seen[x.url]) return;
        seen[x.url]=1;
        out.push(x);
      });
      console.log("[Stellar/DooFlix] streams=" + out.length);
      return out;
    })
    .catch(function(e){
      console.error("[Stellar/DooFlix] " + (e&&e.message?e.message:e));
      return [];
    });
}

module.exports={getStreams:getStreams,buildApiUrl:buildApiUrl};

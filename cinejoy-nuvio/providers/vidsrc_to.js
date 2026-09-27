// Cinejoy · Solaris Cloud (VidSrc.to) — Nuvio local scraper
// Direct-media only: tries the current JSON endpoint when available, then
// conservatively extracts actual media URLs from the embed page. Never returns
// an iframe URL as if it were a playable stream.

var BASE="https://vidsrc.to";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v) { return v == null ? "" : String(v).trim(); }
function directUrls(text) {
  var s = String(text || "")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
  var re = /https?:\/\/[^"'\\\s<>]+(?:\.m3u8|\.mp4|\.mpd)(?:\?[^"'\\\s<>]*)?/gi;
  var m, out = [], seen = {};
  while ((m = re.exec(s))) {
    var u = clean(m[0]).replace(/[),;\]}]+$/, "");
    if (!seen[u]) { seen[u] = true; out.push(u); }
  }
  return out;
}
function qualityFrom(url, fallback) {
  var s = String(url || "");
  var m = s.match(/(?:^|[^\d])(2160|1440|1080|720|480|360)p?(?:[^\d]|$)/i);
  if (m) return m[1] === "2160" ? "4K" : m[1] + "p";
  return fallback || (s.indexOf(".m3u8") >= 0 ? "Auto" : "HD");
}
function dedupe(rows) {
  var out = [], seen = {};
  (rows || []).forEach(function(x) {
    if (!x || !/^https?:\/\//i.test(x.url || "") || seen[x.url]) return;
    seen[x.url] = true; out.push(x);
  });
  return out;
}

function tmdbInfo(id,type){
  var t=type==="tv"?"tv":"movie";
  var u=TMDB+"/"+t+"/"+id+"?api_key="+encodeURIComponent(TMDB_KEY)+"&append_to_response=external_ids";
  return fetch(u,{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
    .then(function(d){return clean(d&&d.external_ids&&d.external_ids.imdb_id);})
    .catch(function(){return"";});
}
function normalizeJson(d,referer){
  var candidates=[];
  if(d){
    if(typeof d.url==="string")candidates.push(d.url);
    if(typeof d.download_mirror_url==="string")candidates.push(d.download_mirror_url);
    if(typeof d.stream==="string")candidates.push(d.stream);
    if(Array.isArray(d.sources))d.sources.forEach(function(x){
      if(typeof x==="string")candidates.push(x);
      else if(x)candidates.push(x.url||x.file||x.stream||"");
    });
  }
  return candidates.map(function(raw,i){
    var u=clean(raw); if(!/^https?:\/\//i.test(u) || !/\.(m3u8|mp4|mpd)(\?|$)/i.test(u))return null;
    return {name:"Cinejoy · Solaris Cloud",title:"Solaris Cloud · API "+(i+1),url:u,
      quality:qualityFrom(u,"Auto"),provider:"cinejoy-vidsrc-to",
      headers:{"User-Agent":UA,"Referer":referer},subtitles:[]};
  }).filter(Boolean);
}
function apiAttempt(imdb,type,season,episode){
  if(!imdb)return Promise.resolve([]);
  var p=type==="tv"?"/api/embed/tv/":"/api/embed/movie/";
  var u=BASE+p+encodeURIComponent(imdb);
  if(type==="tv")u+="?season="+encodeURIComponent(String(season||1))+"&episode="+encodeURIComponent(String(episode||1));
  return fetch(u,{headers:{"User-Agent":UA,"Referer":BASE+"/","Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("API "+r.status);return r.json();})
    .then(function(d){return normalizeJson(d,BASE+"/");})
    .catch(function(){return[];});
}
function pageAttempt(id,type,season,episode){
  var u=type==="tv"?BASE+"/embed/tv/"+id+"/"+(season||1)+"/"+(episode||1):BASE+"/embed/movie/"+id;
  return fetch(u,{headers:{"User-Agent":UA,"Referer":BASE+"/","Accept":"text/html,application/xhtml+xml,*/*"}})
    .then(function(r){if(!r.ok)throw new Error("embed "+r.status);return r.text();})
    .then(function(html){
      return directUrls(html).map(function(x,i){
        return{name:"Cinejoy · Solaris Cloud",title:"Solaris Cloud · Direct "+(i+1),url:x,
          quality:qualityFrom(x,"Auto"),provider:"cinejoy-vidsrc-to",
          headers:{"User-Agent":UA,"Referer":BASE+"/"},subtitles:[]};
      });
    }).catch(function(){return[];});
}
function getStreams(tmdbId,mediaType,season,episode){
  return tmdbInfo(tmdbId,mediaType).then(function(imdb){
    return apiAttempt(imdb,mediaType,season,episode);
  }).then(function(out){
    if(out.length)return out;
    return pageAttempt(tmdbId,mediaType,season,episode);
  }).then(dedupe).catch(function(e){console.error("[Cinejoy/VidSrcTo] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

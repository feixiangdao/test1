// Cinejoy · Pulsar Relay (VidSrc Me / VSEmbed) — Nuvio local scraper
// Uses the direct stream API first, then performs conservative embed-page extraction.

var API="https://data.vidsrcme.ru";
var EMBEDS=["https://vsembed.ru/embed","https://vidsrc.me/embed"];
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

function apiUrl(tmdbId,mediaType,season,episode){
  var u=API+"/api.php?type="+(mediaType==="tv"?"tv":"movie")+"&tmdb="+encodeURIComponent(String(tmdbId))+"&stream_urls=";
  if(mediaType==="tv")u+="&season="+encodeURIComponent(String(season||1))+"&episode="+encodeURIComponent(String(episode||1));
  return u;
}
function fromApi(tmdbId,mediaType,season,episode){
  return fetch(apiUrl(tmdbId,mediaType,season,episode),{headers:{"User-Agent":UA,"Referer":"https://vsembed.ru/","Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("API "+r.status);return r.json();})
    .then(function(d){
      var rawList=d&&d.data?d.data.stream_urls:null;
      var a=Array.isArray(rawList)?rawList:[];
      return a.map(function(raw,i){
        var u=clean(raw && typeof raw === "object" ? (raw.url || raw.file || raw.stream || raw.src) : raw);
        if(!/^https?:\/\//i.test(u))return null;
        return {name:"Cinejoy · Pulsar Relay",title:"Pulsar Relay · "+(i+1),url:u,
          quality:qualityFrom(u,"Auto"),provider:"cinejoy-vidsrc-me",
          headers:{"User-Agent":UA,"Referer":"https://vsembed.ru/"},subtitles:[]};
      }).filter(Boolean);
    }).catch(function(){return[];});
}
function scrapeEmbed(i,tmdbId,mediaType,season,episode){
  if(i>=EMBEDS.length)return Promise.resolve([]);
  var base=EMBEDS[i];
  var u=mediaType==="tv"?base+"/tv/"+tmdbId+"/"+(season||1)+"/"+(episode||1):base+"/movie/"+tmdbId;
  return fetch(u,{headers:{"User-Agent":UA,"Referer":base+"/"}})
    .then(function(r){if(!r.ok)throw new Error("embed "+r.status);return r.text();})
    .then(function(html){
      var urls=directUrls(html);
      if(!urls.length)return scrapeEmbed(i+1,tmdbId,mediaType,season,episode);
      return urls.map(function(x,n){return{name:"Cinejoy · Pulsar Relay",title:"Pulsar Relay · Direct "+(n+1),url:x,
        quality:qualityFrom(x,"Auto"),provider:"cinejoy-vidsrc-me",headers:{"User-Agent":UA,"Referer":base+"/"},subtitles:[]};});
    }).catch(function(){return scrapeEmbed(i+1,tmdbId,mediaType,season,episode);});
}
function getStreams(tmdbId,mediaType,season,episode){
  return fromApi(tmdbId,mediaType,season,episode).then(function(out){
    if(out.length)return out;
    return scrapeEmbed(0,tmdbId,mediaType,season,episode);
  }).then(dedupe).catch(function(e){console.error("[Cinejoy/VidSrcMe] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

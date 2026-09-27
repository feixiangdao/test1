// Cinejoy · Zenith Direct (RiveStream) — Nuvio local scraper
// Uses RiveStream's public scraper API and returns direct media URLs.

var API = "https://scrapper.rivestream.app";
var FRONT = "https://www.rivestream.app";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var FALLBACK = ["apex","pulse","solstice","quasar","primevids","flowcast","citadel","guru","asiacloud","horizon","hindicast"];

function clean(v) { return v == null ? "" : String(v).trim(); }
function headers() {
  return {
    "User-Agent": UA,
    "Referer": FRONT + "/",
    "Origin": FRONT,
    "Accept": "application/json, text/plain, */*"
  };
}
function qualityNum(q) {
  var s = String(q || "").toLowerCase();
  if (s.indexOf("2160") >= 0 || s.indexOf("4k") >= 0) return 2160;
  var m=s.match(/(\d{3,4})/); return m ? parseInt(m[1],10) : 0;
}
function getProviders() {
  return fetch(API + "/api/providers", {headers:headers()})
    .then(function(r){ if(!r.ok) throw new Error("providers "+r.status); return r.json(); })
    .then(function(d){
      var a = d && Array.isArray(d.data) ? d.data : (Array.isArray(d) ? d : []);
      a = a.map(function(x){
        if (typeof x === "string") return clean(x);
        if (x && typeof x === "object") return clean(x.id || x.name || x.provider || x.slug);
        return "";
      }).filter(Boolean);
      return a.length ? a : FALLBACK;
    })
    .catch(function(){ return FALLBACK; });
}
function getStreams(tmdbId, mediaType, season, episode) {
  var isTv = mediaType === "tv";
  return getProviders().then(function(providers) {
    var cb = Math.floor(Date.now()/3000000);
    var jobs = providers.map(function(provider) {
      var u = API + "/api/provider?provider=" + encodeURIComponent(provider) +
        "&id=" + encodeURIComponent(String(tmdbId));
      if (isTv) u += "&season=" + encodeURIComponent(String(season||1)) +
        "&episode=" + encodeURIComponent(String(episode||1));
      if (provider === "primevids" || provider === "citadel") u += "&cb=" + cb;
      return fetch(u,{headers:headers()})
        .then(function(r){ if(!r.ok) return null; return r.json(); })
        .then(function(d){
          var src = d && d.data && Array.isArray(d.data.sources) ? d.data.sources : [];
          return src.map(function(s){
            var url=clean(s && (s.url || s.file));
            if(!/^https?:\/\//i.test(url)) return null;
            var q=clean(s.quality || "Auto");
            var sn=clean(s.source || provider);
            return {
              name:"Cinejoy · Zenith Direct",
              title:"Zenith Direct · "+sn+" · "+q,
              url:url, quality:q, provider:"cinejoy-rivestream",
              headers:{"User-Agent":UA,"Referer":FRONT+"/","Origin":FRONT},
              subtitles:[]
            };
          }).filter(Boolean);
        })
        .catch(function(){ return []; });
    });
    return Promise.all(jobs);
  }).then(function(groups){
    var out=[],seen={};
    (groups||[]).forEach(function(g){(g||[]).forEach(function(x){
      if(x && x.url && !seen[x.url]){seen[x.url]=1;out.push(x);}
    });});
    out.sort(function(a,b){return qualityNum(b.quality)-qualityNum(a.quality);});
    console.log("[Cinejoy/RiveStream] streams="+out.length);
    return out;
  }).catch(function(e){
    console.error("[Cinejoy/RiveStream] "+(e&&e.message?e.message:e));
    return [];
  });
}
module.exports = { getStreams:getStreams };

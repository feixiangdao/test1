// Stellar · NetMirror — Nuvio local scraper
// Current mobile playlist flow verified 2026-09-28.
// Supports Netflix / Prime Video / Hotstar/Disney+ mirrors and movie/TV HLS.

var MAIN = "https://net52.cc";
var TMDB_BASE = "https://api.themoviedb.org/3";
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";
var UA = "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0";
var PLAY_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Safari/537.36 /OS.Gatu v3.0";

var PLATFORMS = [
  { key:"nf", name:"Netflix", ott:"nf", prefix:"/mobile" },
  { key:"pv", name:"Prime Video", ott:"pv", prefix:"/mobile/pv" },
  { key:"hs", name:"Hotstar/Disney+", ott:"hs", prefix:"/mobile/hs" }
];

var cookieValue = "";
var cookieTime = 0;
var COOKIE_TTL = 6 * 60 * 60 * 1000;

function clean(v) { return v == null ? "" : String(v).trim(); }

function norm(v) {
  return clean(v).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"")
    .trim();
}

function absoluteUrl(value, base) {
  var s = clean(value);
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.indexOf("//") === 0) return "https:" + s;
  if (s.charAt(0) === "/") return MAIN + s;
  var b = clean(base || MAIN);
  return b.replace(/\/+$/,"") + "/" + s.replace(/^\/+/,"");
}

function tmdbInfo(tmdbId, mediaType) {
  var t = mediaType === "tv" ? "tv" : "movie";
  var url = TMDB_BASE + "/" + t + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(TMDB_KEY) + "&language=en-US";

  return fetch(url,{headers:{Accept:"application/json","User-Agent":UA}})
    .then(function(r){
      if(!r.ok) throw new Error("TMDB HTTP " + r.status);
      return r.json();
    })
    .then(function(d){
      var date = clean(t === "tv" ? d.first_air_date : d.release_date);
      return {
        title: clean(t === "tv" ? d.name : d.title),
        originalTitle: clean(t === "tv" ? d.original_name : d.original_title),
        year: date ? date.slice(0,4) : ""
      };
    });
}

function getCookie() {
  var now = Date.now();
  if (cookieValue && now - cookieTime < COOKIE_TTL) return Promise.resolve(cookieValue);

  return fetch(MAIN + "/verify.php",{
    method:"POST",
    followRedirects:false,
    headers:{
      "User-Agent":UA,
      Origin:"https://net22.cc",
      Referer:"https://net22.cc/verify2",
      "Content-Type":"application/x-www-form-urlencoded"
    },
    body:"g-recaptcha-response=11111111-2222-3333-4444-555555555555"
  }).then(function(r){
    var sc = "";
    try { sc = r.headers.get("set-cookie") || r.headers.get("Set-Cookie") || ""; } catch (_) {}
    var m = String(sc).match(/t_hash_t=([^;]+)/);
    if(!m) throw new Error("NetMirror t_hash_t missing");
    cookieValue = m[1];
    cookieTime = Date.now();
    return cookieValue;
  });
}

function cookieFor(platform) {
  return "t_hash_t=" + cookieValue + "; ott=" + platform.ott + "; hd=on";
}

function fetchJson(url, platform, extra) {
  var headers = {
    Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":"en-IN,en-US;q=0.9,en;q=0.8",
    "User-Agent":UA,
    "X-Requested-With":"XMLHttpRequest",
    Cookie:cookieFor(platform),
    Referer:MAIN + "/mobile/home?app=1"
  };
  Object.keys(extra || {}).forEach(function(k){ headers[k] = extra[k]; });

  return fetch(url,{headers:headers}).then(function(r){
    if(!r.ok) throw new Error("NetMirror HTTP " + r.status);
    return r.json();
  });
}

function rankResults(results, meta) {
  var wanted = norm(meta.title);
  var original = norm(meta.originalTitle);
  return (results || []).slice().sort(function(a,b){
    function score(x){
      var n = norm(x && (x.t || x.title));
      if(n === wanted || (original && n === original)) return 0;
      if(n && wanted && (n.indexOf(wanted)>=0 || wanted.indexOf(n)>=0)) return 1;
      return 2;
    }
    return score(a)-score(b);
  });
}

function episodeNumber(v) {
  return Number(String(v || "").replace(/\D/g,"")) || 0;
}

function findEpisode(list, season, episode, fallbackSeason) {
  var wantedS = Number(season) || 1;
  var wantedE = Number(episode) || 1;
  return (Array.isArray(list) ? list : []).find(function(x){
    if(!x) return false;
    var en = episodeNumber(x.ep || x.epNum);
    var sn = episodeNumber(x.s || x.sNum) || Number(fallbackSeason) || 1;
    return en === wantedE && sn === wantedS;
  }) || null;
}

function fetchEpisode(platform, seriesId, post, season, episode) {
  var wantedS = Number(season) || 1;
  var ep = findEpisode(post && post.episodes, wantedS, episode, wantedS);
  if(ep && ep.id != null) return Promise.resolve(ep);

  var seasons = Array.isArray(post && post.season) ? post.season : [];
  var seasonEntry = seasons.find(function(s){
    return episodeNumber(s && s.s) === wantedS;
  }) || seasons[wantedS - 1];

  if(!seasonEntry || seasonEntry.id == null) return Promise.resolve(null);

  var page = 1;
  function next() {
    if(page > 30) return Promise.resolve(null);
    var url = MAIN + platform.prefix + "/episodes.php?s=" +
      encodeURIComponent(String(seasonEntry.id)) + "&series=" +
      encodeURIComponent(String(seriesId)) + "&t=" +
      Math.floor(Date.now()/1000) + "&page=" + page;

    return fetchJson(url,platform).then(function(data){
      var found = findEpisode(data && data.episodes,wantedS,episode,wantedS);
      if(found && found.id != null) return found;
      if(!data || !data.nextPageShow || Number(data.nextPageShow) === 0) return null;
      page += 1;
      return next();
    });
  }
  return next();
}

function qualityOf(label) {
  var s = clean(label).toLowerCase();
  if(s.indexOf("1080")>=0 || s.indexOf("full hd")>=0) return "1080p";
  if(s.indexOf("720")>=0 || s.indexOf("mid hd")>=0) return "720p";
  if(s.indexOf("480")>=0 || s.indexOf("low hd")>=0) return "480p";
  return "Auto";
}

function subtitlesFrom(entries) {
  var out = [], seen = {};
  (entries || []).forEach(function(entry){
    (entry && Array.isArray(entry.tracks) ? entry.tracks : []).forEach(function(t){
      if(!t || clean(t.kind).toLowerCase() !== "captions" || !t.file) return;
      var url = absoluteUrl(t.file,MAIN);
      if(!url || seen[url]) return;
      seen[url] = 1;
      var lang = clean(t.label) || "Subtitle";
      out.push({url:url,language:lang,name:lang + " [NetMirror]"});
    });
  });
  return out.slice(0,20);
}

function normalizePlaylist(data, platform, title) {
  var entries = Array.isArray(data) ? data :
    (data && Array.isArray(data.playlist) ? data.playlist :
      (data && Array.isArray(data.data) ? data.data : []));
  var subs = subtitlesFrom(entries);
  var out = [], seen = {};

  entries.forEach(function(entry){
    (entry && Array.isArray(entry.sources) ? entry.sources : []).forEach(function(src){
      if(!src || !src.file) return;
      var url = absoluteUrl(src.file,MAIN);
      if(!url || seen[url]) return;
      seen[url] = 1;

      var q = qualityOf(src.label);
      var label = "NetMirror · " + platform.name + " · " + q;
      out.push({
        name:label,
        title:label,
        url:url,
        quality:q,
        provider:"stellar-netmirror",
        headers:{
          Accept:"*/*",
          "Accept-Language":"en-IN,en-US;q=0.9,en;q=0.8",
          Referer:MAIN + "/mobile/home?app=1",
          "User-Agent":PLAY_UA,
          "X-Requested-With":"app.netmirror.netmirrornew",
          Cookie:"hd=on"
        },
        subtitles:subs
      });
    });
  });

  var order={"1080p":4,"720p":3,"480p":2,"Auto":1};
  out.sort(function(a,b){return (order[b.quality]||0)-(order[a.quality]||0);});
  return out;
}

function tryPlatform(platform, meta, mediaType, season, episode) {
  var now = Math.floor(Date.now()/1000);
  var searchUrl = MAIN + platform.prefix + "/search.php?s=" +
    encodeURIComponent(meta.title) + "&t=" + now;

  return fetchJson(searchUrl,platform).then(function(search){
    var results = rankResults(search && search.searchResult,meta).slice(0,8);

    function tryResult(index) {
      if(index >= results.length) return Promise.resolve([]);
      var hit = results[index];
      if(!hit || hit.id == null) return tryResult(index+1);

      var postUrl = MAIN + platform.prefix + "/post.php?id=" +
        encodeURIComponent(String(hit.id)) + "&t=" + (now+1);

      return fetchJson(postUrl,platform).then(function(post){
        if(!post || post.status === "n") return tryResult(index+1);

        var py = clean(post.year);
        if(meta.year && py && py.indexOf(meta.year) < 0 && mediaType !== "tv") {
          return tryResult(index+1);
        }

        if(mediaType === "tv") {
          if(post.type !== "t" && !(post.episodes || []).some(Boolean) && !(post.season || []).length) {
            return tryResult(index+1);
          }
          return fetchEpisode(platform,hit.id,post,season,episode).then(function(ep){
            if(!ep || ep.id == null) return tryResult(index+1);
            return fetchPlaylist(platform,String(ep.id),meta.title,now+20);
          });
        }

        if(post.type === "t" || (post.episodes || []).some(Boolean)) return tryResult(index+1);
        return fetchPlaylist(platform,String(hit.id),meta.title,now+20);
      }).catch(function(){
        return tryResult(index+1);
      });
    }

    return tryResult(0);
  }).catch(function(){ return []; });
}

function fetchPlaylist(platform,targetId,title,stamp) {
  var url = MAIN + platform.prefix + "/playlist.php?id=" +
    encodeURIComponent(targetId) + "&t=" + encodeURIComponent(title) +
    "&tm=" + stamp;

  return fetchJson(url,platform,{
    "X-Requested-With":"app.netmirror.netmirrornew",
    Accept:"*/*",
    "Sec-Fetch-Dest":"empty",
    "Sec-Fetch-Mode":"cors",
    "Sec-Fetch-Site":"same-origin"
  }).then(function(data){
    return normalizePlaylist(data,platform,title);
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Stellar/NetMirror] " + mediaType + " " + tmdbId);
  var meta = null;

  return Promise.all([tmdbInfo(tmdbId,mediaType),getCookie()])
    .then(function(values){
      meta = values[0];
      if(!meta || !meta.title) throw new Error("TMDB title missing");

      var chain = Promise.resolve([]);
      PLATFORMS.forEach(function(platform){
        chain = chain.then(function(rows){
          if(rows && rows.length) return rows;
          return tryPlatform(platform,meta,mediaType,season,episode);
        });
      });
      return chain;
    })
    .then(function(rows){
      console.log("[Stellar/NetMirror] streams=" + (rows ? rows.length : 0));
      return rows || [];
    })
    .catch(function(e){
      console.error("[Stellar/NetMirror] " + (e && e.message ? e.message : e));
      return [];
    });
}

module.exports = {
  getStreams:getStreams,
  qualityOf:qualityOf,
  normalizePlaylist:normalizePlaylist,
  findEpisode:findEpisode
};

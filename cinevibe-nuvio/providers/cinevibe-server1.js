// CineVibe Local for Nuvio
// v0.1.0
// CineVibe.cc Server 1 compatible route:
// TMDB -> MovieBox / OneRoom (aoneroom) -> direct HLS/DASH/MP4.
//
// Why this exists:
// CineVibe's current/previous frontend uses an embed-player layer. The default
// Vidsuper-compatible source order puts OneRoom/MovieBox first ("Server 1").
// This provider resolves that upstream directly so Nuvio does not depend on
// vidsuper.net being reachable.
//
// React Native / Hermes friendly: Promise chains, no async/await.

var MAIN_URL = "https://themoviebox.org";
var API_BASE = "https://h5-api.aoneroom.com";
var REFERER = "https://themoviebox.org/";
var DEFAULT_TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

var bearerToken = "";
var bearerExpiry = 0;
var DIAG = [];

function clean(v){ return v == null ? "" : String(v).trim(); }
function now(){ return Date.now ? Date.now() : (new Date()).getTime(); }
function settings(){ try { return (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) || {}; } catch(_) { return {}; } }

function diag(msg){
  msg = clean(msg).replace(/\s+/g, " ").slice(0, 180);
  if(msg && DIAG.indexOf(msg) < 0) DIAG.push(msg);
}
function resetDiag(){ DIAG = []; }

function diagRows(){
  var rows = DIAG.length ? DIAG.slice(-6) : ["No route returned a stream"];
  return rows.map(function(msg, i){
    var label = "CineVibe · DIAG " + (i + 1) + " · " + msg;
    return {
      name: "CineVibe · Server 1",
      title: label,
      url: "data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQojRVhULVgtVkVSU0lPTjozCiNFWFQtWC1FTkRMSVNUCg==",
      quality: "Status",
      type: "hls",
      provider: "cinevibe-server1",
      headers: {},
      subtitles: []
    };
  });
}

function tmdbKey(){
  var s = settings();
  var k = clean(s.tmdbApiKey);
  if(k) return k;
  try {
    k = clean(typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY);
    if(k) return k;
  } catch(_) {}
  return DEFAULT_TMDB_API_KEY;
}

function cryptoJs(){
  try { return require("crypto-js"); } catch(_) { return null; }
}

function md5Hex(s){
  var C = cryptoJs();
  if(C && C.MD5) return C.MD5(String(s)).toString();
  // Small fallback MD5 is intentionally not reimplemented here. In normal
  // Nuvio provider runtime crypto-js is available.
  throw new Error("crypto-js MD5 unavailable");
}

function clientTimeToken(){
  var ts = Math.floor(now() / 1000);
  var rev = String(ts).split("").reverse().join("");
  return String(ts) + "," + md5Hex(rev);
}

function baseHeaders(){
  return {
    "Accept": "application/json",
    "User-Agent": UA,
    "X-Client-Info": JSON.stringify({ timezone: "Asia/Jakarta" }),
    "Content-Type": "application/json"
  };
}

function copyObj(a){
  var o = {}, k;
  a = a || {};
  for(k in a) if(Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
  return o;
}

function mergeHeaders(a, b){
  var o = copyObj(a), k;
  b = b || {};
  for(k in b) if(Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k];
  return o;
}

function fetchJson(url, opt, label){
  opt = opt || {};
  try { opt.skipSizeCheck = true; } catch(_) {}
  return fetch(url, opt).then(function(r){
    if(!r || !r.ok) throw new Error((label || "HTTP") + " " + (r ? r.status : "no-response"));
    return r.text().then(function(t){
      try { return { response: r, data: JSON.parse(t) }; }
      catch(_) { throw new Error((label || "JSON") + " invalid JSON"); }
    });
  });
}

function getTmdbInfo(tmdbId, mediaType){
  var type = mediaType === "tv" ? "tv" : "movie";
  var u = "https://api.themoviedb.org/3/" + type + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(tmdbKey()) + "&language=en-US";
  return fetchJson(u, { headers: { "Accept":"application/json", "User-Agent":UA } }, "TMDB")
    .then(function(x){
      var d = x.data || {};
      var title = clean(d.title || d.name || d.original_title || d.original_name);
      var date = clean(d.release_date || d.first_air_date);
      var year = parseInt(date.slice(0,4),10) || 0;
      if(!title) throw new Error("TMDB title missing");
      diag("TMDB · " + title + (year ? " · " + year : ""));
      return { title:title, year:year };
    });
}

function getBearerToken(){
  if(bearerToken && bearerExpiry > now()) return Promise.resolve(bearerToken);

  var h;
  try {
    h = mergeHeaders(baseHeaders(), {
      "Authorization": "",
      "X-Request-Lang": "en",
      "X-Client-Token": clientTimeToken(),
      "Referer": MAIN_URL + "/"
    });
  } catch(e) {
    return Promise.reject(e);
  }

  return fetch(API_BASE + "/wefeed-h5api-bff/home?host=themoviebox.org", {
    headers: h,
    skipSizeCheck: true
  }).then(function(r){
    if(!r || !r.ok) throw new Error("home " + (r ? r.status : "no-response"));
    var xUser = "";
    try { xUser = clean(r.headers && r.headers.get && r.headers.get("x-user")); } catch(_) {}
    if(xUser){
      try {
        var j = JSON.parse(xUser);
        var t = clean(j && j.token);
        if(t){
          bearerToken = t;
          bearerExpiry = now() + 20 * 60 * 1000;
          diag("AUTH · bearer ok");
          return t;
        }
      } catch(_) {}
    }
    diag("AUTH · no bearer, continue anonymous");
    return "";
  }).catch(function(e){
    diag("AUTH · " + (e && e.message ? e.message : e));
    return "";
  });
}

function simple(v){
  return clean(v).toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

function titleScore(found, wanted){
  var a = simple(found), b = simple(wanted);
  if(!a || !b) return 0;
  if(a === b) return 200;
  if(a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 120;
  var aa = a.split(" "), bb = b.split(" "), hit = 0;
  bb.forEach(function(t){ if(t.length > 1 && aa.indexOf(t) >= 0) hit++; });
  return bb.length ? Math.round(80 * hit / bb.length) : 0;
}

function itemYear(item){
  var vals = [
    item && item.releaseDate,
    item && item.release_date,
    item && item.year,
    item && item.releaseYear,
    item && item.firstAirDate
  ];
  for(var i=0;i<vals.length;i++){
    var m = clean(vals[i]).match(/(19\d{2}|20\d{2})/);
    if(m) return parseInt(m[1],10) || 0;
  }
  return 0;
}

function findBestItem(items, info, mediaType){
  var wantedTypes = mediaType === "tv" ? [2,3] : [1];
  var ranked = [];
  (items || []).forEach(function(item){
    var st = parseInt(item && item.subjectType,10) || 0;
    if(wantedTypes.indexOf(st) < 0) return;
    var title = clean(item && item.title);
    if(!title) return;
    var sc = titleScore(title, info.title);
    var y = itemYear(item);
    if(info.year && y) sc += Math.abs(info.year - y) <= 1 ? 35 : -15;
    ranked.push({ item:item, score:sc, title:title, year:y });
  });
  ranked.sort(function(a,b){ return b.score - a.score; });
  if(!ranked.length || ranked[0].score < 60) return null;
  return ranked[0];
}

function searchSubject(info, mediaType, token){
  var h;
  try {
    h = mergeHeaders(baseHeaders(), {
      "Authorization": token ? ("Bearer " + token) : "",
      "X-Request-Lang": "en",
      "X-Client-Token": clientTimeToken(),
      "Referer": MAIN_URL + "/"
    });
  } catch(e) {
    return Promise.reject(e);
  }

  return fetchJson(API_BASE + "/wefeed-h5api-bff/subject/search", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      keyword: info.title,
      page: 1,
      perPage: 28,
      subjectType: 0
    })
  }, "search").then(function(x){
    var items = x.data && x.data.data && x.data.data.items;
    items = Array.isArray(items) ? items : [];
    diag("SEARCH · " + items.length + " results");
    var best = findBestItem(items, info, mediaType);
    if(!best) throw new Error("no strong title match");
    diag("MATCH · " + best.title + " · score " + best.score);
    return best.item;
  });
}

function playSubject(item, season, episode){
  var subjectId = clean(item && item.subjectId);
  var detailPath = clean(item && item.detailPath);
  if(!subjectId || !detailPath) return Promise.reject(new Error("match missing id/path"));

  var h;
  try {
    h = mergeHeaders(baseHeaders(), {
      "X-Request-Lang": "en",
      "X-Client-Token": clientTimeToken(),
      "Referer": MAIN_URL + "/movies/" + detailPath
    });
  } catch(e) {
    return Promise.reject(e);
  }

  var u = API_BASE + "/wefeed-h5api-bff/subject/play?subjectId=" +
    encodeURIComponent(subjectId) +
    "&se=" + encodeURIComponent(String(season || 0)) +
    "&ep=" + encodeURIComponent(String(episode || 0)) +
    "&detailPath=" + encodeURIComponent(detailPath);

  return fetchJson(u, { headers:h }, "play").then(function(x){
    var d = x.data && x.data.data;
    if(!d || !d.hasResource) throw new Error("no resource");
    var rows = []
      .concat(Array.isArray(d.streams) ? d.streams : [])
      .concat(Array.isArray(d.hls) ? d.hls : [])
      .concat(Array.isArray(d.dash) ? d.dash : []);
    diag("PLAY · " + rows.length + " raw streams");
    return rows;
  });
}

function mediaTypeFromUrl(u){
  u = clean(u).toLowerCase();
  if(u.indexOf(".m3u8") >= 0) return "hls";
  if(u.indexOf(".mpd") >= 0) return "dash";
  return "mp4";
}

function qualityOf(row){
  var q = clean(row && (row.resolutions || row.resolution || row.quality || row.label));
  var m = q.match(/(2160|1440|1080|720|480|360|240)/);
  if(m) return m[1] === "2160" ? "4K" : (m[1] + "p");
  return q ? q.replace(/p$/i,"") + "p" : "Auto";
}

function normalizeStreams(rows, title, mediaType, season, episode){
  var out = [], seen = {};
  (rows || []).forEach(function(row, idx){
    var u = clean(row && row.url);
    if(!/^https?:\/\//i.test(u) || seen[u]) return;
    seen[u] = 1;
    var q = qualityOf(row);
    var t = title;
    if(mediaType === "tv") t += " · S" + season + "E" + episode;
    out.push({
      name: "CineVibe · Server 1",
      title: "CineVibe · Server 1 · " + q + (out.length ? " · " + (out.length + 1) : ""),
      url: u,
      quality: q,
      type: mediaTypeFromUrl(u),
      provider: "cinevibe-server1",
      headers: {
        "User-Agent": UA,
        "Referer": REFERER
      },
      subtitles: []
    });
  });

  out.sort(function(a,b){
    function n(q){
      if(q === "4K") return 2160;
      var m = String(q).match(/(\d+)/);
      return m ? parseInt(m[1],10) : 0;
    }
    return n(b.quality) - n(a.quality);
  });
  return out;
}

function getStreams(tmdbId, mediaType, season, episode){
  resetDiag();
  mediaType = mediaType === "tv" ? "tv" : "movie";
  season = parseInt(season,10) || 0;
  episode = parseInt(episode,10) || 0;

  if(!tmdbId) return Promise.resolve([]);
  if(mediaType === "tv" && (!season || !episode)){
    diag("TV · missing season/episode");
    return Promise.resolve(diagRows());
  }

  return getTmdbInfo(String(tmdbId), mediaType)
    .then(function(info){
      return getBearerToken().then(function(token){
        return searchSubject(info, mediaType, token).then(function(item){
          return playSubject(item, season, episode).then(function(rows){
            var streams = normalizeStreams(rows, info.title, mediaType, season, episode);
            if(!streams.length) throw new Error("no direct http streams");
            diag("OK · " + streams.length + " playable rows");
            return streams;
          });
        });
      });
    })
    .catch(function(e){
      diag("FAIL · " + (e && e.message ? e.message : e));
      return diagRows();
    });
}

function onSettings(){
  return [
    { type:"header", label:"CineVibe Local · Server 1" },
    {
      type:"info",
      label:"直接解析 CineVibe 默认 Server 1 对应的 MovieBox/OneRoom 后端，不依赖 vidsuper.net。"
    },
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"留空使用公共备用 Key；若遇到限流可填写自己的 TMDB v3 API Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}

module.exports = {
  getStreams: getStreams,
  onSettings: onSettings
};

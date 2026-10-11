// Flixbaba · VidBolt  (flixbaba.best "Player #5")
// Local resolver: the flixbaba watch page embeds https://vidbolt.xyz/movie/<tmdb>
// (TV: /tv/<tmdb>/<season>/<episode>). VidBolt only plays inside an iframe, so this
// module queries the VidBolt scraper backend directly and returns the signed HLS
// URLs it produces, never the iframe.

var BUILD = "FB1.0.0";
var SCRAPER = "https://scraper.vidbolt.xyz";
var TMDB = "https://api.themoviedb.org/3";
var TMDB_KEY = (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) ? globalThis.TMDB_API_KEY : "7045bc4055c6293e84534dd8f6dbb024";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var SERVERS = ["Quasar", "Vidlink"];

function clean(v) { return v == null ? "" : String(v).trim(); }
function qnum(q) { var m = String(q || "").match(/(2160|1440|1080|720|576|480|360|240)/); return m ? parseInt(m[1], 10) : 0; }

function diag(msg) {
  return [{
    name: "Flixbaba · VidBolt · " + BUILD + " · " + msg,
    title: "Flixbaba · VidBolt · " + BUILD + " · " + msg,
    url: "about:error",
    quality: "Status",
    type: "diagnostic",
    provider: "flixbaba-vidbolt"
  }];
}

function safeHeaders(src) {
  var out = {}, h = src && typeof src === "object" ? src : {};
  Object.keys(h).forEach(function (k) {
    var lk = String(k).toLowerCase();
    if (lk === "range" || lk === "connection" || lk === "accept-encoding" || lk === "host" || lk === "content-length") return;
    var v = clean(h[k]); if (v) out[k] = v;
  });
  if (!out["User-Agent"] && !out["user-agent"]) out["User-Agent"] = UA;
  return out;
}
function tmdbInfo(tmdbId, type) {
  var t = type === "tv" ? "tv" : "movie";
  var u = TMDB + "/" + t + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(TMDB_KEY) + "&language=en-US&append_to_response=external_ids";
  return fetch(u, { headers: { "Accept": "application/json", "User-Agent": UA } })
    .then(function (r) { if (!r.ok) throw new Error("tmdb " + r.status); return r.json(); })
    .then(function (d) {
      return {
        title: clean(t === "tv" ? d.name : d.title),
        year: clean(t === "tv" ? d.first_air_date : d.release_date).slice(0, 4),
        imdb: clean(d && d.external_ids && d.external_ids.imdb_id) || clean(d && d.imdb_id),
        tmdbId: String(tmdbId), type: t
      };
    });
}
function scraperUrl(server, info, season, episode) {
  var u = SCRAPER + "/scrape/" + server + "/" + info.type + "/" + encodeURIComponent(info.imdb || info.tmdbId) +
    "?tmdbId=" + encodeURIComponent(info.tmdbId);
  if (info.type === "tv") u += "&season=" + encodeURIComponent(String(season || 1)) + "&episode=" + encodeURIComponent(String(episode || 1));
  return u;
}
function one(server, info, season, episode) {
  if (!info.imdb) return Promise.resolve([]);
  return fetch(scraperUrl(server, info, season, episode), {
    headers: { "Accept": "application/json", "User-Agent": UA, "Referer": "https://vidbolt.xyz/" }
  }).then(function (r) {
    if (!r.ok) throw new Error(server + " HTTP " + r.status);
    return r.json();
  }).then(function (j) {
    var rows = j && Array.isArray(j.sources) ? j.sources : [];
    return rows.map(function (row) {
      if (!row || typeof row !== "object") return null;
      var u = clean(row.url);
      if (!/^https?:\/\//i.test(u)) return null;
      var q = clean(row.quality || "Auto");
      var m = q.match(/(\d{3,4})/); if (m) q = m[1] + "p";
      var lang = clean(row.language);
      var type = /\.m3u8(?:\?|$)/i.test(u) ? "hls" : (/\.mp4(?:\?|$)/i.test(u) ? "mp4" : "hls");
      var label = "VidBolt · " + server + " · " + q + (lang ? " · " + lang : "");
      return { name: "Flixbaba · VidBolt", title: label, url: u, quality: q,
        type: type, provider: "flixbaba-vidbolt",
        headers: safeHeaders(row.headers), subtitles: [] };
    }).filter(Boolean);
  }).catch(function (e) {
    console.log("[Flixbaba/VidBolt] " + server + " " + (e && e.message ? e.message : e));
    return [];
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId) return Promise.resolve([]);
  if (mediaType !== "movie" && mediaType !== "tv") return Promise.resolve([]);
  if (mediaType === "tv" && (!season || !episode)) return Promise.resolve([]);
  return tmdbInfo(tmdbId, mediaType).then(function (info) {
    if (!info.imdb) throw new Error("imdb id missing");
    return Promise.all(SERVERS.map(function (s) { return one(s, info, season, episode); }));
  }).then(function (groups) {
    var out = [], seen = {};
    (groups || []).forEach(function (g) { (g || []).forEach(function (x) { if (x && x.url && !seen[x.url]) { seen[x.url] = 1; out.push(x); } }); });
    out.sort(function (a, b) { return qnum(b.quality) - qnum(a.quality); });
    console.log("[Flixbaba/VidBolt] " + BUILD + " streams=" + out.length);
    if (!out.length) return diag("no streams");
    return out;
  }).catch(function (e) {
    console.error("[Flixbaba/VidBolt] " + (e && e.message ? e.message : e));
    return diag("error " + (e && e.message ? e.message : e));
  });
}
module.exports = { getStreams: getStreams };

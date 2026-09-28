// Stellar · VidZee — Nuvio local scraper
// Promise-only / Hermes-compatible.

var API_BASE = "https://core.vidzee.wtf";
var PLAYER_ORIGIN = "https://player.vidzee.wtf";
var STREAM_REFERER = PLAYER_ORIGIN + "/";
var SERVERS = ["dcloud", "tik", "ipcloud", "v6:Hindi"];
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v) { return v == null ? "" : String(v).trim(); }

function qNum(q) {
  var s = String(q || "").toLowerCase();
  if (s.indexOf("2160") >= 0 || s.indexOf("4k") >= 0) return 2160;
  if (s.indexOf("1080") >= 0) return 1080;
  if (s.indexOf("720") >= 0) return 720;
  if (s.indexOf("480") >= 0) return 480;
  return 0;
}

function qLabel(url) {
  var n = qNum(url);
  if (n >= 2160) return "4K";
  if (n > 0) return n + "p";
  return "Auto";
}

function buildApiUrl(tmdbId, mediaType, season, episode, server) {
  var id = encodeURIComponent(String(tmdbId));
  var path = mediaType === "tv"
    ? "/streams/tv/" + id + "/" + encodeURIComponent(String(season || 1)) + "/" + encodeURIComponent(String(episode || 1))
    : "/streams/movie/" + id;
  return API_BASE + path + "?s=" + encodeURIComponent(server) + "&e=0";
}

function one(tmdbId, mediaType, season, episode, server) {
  var url = buildApiUrl(tmdbId, mediaType, season, episode, server);
  return fetch(url, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Referer": STREAM_REFERER,
      "Origin": PLAYER_ORIGIN,
      "User-Agent": UA
    }
  }).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function(data) {
    var media = clean(data && data.url);
    if (!/^https?:\/\//i.test(media)) return null;

    var upstream = data && data.headers && typeof data.headers === "object" ? data.headers : {};
    var headers = {
      "Referer": STREAM_REFERER,
      "User-Agent": UA
    };
    Object.keys(upstream).forEach(function(k) {
      var v = clean(upstream[k]);
      if (v) headers[k] = v;
    });

    var lang = clean(data && data.language) || (server === "v6:Hindi" ? "Hindi" : "Unknown");
    var q = qLabel(media);
    return {
      name: "Stellar · VidZee",
      title: "VidZee · " + server + " · " + lang + " · " + q,
      url: media,
      quality: q,
      language: lang,
      provider: "stellar-vidzee",
      headers: headers,
      subtitles: []
    };
  }).catch(function(e) {
    console.log("[Stellar/VidZee] " + server + " " + (e && e.message ? e.message : e));
    return null;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Stellar/VidZee] " + mediaType + " " + tmdbId);
  return Promise.all(SERVERS.map(function(server) {
    return one(tmdbId, mediaType, season, episode, server);
  })).then(function(rows) {
    var out = [], seen = {};
    (rows || []).forEach(function(x) {
      if (!x || !x.url || seen[x.url]) return;
      seen[x.url] = 1;
      out.push(x);
    });
    out.sort(function(a, b) { return qNum(b.quality) - qNum(a.quality); });
    console.log("[Stellar/VidZee] streams=" + out.length);
    return out;
  }).catch(function(e) {
    console.error("[Stellar/VidZee] " + (e && e.message ? e.message : e));
    return [];
  });
}

module.exports = { getStreams: getStreams };

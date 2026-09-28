// VidZee Direct — Nuvio local scraper
// Uses VidZee's current plaintext stream API (e=0) and returns native HLS URLs.
// Promise-only / Hermes-compatible.

var API_BASE = "https://core.vidzee.wtf";
var PLAYER_ORIGIN = "https://player.vidzee.wtf";
var STREAM_REFERER = PLAYER_ORIGIN + "/";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

// Current server ids used by the VidZee player.
// ipcloud is kept as a fallback; some media may use unusual segment wrapping.
var SERVERS = ["dcloud", "tik", "ipcloud", "v6:Hindi"];

function clean(v) {
  return v == null ? "" : String(v).trim();
}

function buildStreamUrl(tmdbId, mediaType, season, episode, server) {
  var id = encodeURIComponent(String(tmdbId));
  var path;
  if (mediaType === "tv") {
    path = "/streams/tv/" + id + "/" +
      encodeURIComponent(String(season || 1)) + "/" +
      encodeURIComponent(String(episode || 1));
  } else {
    path = "/streams/movie/" + id;
  }
  return API_BASE + path + "?s=" + encodeURIComponent(server) + "&e=0";
}

function qualityFromUrl(url) {
  var s = clean(url).toLowerCase();
  if (s.indexOf("2160") >= 0 || s.indexOf("4k") >= 0) return "4K";
  if (s.indexOf("1080") >= 0) return "1080p";
  if (s.indexOf("720") >= 0) return "720p";
  if (s.indexOf("480") >= 0) return "480p";
  if (s.indexOf("360") >= 0) return "360p";
  return "Auto";
}

function normalizePayload(data, server) {
  if (!data || typeof data !== "object") return null;
  var url = clean(data.url);
  if (!/^https?:\/\//i.test(url)) return null;

  var lang = clean(data.language) || (server === "v6:Hindi" ? "Hindi" : "Unknown");
  var upstreamHeaders = data.headers && typeof data.headers === "object" ? data.headers : {};
  var headers = {
    "Referer": STREAM_REFERER,
    "User-Agent": UA
  };
  Object.keys(upstreamHeaders).forEach(function(k) {
    var v = clean(upstreamHeaders[k]);
    if (v) headers[k] = v;
  });

  var quality = qualityFromUrl(url);
  return {
    name: "VidZee Direct",
    title: "VidZee · " + server + " · " + lang + " · " + quality,
    url: url,
    quality: quality,
    language: lang,
    provider: "vidzee-direct",
    headers: headers,
    subtitles: []
  };
}

function fetchServer(tmdbId, mediaType, season, episode, server) {
  var api = buildStreamUrl(tmdbId, mediaType, season, episode, server);
  return fetch(api, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Referer": STREAM_REFERER,
      "Origin": PLAYER_ORIGIN,
      "User-Agent": UA
    }
  })
    .then(function(r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function(data) {
      return normalizePayload(data, server);
    })
    .catch(function() {
      return null;
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId || (mediaType !== "movie" && mediaType !== "tv")) return Promise.resolve([]);
  if (mediaType === "tv" && (!season || !episode)) return Promise.resolve([]);

  console.log("[VidZee Direct] " + mediaType + " " + tmdbId);

  var jobs = SERVERS.map(function(server) {
    return fetchServer(tmdbId, mediaType, season, episode, server);
  });

  return Promise.all(jobs)
    .then(function(rows) {
      var out = [];
      var seen = {};
      (rows || []).forEach(function(x) {
        if (!x || !x.url || seen[x.url]) return;
        seen[x.url] = true;
        out.push(x);
      });
      console.log("[VidZee Direct] streams=" + out.length);
      return out;
    })
    .catch(function(e) {
      console.error("[VidZee Direct] " + (e && e.message ? e.message : e));
      return [];
    });
}

module.exports = {
  getStreams: getStreams,
  buildStreamUrl: buildStreamUrl,
  normalizePayload: normalizePayload
};

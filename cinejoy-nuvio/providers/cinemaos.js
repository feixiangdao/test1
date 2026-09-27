// Cinejoy · Aether 1 (CinemaOS) — Nuvio local scraper
// CinemaOS is currently documented as an embed provider. This module is
// deliberately conservative: it only returns a stream when a true direct
// media URL is exposed in the fetched player HTML. It never returns the iframe.

var BASE = "https://cinemaos.tech";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

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

function getStreams(tmdbId, mediaType, season, episode) {
  var path = mediaType === "tv"
    ? "/player/" + tmdbId + "/" + (season || 1) + "/" + (episode || 1)
    : "/player/" + tmdbId;
  var url = BASE + path;
  return fetch(url, { headers: {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,*/*",
    "Referer": BASE + "/"
  }})
  .then(function(r) {
    if (!r.ok) throw new Error("CinemaOS HTTP " + r.status);
    return r.text();
  })
  .then(function(html) {
    var urls = directUrls(html);
    return urls.map(function(u, i) {
      return {
        name: "Cinejoy · Aether 1",
        title: "Aether 1 · Direct " + (i + 1),
        url: u,
        quality: qualityFrom(u, "Auto"),
        provider: "cinejoy-cinemaos",
        headers: { "Referer": BASE + "/", "User-Agent": UA },
        subtitles: []
      };
    });
  })
  .catch(function(e) {
    console.log("[Cinejoy/CinemaOS] " + (e && e.message ? e.message : e));
    return [];
  });
}
module.exports = { getStreams: getStreams };

// Cinejoy · VidLink — Nuvio local scraper
// Promise-only / Hermes-compatible

var ENC_DEC_API = "https://enc-dec.app/api";
var VIDLINK_API = "https://vidlink.pro/api/b";
var API_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://vidlink.pro/",
  "Origin": "https://vidlink.pro",
  "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36"
};

function clean(v) {
  return v == null ? "" : String(v).trim();
}

function qNum(q) {
  var s = String(q || "").toLowerCase();
  if (s === "4k" || s === "2160") return 2160;
  var n = parseInt(s, 10);
  return isFinite(n) ? n : 0;
}

function qLabel(q) {
  var n = qNum(q);
  if (n >= 2160) return "4K";
  if (n > 0) return n + "p";
  return clean(q) || "Auto";
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Cinejoy/VidLink] " + mediaType + " " + tmdbId);

  return fetch(ENC_DEC_API + "/enc-vidlink?text=" + encodeURIComponent(String(tmdbId)))
    .then(function(r) {
      if (!r.ok) throw new Error("encrypt HTTP " + r.status);
      return r.json();
    })
    .then(function(enc) {
      var token = clean(enc && enc.result);
      if (!token) throw new Error("encrypted id missing");

      var api;
      if (mediaType === "tv") {
        api = VIDLINK_API + "/tv/" + encodeURIComponent(token) + "/" +
          String(season || 1) + "/" + String(episode || 1) + "?multiLang=0";
      } else {
        api = VIDLINK_API + "/movie/" + encodeURIComponent(token) + "?multiLang=0";
      }

      return fetch(api, { headers: API_HEADERS });
    })
    .then(function(r) {
      if (!r.ok) throw new Error("VidLink HTTP " + r.status);
      return r.json();
    })
    .then(function(data) {
      var qualities = data && data.stream && data.stream.qualities;
      if (!qualities || typeof qualities !== "object") return [];

      var out = [];
      Object.keys(qualities).forEach(function(q) {
        var item = qualities[q];
        var url = clean(item && item.url);
        if (!/^https?:\/\//i.test(url)) return;

        out.push({
          name: "Cinejoy · VidLink",
          title: "VidLink · " + qLabel(q),
          url: url,
          quality: qLabel(q),
          provider: "cinejoy-vidlink",
          subtitles: []
        });
      });

      out.sort(function(a, b) { return qNum(b.quality) - qNum(a.quality); });
      console.log("[Cinejoy/VidLink] streams=" + out.length);
      return out;
    })
    .catch(function(e) {
      console.error("[Cinejoy/VidLink] " + (e && e.message ? e.message : e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

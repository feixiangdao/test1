// Flixer Local Lab — Nuvio-compatible adapter for the separate browser resolver.
// This is not a self-contained scraper: its endpoint MUST be configured.
// Kept separate from other providers and disabled by default in the lab manifest.
function onSettings() {
  return [
    { type: "header", label: "Flixer Local experimental resolver" },
    { type: "info", label: "Requires an independently hosted resolver. Without it, this provider safely returns no streams." },
    { type: "text", key: "endpoint", label: "Resolver HTTPS base URL", defaultValue: "" },
    { type: "text", key: "token", label: "Resolver token (if configured)", isPassword: true, defaultValue: "" }
  ];
}
function clean(v) { return v == null ? "" : String(v).trim(); }
function getStreams(tmdbId, mediaType, season, episode) {
  var cfg = {};
  try { cfg = globalThis.SCRAPER_SETTINGS || {}; } catch (_) {}
  var endpoint = clean(cfg.endpoint).replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/.test(endpoint)) {
    console.log("[Flixer] No HTTPS resolver configured");
    return Promise.resolve([]);
  }
  var type = clean(mediaType);
  var id = clean(tmdbId);
  if ((type !== "movie" && type !== "tv") || !/^\d{1,10}$/.test(id)) return Promise.resolve([]);
  var path = "/resolve/" + type + "/" + id;
  if (type === "tv") {
    var s = clean(season), e = clean(episode);
    if (!/^\d{1,3}$/.test(s) || !/^\d{1,3}$/.test(e)) return Promise.resolve([]);
    path += "/" + s + "/" + e;
  }
  var headers = { "Accept": "application/json" };
  var token = clean(cfg.token);
  if (token) headers.Authorization = "Bearer " + token;
  return fetch(endpoint + path, { headers: headers })
    .then(function(r) {
      if (!r.ok) throw new Error("Resolver HTTP " + r.status);
      return r.json();
    })
    .then(function(data) {
      return (data && Array.isArray(data.streams) ? data.streams : []).filter(function(x) {
        return x && typeof x.url === "string" &&
          /^https:\/\//.test(x.url) && /\.m3u8(?:$|[?#])/.test(x.url);
      }).map(function(x) {
        return {
          name: clean(x.name) || "Flixer · Alpha",
          title: clean(x.title) || "Flixer · Alpha",
          url: x.url,
          quality: clean(x.quality) || "Auto",
          type: "hls",
          provider: "flixer-local-lab",
          headers: x.headers || {}
        };
      });
    })
    .catch(function(err) {
      console.log("[Flixer] " + (err && err.message ? err.message : err));
      return [];
    });
}
module.exports = { getStreams: getStreams, onSettings: onSettings };

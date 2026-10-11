// Flixbaba · VidBolt  (flixbaba.best "Player #5")
//
// The flixbaba watch page embeds https://vidbolt.xyz/movie/<tmdb> (TV:
// /tv/<tmdb>/<season>/<episode>). VidBolt only plays inside an iframe, so this
// module talks to the VidBolt scraper backend directly and returns the signed
// HLS / direct-video URLs it produces, never the iframe.
//
// ID HANDLING
// -----------
// Nuvio hands us whatever identifier the active catalog uses. In practice that
// is often an IMDb id (`tt0816692`), not a TMDB id, even though the parameter is
// named tmdbId. The VidBolt scraper needs a *numeric* TMDB id in its `tmdbId`
// query (an IMDb id there returns 404), so an IMDb id is mapped first.
//
// The mapping uses Stremio's Cinemeta, deliberately NOT api.themoviedb.org:
// that host is DNS/TLS-blocked on many mobile networks, which would make the
// provider fail before it ever reaches VidBolt. Cinemeta also supplies the
// title/year used for the display label.
//
// PLAYBACK URLS: WHY SOME ROWS ARE DROPPED
// ----------------------------------------
// VidBolt hands back two shapes of playback URL:
//   (a) an HLS playlist — either /proxy/m3u8/<b64> or a bare upstream host.
//   (b) /proxy/segment/<b64> — a raw-file passthrough, used for MKV releases.
// Shape (b) is NOT broken by itself: it serves the .vtt subtitles fine. What
// breaks is the *origin behind it*. Every (b) row here points at a.111477.xyz or
// cf.streamflixserver.site, and both sit behind a Cloudflare managed challenge.
// VidBolt's proxy relays that challenge verbatim, so the URL answers HTTP
// 403/502/504 with an HTML body ("Just a moment...", server: cloudflare,
// cf-mitigated: challenge) instead of video. ExoPlayer and mpv both fail on it
// (ERROR_CODE_IO_BAD_HTTP_STATUS / "loading failed").
//
// Measured 2026-10-11 on two independent egresses (desktop + Android emulator):
// every URL whose origin was 111477.xyz / streamflixserver.site failed 7/7 times,
// while every other origin (hls.shegu.net, img1.*.com, aapanel.devcorp.me, and
// the direct m3u8 hosts) returned 200. A runtime probe discriminates perfectly
// but costs ~15 s wall clock on this egress — far past any sane provider budget —
// so the known-bad origins are listed below instead, at zero latency.
//
// A row that can never play is worse than no row, so matching rows are dropped
// unless that would empty the list (then they are kept, so the caller still has
// something to show). Delete a zone from GATED_ORIGINS once it works again.

var BUILD = "FB1.3.0";
var SCRAPER = "https://scraper.vidbolt.xyz";
var SERVER = "Quasar";
var REFERER = "https://vidbolt.xyz/";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var MAX_SUBTITLES = 12;
var DROP_GATED_ORIGINS = true;

// Origin zones observed serving a Cloudflare challenge instead of media.
var GATED_ORIGINS = ["111477.xyz", "streamflixserver.site"];

// Ordered fallbacks; the first entry also carries the year, which the second
// does not.
var CINEMETA = [
  "https://v3-cinemeta.strem.io",
  "https://cinemeta-live.strem.io"
];

function clean(v) { return v == null ? "" : String(v).trim(); }
function qnum(q) { var m = String(q || "").match(/(2160|1440|1080|720|576|480|360|240)/); return m ? parseInt(m[1], 10) : 0; }

// Pure-JS base64 -> ASCII. QuickJS on-device has no guaranteed atob(), and the
// only thing decoded here is a URL, so a minimal decoder is enough.
var B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64decode(input) {
  var s = String(input).replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
  var out = "", buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    var v = B64_CHARS.indexOf(s.charAt(i));
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); }
  }
  return out;
}

// Recover the real origin a playback URL ultimately reads from. VidBolt hides it
// two ways: plainly in ?q=u=<url> for most raw-file rows, or only inside the
// /proxy/<kind>/<base64> path segment for the rest.
function originOf(u) {
  var s = String(u);
  var m = s.match(/[?&]q=[^&]*?u=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
  var b = s.match(/\/proxy\/(?:m3u8|segment)\/([A-Za-z0-9_-]+)/);
  return b ? b64decode(b[1]) : "";
}

function isGatedOrigin(u) {
  var o = originOf(u);
  if (!o) return false;
  for (var i = 0; i < GATED_ORIGINS.length; i++) {
    if (o.indexOf(GATED_ORIGINS[i]) !== -1) return true;
  }
  return false;
}

// Diagnostic row. Nuvio does not surface console output, so the only way to read
// a failure on-device is to return it as a result row. The URL is "about:error"
// and the quality is "Status", so this can never be played.
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

// Playback headers must not carry hop-by-hop / length headers: the upstream
// response sets those, and forwarding them breaks the player.
function safeHeaders(src) {
  var out = {}, h = src && typeof src === "object" ? src : {};
  Object.keys(h).forEach(function (k) {
    var lk = String(k).toLowerCase();
    if (lk === "range" || lk === "connection" || lk === "accept-encoding" ||
        lk === "host" || lk === "content-length" || lk === "keep-alive" ||
        lk === "transfer-encoding" || lk === "upgrade") return;
    var v = clean(h[k]); if (v) out[k] = v;
  });
  if (!out["User-Agent"] && !out["user-agent"]) out["User-Agent"] = UA;
  return out;
}

function mapSubs(list) {
  return (Array.isArray(list) ? list : []).map(function (s) {
    var u = clean(s && s.url);
    if (!/^https?:\/\//i.test(u)) return null;
    var label = clean(s.label || s.lang) || "Subtitle";
    return { url: u.replace(/ /g, "%20"), language: clean(s.lang || s.label) || "und", name: label };
  }).filter(Boolean).slice(0, MAX_SUBTITLES);
}

// Returns { tmdbId, title, year } or null.
function resolveId(rawId, mediaType) {
  var id = clean(rawId);
  if (/^\d+$/.test(id)) return Promise.resolve({ tmdbId: id, title: "", year: "" });
  var kind = mediaType === "tv" ? "series" : "movie";
  var index = 0;
  function attempt() {
    if (index >= CINEMETA.length) return Promise.resolve(null);
    var base = CINEMETA[index++];
    return fetch(base + "/meta/" + kind + "/" + encodeURIComponent(id) + ".json", {
      headers: { "Accept": "application/json", "User-Agent": UA }
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (d) {
      var m = d && d.meta;
      if (m && m.moviedb_id) {
        return { tmdbId: String(m.moviedb_id), title: clean(m.name), year: clean(m.year).slice(0, 4) };
      }
      return attempt();
    }).catch(function () { return attempt(); });
  }
  return attempt();
}

function endpoint(tmdbId, mediaType, season, episode) {
  var type = mediaType === "tv" ? "tv" : "movie";
  var id = encodeURIComponent(String(tmdbId));
  var u = SCRAPER + "/scrape/" + SERVER + "/" + type + "/" + id + "?tmdbId=" + id;
  if (type === "tv") {
    u += "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode));
  }
  return u;
}

function getStreams(tmdbId, mediaType, season, episode) {
  // Offline guard: never touch the network without a usable identifier.
  if (!tmdbId) return Promise.resolve([]);
  if (mediaType !== "movie" && mediaType !== "tv") return Promise.resolve([]);
  if (mediaType === "tv" && (!season || !episode)) return Promise.resolve([]);

  var tag = "id=" + String(tmdbId) + " type=" + String(mediaType) +
    (mediaType === "tv" ? " s=" + season + " e=" + episode : "");
  console.log("[Flixbaba/VidBolt] " + BUILD + " " + tag);

  return resolveId(tmdbId, mediaType).then(function (res) {
    if (!res || !res.tmdbId) throw new Error("cannot map " + tmdbId + " to a TMDB id");
    var suffix = res.title ? " · " + res.title + (res.year ? " (" + res.year + ")" : "") : "";
    return fetch(endpoint(res.tmdbId, mediaType, season, episode), {
      headers: { "Accept": "application/json", "User-Agent": UA, "Referer": REFERER }
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " · tmdb=" + res.tmdbId);
      return r.json();
    }).then(function (j) {
      var src = (j && Array.isArray(j.sources)) ? j.sources : [];
      var subs = mapSubs(j && j.subtitles);
      var out = [], seen = {};
      src.forEach(function (row) {
        if (!row || typeof row !== "object") return;
        var u = clean(row.url);
        if (!/^https?:\/\//i.test(u) || seen[u]) return;
        seen[u] = 1;
        var q = clean(row.quality || "Auto");
        var m = q.match(/(\d{3,4})/); if (m) q = m[1] + "p";
        var lang = clean(row.language);
        var label = "VidBolt · " + q + (lang ? " · " + lang : "") + suffix;
        var rowOut = {
          name: "Flixbaba · " + label,
          title: label,
          url: u,
          quality: q,
          provider: "flixbaba-vidbolt",
          headers: safeHeaders(row.headers),
          subtitles: subs
        };
        // Only "hls" is a recognised stream type in this repo; direct video
        // files are left untyped, as the other working providers do.
        var kind = clean(row.type).toLowerCase();
        if (kind === "m3u8" || kind === "hls" || /\.m3u8(?:\?|$)/i.test(u)) rowOut.type = "hls";
        rowOut.__gated = isGatedOrigin(u);
        out.push(rowOut);
      });

      // Prefer rows that can actually play. Keep the gated ones only when the
      // filter would empty the list outright.
      var gated = out.filter(function (r) { return r.__gated; }).length;
      var kept = DROP_GATED_ORIGINS ? out.filter(function (r) { return !r.__gated; }) : out;
      var dropped = 0;
      if (kept.length) { dropped = gated; out = kept; }
      out.forEach(function (r) { delete r.__gated; });

      out.sort(function (a, b) { return qnum(b.quality) - qnum(a.quality); });
      console.log("[Flixbaba/VidBolt] " + BUILD + " tmdb=" + res.tmdbId +
        " sources=" + src.length + " streams=" + out.length +
        " dropped=" + dropped + " subs=" + subs.length);
      if (!out.length) return diag("no streams · tmdb=" + res.tmdbId);
      return out;
    });
  }).catch(function (e) {
    var msg = e && e.message ? e.message : String(e);
    console.error("[Flixbaba/VidBolt] " + BUILD + " " + msg);
    return diag("error " + msg);
  });
}

module.exports = { getStreams: getStreams };

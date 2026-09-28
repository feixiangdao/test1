// Stellar · VixSrc — Nuvio local scraper
// Runs entirely on the Nuvio device to avoid datacenter/Vercel blocking.

var BASE = "https://vixsrc.to";
var TMDB_BASE = "https://api.themoviedb.org/3";
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v) { return v == null ? "" : String(v).trim(); }

function req(url, opt) {
  return fetch(url, opt || {}).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r;
  });
}

function decodeValue(v) {
  return clean(v).replace(/\\\//g, "/").replace(/\\u0026/gi, "&").replace(/&amp;/g, "&");
}

function addParams(url, params) {
  var sep = url.indexOf("?") >= 0 ? "&" : "?";
  return url + sep + Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k]));
  }).join("&");
}

function getImdbId(tmdbId, mediaType) {
  var t = mediaType === "tv" ? "tv" : "movie";
  var u = TMDB_BASE + "/" + t + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(TMDB_KEY) + "&append_to_response=external_ids";
  return req(u, { headers: { "Accept": "application/json", "User-Agent": UA } })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return clean(d && (d.imdb_id || (d.external_ids && d.external_ids.imdb_id)));
    });
}

function apiUrl(imdbId, mediaType, season, episode) {
  return mediaType === "tv"
    ? BASE + "/api/tv/" + encodeURIComponent(imdbId) + "/" + encodeURIComponent(String(season || 1)) + "/" + encodeURIComponent(String(episode || 1))
    : BASE + "/api/movie/" + encodeURIComponent(imdbId);
}

function pageUrl(imdbId, mediaType, season, episode) {
  return mediaType === "tv"
    ? BASE + "/tv/" + encodeURIComponent(imdbId) + "/" + encodeURIComponent(String(season || 1)) + "/" + encodeURIComponent(String(episode || 1))
    : BASE + "/movie/" + encodeURIComponent(imdbId);
}

function extractInfo(html) {
  var s = String(html || "");
  var at = s.indexOf("window.masterPlaylist");
  if (at < 0) return null;
  var block = s.substring(at, at + 5000);
  var mt = block.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
  var me = block.match(/['"]?expires['"]?\s*:\s*['"]?(\d+)['"]?/);
  var mu = block.match(/url\s*:\s*['"]([^'"]+)['"]/);
  if (!mt || !me || !mu) return null;
  return {
    token: decodeValue(mt[1]),
    expires: clean(me[1]),
    url: decodeValue(mu[1]),
    canPlayFHD: /window\.canPlayFHD\s*=\s*true/i.test(s)
  };
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Stellar/VixSrc] " + mediaType + " " + tmdbId);

  var imdb = "";
  var ref = "";
  var embed = "";

  return getImdbId(tmdbId, mediaType)
    .then(function(id) {
      imdb = id;
      if (!/^tt\d+$/i.test(imdb)) throw new Error("IMDb id missing");
      ref = pageUrl(imdb, mediaType, season, episode);
      return req(apiUrl(imdb, mediaType, season, episode), {
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Referer": ref,
          "User-Agent": UA
        }
      });
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var src = clean(data && data.src);
      if (!src) throw new Error("embed src missing");
      embed = /^https?:\/\//i.test(src) ? src : BASE + (src.charAt(0) === "/" ? src : "/" + src);
      return req(embed, {
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Referer": ref,
          "Origin": BASE,
          "User-Agent": UA
        }
      });
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      var info = extractInfo(html);
      if (!info || !/^https?:\/\//i.test(info.url)) return [];

      var commonHeaders = {
        "Referer": embed,
        "Origin": BASE,
        "User-Agent": UA
      };
      var out = [];
      var normal = addParams(info.url, {
        token: info.token,
        expires: info.expires,
        h: 1,
        lang: "en"
      });
      out.push({
        name: "Stellar · VixSrc",
        title: "VixSrc · Auto HLS",
        url: normal,
        quality: "Auto",
        provider: "stellar-vixsrc",
        headers: commonHeaders,
        subtitles: []
      });

      if (info.canPlayFHD) {
        var fhd = addParams(info.url, {
          token: info.token,
          expires: info.expires,
          h: 1,
          b: 1,
          lang: "en"
        });
        out.push({
          name: "Stellar · VixSrc",
          title: "VixSrc · FHD HLS",
          url: fhd,
          quality: "1080p",
          provider: "stellar-vixsrc",
          headers: commonHeaders,
          subtitles: []
        });
      }

      console.log("[Stellar/VixSrc] streams=" + out.length);
      return out;
    })
    .catch(function(e) {
      console.error("[Stellar/VixSrc] " + (e && e.message ? e.message : e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

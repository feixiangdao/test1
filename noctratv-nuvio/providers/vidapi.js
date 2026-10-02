// NoctraTV · VidAPI — Nuvio local scraper
// Direct HLS API. Movie + TV. Runs locally on the Nuvio device.

var API = "https://streamdata.vaplayer.ru";
var TMDB_BASE = "https://api.themoviedb.org/3";
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";
var REFERER = "https://nextgencloudfabric.com/";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v) {
  return v == null ? "" : String(v).trim();
}

function tmdbImdb(tmdbId, mediaType) {
  var type = mediaType === "tv" ? "tv" : "movie";
  var url = TMDB_BASE + "/" + type + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(TMDB_KEY) + "&append_to_response=external_ids";

  return fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": UA }
  }).then(function(r) {
    if (!r.ok) throw new Error("TMDB HTTP " + r.status);
    return r.json();
  }).then(function(d) {
    return clean(d && (d.imdb_id || (d.external_ids && d.external_ids.imdb_id)));
  });
}

function apiUrl(imdbId, mediaType, season, episode) {
  if (mediaType === "tv") {
    return API + "/api.php?imdb=" + encodeURIComponent(imdbId) +
      "&type=tv&season=" + encodeURIComponent(String(season || 1)) +
      "&episode=" + encodeURIComponent(String(episode || 1));
  }
  return API + "/api.php?imdb=" + encodeURIComponent(imdbId) + "&type=movie";
}

function maxHlsQuality(text) {
  var s = String(text || "");
  var re = /RESOLUTION=\d+x(\d+)/gi;
  var m, max = 0;
  while ((m = re.exec(s)) !== null) {
    var h = parseInt(m[1], 10) || 0;
    if (h > max) max = h;
  }
  if (max >= 2160) return "4K";
  if (max >= 1440) return "1440p";
  if (max >= 1080) return "1080p";
  if (max >= 720) return "720p";
  if (max >= 480) return "480p";
  if (max > 0) return max + "p";
  return "Auto";
}

function normalizeSubs(json) {
  var list = Array.isArray(json && json.default_subs) ? json.default_subs : [];
  return list.filter(function(s) {
    return s && s.url;
  }).slice(0, 8).map(function(s) {
    return {
      url: s.url,
      language: clean(s.lang || s.code) || "en",
      name: (clean(s.lang || s.code) || "Subtitle") + " [VAPlayer]"
    };
  });
}

function probe(url, index, subtitles) {
  var headers = {
    "Referer": REFERER,
    "User-Agent": UA
  };

  return fetch(url, { headers: headers }).then(function(r) {
    if (!r.ok) throw new Error("HLS HTTP " + r.status);
    return r.text().then(function(text) {
      if (text.indexOf("#EXTM3U") < 0) throw new Error("not HLS");
      var q = maxHlsQuality(text);
      var label = "VidAPI · HLS " + (index + 1) + " · up to " + q;
      return {
        name: label,
        title: label,
        url: url,
        quality: q,
        provider: "noctra-vidapi",
        headers: headers,
        subtitles: subtitles
      };
    });
  }).catch(function(e) {
    console.log("[NoctraTV/VidAPI] mirror " + (index + 1) + " " + (e && e.message ? e.message : e));
    return null;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[NoctraTV/VidAPI] " + mediaType + " " + tmdbId);

  return tmdbImdb(tmdbId, mediaType)
    .then(function(imdbId) {
      if (!/^tt\d+$/i.test(imdbId)) throw new Error("IMDb id missing");
      return fetch(apiUrl(imdbId, mediaType, season, episode), {
        headers: {
          "Referer": REFERER,
          "User-Agent": UA,
          "Accept": "application/json, text/plain, */*"
        }
      });
    })
    .then(function(r) {
      if (!r.ok) throw new Error("VAPlayer HTTP " + r.status);
      return r.json();
    })
    .then(function(json) {
      var urls = json && json.data && Array.isArray(json.data.stream_urls)
        ? json.data.stream_urls.filter(function(u) { return /^https?:\/\//i.test(clean(u)); })
        : [];
      var subtitles = normalizeSubs(json);
      return Promise.all(urls.map(function(url, index) {
        return probe(url, index, subtitles);
      }));
    })
    .then(function(rows) {
      var out = [], seen = {};
      (rows || []).forEach(function(x) {
        if (!x || !x.url || seen[x.url]) return;
        seen[x.url] = 1;
        out.push(x);
      });
      console.log("[NoctraTV/VidAPI] streams=" + out.length);
      return out;
    })
    .catch(function(e) {
      console.error("[NoctraTV/VidAPI] " + (e && e.message ? e.message : e));
      return [];
    });
}

module.exports = {
  getStreams: getStreams,
  maxHlsQuality: maxHlsQuality,
  apiUrl: apiUrl
};

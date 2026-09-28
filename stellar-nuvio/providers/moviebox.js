// Stellar · MovieBox — Nuvio local scraper
// Token/search/source extraction and media playback all originate from the device.

var API = "https://h5-api.aoneroom.com";
var TMDB_BASE = "https://api.themoviedb.org/3";
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";
var REQUEST_ORIGIN = "https://videodownloader.site";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v) { return v == null ? "" : String(v).trim(); }

function normTitle(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function unwrap(obj) {
  if (!obj || typeof obj !== "object") return {};
  if (obj.data && obj.data.data) return obj.data.data;
  if (obj.data) return obj.data;
  return obj;
}

function reqJson(url, opt) {
  return fetch(url, opt || {}).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}

function tmdbInfo(tmdbId, mediaType) {
  var t = mediaType === "tv" ? "tv" : "movie";
  var u = TMDB_BASE + "/" + t + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(TMDB_KEY);
  return reqJson(u, { headers: { "Accept": "application/json", "User-Agent": UA } })
    .then(function(d) {
      var date = clean(t === "tv" ? d.first_air_date : d.release_date);
      return {
        title: clean(t === "tv" ? d.name : d.title),
        year: date ? date.slice(0, 4) : ""
      };
    });
}

function getToken() {
  return fetch(API + "/wefeed-h5api-bff/app/get-latest-app-pkgs?app_name=moviebox", {
    headers: { "User-Agent": UA }
  }).then(function(r) {
    if (!r.ok) throw new Error("token HTTP " + r.status);
    var raw = "";
    try { raw = r.headers.get("x-user") || r.headers.get("X-User") || ""; } catch (_) {}
    var data = {};
    try { data = JSON.parse(raw); } catch (_) {}
    var token = clean(data && data.token);
    if (!token) throw new Error("token missing");
    return token;
  });
}

function baseHeaders(token) {
  return {
    "X-Client-Info": "{\"timezone\":\"Africa/Nairobi\"}",
    "x-request-lang": "en",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": REQUEST_ORIGIN,
    "Referer": REQUEST_ORIGIN + "/",
    "Authorization": "Bearer " + token,
    "User-Agent": UA
  };
}

function chooseItem(items, title, year) {
  if (!Array.isArray(items) || !items.length) return null;
  var want = normTitle(title);
  var exact = items.filter(function(it) {
    return normTitle(it && (it.title || it.name)) === want;
  });
  if (year) {
    var y = exact.filter(function(it) {
      return clean(it && (it.releaseDate || it.release_date)).slice(0, 4) === String(year);
    });
    if (y.length) return y[0];
  }
  if (exact.length) return exact[0];
  return items[0];
}

function qNum(q) {
  var s = clean(q);
  var m = s.match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function normalize(data, label) {
  var d = unwrap(data);
  var list = label === "Play"
    ? (Array.isArray(d.streams) ? d.streams : [])
    : (Array.isArray(d.downloads) ? d.downloads : []);
  var out = [];
  list.forEach(function(x) {
    if (!x || x.vipLocked) return;
    var url = clean(x.url);
    if (!/^https?:\/\//i.test(url)) return;
    var q = clean(x.resolution || x.resolutions) || "Auto";
    out.push({
      name: "Stellar · MovieBox",
      title: "MovieBox · " + label + " · " + q,
      url: url,
      quality: qNum(q) ? qNum(q) + "p" : "Auto",
      provider: "stellar-moviebox",
      headers: {
        "User-Agent": "ExoPlayerLib/2.19.1",
        "Referer": "https://www.movieboxpro.app/"
      },
      subtitles: []
    });
  });
  return out;
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Stellar/MovieBox] " + mediaType + " " + tmdbId);

  var meta = null;
  var token = "";
  var headers = null;
  var item = null;

  return tmdbInfo(tmdbId, mediaType)
    .then(function(m) {
      meta = m;
      if (!meta.title) throw new Error("TMDB title missing");
      return getToken();
    })
    .then(function(t) {
      token = t;
      headers = baseHeaders(token);
      return reqJson(API + "/wefeed-h5api-bff/subject/search", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          keyword: meta.title,
          page: 1,
          perPage: 24,
          subjectType: mediaType === "tv" ? 2 : 1
        })
      });
    })
    .then(function(search) {
      item = chooseItem(unwrap(search).items || [], meta.title, meta.year);
      var sid = item && (item.id || item.subjectId);
      if (!sid) throw new Error("subject missing");

      var detailPath = clean(item.detailPath);
      var qs = "subjectId=" + encodeURIComponent(String(sid)) +
        "&se=" + encodeURIComponent(String(mediaType === "tv" ? (season || 1) : 0)) +
        "&ep=" + encodeURIComponent(String(mediaType === "tv" ? (episode || 1) : 0));
      if (detailPath) qs += "&detailPath=" + encodeURIComponent(detailPath);

      return Promise.all([
        reqJson(API + "/wefeed-h5api-bff/subject/play?" + qs, { headers: headers })
          .then(function(d) { return normalize(d, "Play"); })
          .catch(function(e) {
            console.log("[Stellar/MovieBox] play " + (e && e.message ? e.message : e));
            return [];
          }),
        reqJson(API + "/wefeed-h5api-bff/subject/download?" + qs, { headers: headers })
          .then(function(d) { return normalize(d, "Download"); })
          .catch(function(e) {
            console.log("[Stellar/MovieBox] download " + (e && e.message ? e.message : e));
            return [];
          })
      ]);
    })
    .then(function(groups) {
      var out = [], seen = {};
      (groups || []).forEach(function(g) {
        (g || []).forEach(function(x) {
          if (!x || !x.url || seen[x.url]) return;
          seen[x.url] = 1;
          out.push(x);
        });
      });
      out.sort(function(a, b) {
        return qNum(b.quality) - qNum(a.quality);
      });
      console.log("[Stellar/MovieBox] streams=" + out.length);
      return out;
    })
    .catch(function(e) {
      console.error("[Stellar/MovieBox] " + (e && e.message ? e.message : e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

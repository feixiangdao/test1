// Stellar · MovieBox — Nuvio local scraper v1.1
// Current MovieBox mobile protocol: signed API -> play-info/v2 -> signCookie -> DASH manifest.
// Designed for Nuvio's local QuickJS runtime (CryptoJS MD5/HmacMD5 are provided by Nuvio).

var CryptoJS = require("crypto-js");

var TMDB_BASE = "https://api.themoviedb.org/3";
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";
var HOSTS = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
  "https://api6sg.aoneroom.com",
  "https://api.inmoviebox.com"
];

var SECRET_HEX = "efa891974eecd3148df63aa611602defd101259ba521022c57ae0566bd8e";
var SECRET = CryptoJS.enc.Hex.parse(SECRET_HEX);
var MOBILE_UA = "com.community.oneroom/50020121 (Linux; U; Android 13; en_US; 2201117TG; Build/TQ2A.230405.003; Cronet/135.0.7012.3)";
var STREAM_REFERER = "https://sportslive.wine";

var CLIENT_INFO = JSON.stringify({
  package_name: "com.community.oneroom",
  version_name: "4.0.01.0813.03",
  version_code: 50020121,
  os: "android",
  os_version: "13",
  install_ch: "ps",
  device_id: "0123456789abcdef0123456789abcdef",
  install_store: "ps",
  gaid: "12345678-1234-4234-8234-123456789abc",
  brand: "Redmi",
  model: "2201117TG",
  system_language: "en",
  net: "NETWORK_WIFI",
  region: "US",
  timezone: "America/New_York",
  sp_code: "40401",
  "X-Play-Mode": "2"
});

function clean(v) {
  return v == null ? "" : String(v).trim();
}

function normTitle(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function unwrap(obj) {
  if (!obj || typeof obj !== "object") return {};
  if (obj.data && typeof obj.data === "object") return obj.data;
  return obj;
}

function md5Hex(value) {
  return CryptoJS.MD5(String(value)).toString(CryptoJS.enc.Hex);
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function canonicalQuery(url) {
  var q = String(url || "").split("?")[1] || "";
  if (!q) return "";
  var pairs = q.split("&").filter(Boolean).map(function(piece) {
    var at = piece.indexOf("=");
    var k = at >= 0 ? piece.slice(0, at) : piece;
    var v = at >= 0 ? piece.slice(at + 1) : "";
    try { k = decodeURIComponent(k); } catch (_) {}
    try { v = decodeURIComponent(v); } catch (_) {}
    return [k, v];
  });
  pairs.sort(function(a, b) {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });
  return pairs.map(function(p) { return p[0] + "=" + p[1]; }).join("&");
}

function pathOf(url) {
  var s = String(url || "");
  var scheme = s.indexOf("://");
  var start = scheme >= 0 ? s.indexOf("/", scheme + 3) : 0;
  if (start < 0) return "/";
  return s.slice(start).split("?")[0] || "/";
}

function buildSignedHeaders(method, url, body, token) {
  var ts = Date.now();
  var query = canonicalQuery(url);
  var canonicalUrl = pathOf(url) + (query ? "?" + query : "");
  var hasBody = body !== undefined && body !== null;
  var bodyString = hasBody ? String(body) : "";
  var bodyLength = hasBody ? String(utf8ByteLength(bodyString)) : "";
  var bodyHash = hasBody ? CryptoJS.MD5(bodyString).toString(CryptoJS.enc.Hex) : "";

  var canonical = [
    String(method || "GET").toUpperCase(),
    "application/json",
    "application/json",
    bodyLength,
    String(ts),
    bodyHash,
    canonicalUrl
  ].join("\n");

  var sig = CryptoJS.HmacMD5(canonical, SECRET).toString(CryptoJS.enc.Base64);
  var reversedTs = String(ts).split("").reverse().join("");

  var headers = {
    "User-Agent": MOBILE_UA,
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Connection": "keep-alive",
    "x-client-token": String(ts) + "," + md5Hex(reversedTs),
    "x-tr-signature": String(ts) + "|2|" + sig,
    "x-client-info": CLIENT_INFO,
    "x-client-status": "0",
    "x-forwarded-for": "49.36.77.88"
  };
  if (token) headers.Authorization = "Bearer " + token;
  return headers;
}

function mobileRequest(method, path, bodyObj, token) {
  var body = bodyObj === undefined || bodyObj === null ? null : JSON.stringify(bodyObj);
  var index = 0;

  function next(lastError) {
    if (index >= HOSTS.length) {
      return Promise.reject(lastError || new Error("MovieBox hosts exhausted"));
    }
    var base = HOSTS[index++];
    var url = base + path;
    var options = {
      method: method,
      headers: buildSignedHeaders(method, url, body, token)
    };
    if (body !== null) options.body = body;

    return fetch(url, options).then(function(r) {
      if (!r.ok) {
        throw new Error("HTTP " + r.status + " @ " + base);
      }
      return r.json().then(function(j) {
        if (!j) throw new Error("empty JSON @ " + base);
        return { base: base, data: unwrap(j), raw: j };
      });
    }).catch(function(e) {
      return next(e);
    });
  }

  return next(null);
}

function tmdbInfo(tmdbId, mediaType) {
  var t = mediaType === "tv" ? "tv" : "movie";
  var url = TMDB_BASE + "/" + t + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(TMDB_KEY);
  return fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": MOBILE_UA }
  }).then(function(r) {
    if (!r.ok) throw new Error("TMDB HTTP " + r.status);
    return r.json();
  }).then(function(d) {
    var date = clean(t === "tv" ? d.first_air_date : d.release_date);
    return {
      title: clean(t === "tv" ? d.name : d.title),
      year: date ? date.slice(0, 4) : ""
    };
  });
}

function getVisitorToken() {
  return mobileRequest("POST", "/wefeed-mobile-bff/user-api/visitor-login", {}, null)
    .then(function(result) {
      var token = clean(result && result.data && result.data.token);
      if (!token) throw new Error("visitor token missing");
      return token;
    });
}

function collectSubjects(value, out) {
  out = out || [];
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach(function(x) { collectSubjects(x, out); });
    return out;
  }

  var id = value.subjectId != null ? value.subjectId : value.id;
  var title = clean(value.title || value.name);
  if (id != null && title) out.push(value);

  Object.keys(value).forEach(function(k) {
    var v = value[k];
    if (v && typeof v === "object") collectSubjects(v, out);
  });
  return out;
}

function chooseSubject(payload, title, year) {
  var items = collectSubjects(payload, []);
  if (!items.length) return null;
  var want = normTitle(title);

  var exact = items.filter(function(it) {
    return normTitle(it.title || it.name) === want;
  });

  if (year && exact.length) {
    var byYear = exact.filter(function(it) {
      var y = clean(it.releaseDate || it.release_date || it.year || it.releaseInfo);
      return y.indexOf(String(year)) >= 0;
    });
    if (byYear.length) return byYear[0];
  }
  if (exact.length) return exact[0];

  for (var i = 0; i < items.length; i++) {
    var t = normTitle(items[i].title || items[i].name);
    if (t && want && (t.indexOf(want) >= 0 || want.indexOf(t) >= 0)) return items[i];
  }
  return items[0];
}

function decodeBase64Flexible(value, cloudFrontMode) {
  var s = clean(value);
  if (!s) return "";
  if (cloudFrontMode) {
    s = s.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/");
  } else {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
  }
  while (s.length % 4) s += "=";
  try { return atob(s); } catch (_) { return ""; }
}

function trimResource(value) {
  var s = clean(value);
  while (s.endsWith("*")) s = s.slice(0, -1);
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

function resolveManifest(signCookie) {
  var parts = String(signCookie || "").split(";");
  for (var i = 0; i < parts.length; i++) {
    var part = clean(parts[i]);
    var idx = part.indexOf("urlprefix=");
    if (idx >= 0) {
      var token = part.slice(idx + "urlprefix=".length).split(":")[0].trim();
      var decoded = trimResource(decodeBase64Flexible(token, false));
      if (/^https?:\/\//i.test(decoded)) return decoded + "/index.mpd";
    }

    if (part.indexOf("CloudFront-Policy=") === 0) {
      var raw = part.slice("CloudFront-Policy=".length);
      var jsonText = decodeBase64Flexible(raw, true);
      try {
        var policy = JSON.parse(jsonText);
        var resource = trimResource(
          policy && policy.Statement && policy.Statement[0] && policy.Statement[0].Resource
        );
        if (/^https?:\/\//i.test(resource)) return resource + "/index.mpd";
      } catch (_) {}
    }
  }
  return "";
}

function cleanCookie(signCookie) {
  return String(signCookie || "")
    .split(";")
    .map(function(x) { return clean(x); })
    .filter(Boolean)
    .join("; ");
}

function isNoticeUrl(url) {
  var s = clean(url).toLowerCase();
  return s.indexOf("1c7de0bd3393702d9191801f15f88f8d") >= 0 ||
    s.indexOf("9a0461bc39da389663bf3dbb17091d3f") >= 0 ||
    s.indexOf("b164fbfb4347792950bdfbfb563d39d9") >= 0 ||
    s.indexOf("/notice.mp4") >= 0 ||
    s.indexOf("notice") >= 0 ||
    (s.indexOf("macdn.aoneroom.com") >= 0 && s.indexOf("/other/") >= 0);
}

function highestResolution(stream, data) {
  var raw = clean(stream && stream.resolutions) || clean(data && data.displayResolutions) || "1080";
  var nums = raw.split(",").map(function(x) { return parseInt(x, 10) || 0; }).filter(function(n) { return n > 0; });
  nums.sort(function(a, b) { return b - a; });
  return nums.length ? nums[0] + "p" : "Auto";
}

function mobileStreams(subjectId, mediaType, season, episode, token) {
  var path = "/wefeed-mobile-bff/subject-api/play-info/v2?subjectId=" + encodeURIComponent(String(subjectId));
  if (mediaType === "tv") {
    path += "&se=" + encodeURIComponent(String(season || 1)) +
      "&ep=" + encodeURIComponent(String(episode || 1));
  }

  return mobileRequest("GET", path, null, token).then(function(result) {
    var data = result.data || {};
    var streams = Array.isArray(data.streams) ? data.streams : [];
    var out = [];
    var seen = {};

    streams.forEach(function(stream, index) {
      var signCookie = clean(stream && stream.signCookie);
      var manifest = resolveManifest(signCookie);
      var direct = clean(stream && stream.url);

      // Prefer the signed manifest. The raw "url" field may be a dummy/update stream.
      var url = manifest;
      var mode = "Signed DASH";
      if (!url && /^https?:\/\//i.test(direct) && !isNoticeUrl(direct)) {
        // Keep a conservative fallback only when the mobile API truly gives no signed policy.
        url = direct;
        mode = "Direct";
      }
      if (!url) return;

      var cookie = cleanCookie(signCookie);
      var key = url + "|" + cookie;
      if (seen[key]) return;
      seen[key] = 1;

      var q = highestResolution(stream, data);
      var codec = clean(stream.codecName || stream.codec || stream.format);
      var label = "MovieBox · " + mode + " · " + q + (codec ? " · " + codec.toUpperCase() : "");

      var headers = {
        "Referer": STREAM_REFERER,
        "User-Agent": MOBILE_UA
      };
      if (cookie) headers.Cookie = cookie;

      out.push({
        // Nuvio local runtime displays name before title, so keep the full label here.
        name: label,
        title: label,
        url: url,
        quality: q,
        provider: "stellar-moviebox",
        type: manifest ? "dash" : "direct",
        headers: headers,
        subtitles: []
      });
    });

    console.log("[Stellar/MovieBox] signed streams=" + out.length);
    return out;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Stellar/MovieBox] mobile " + mediaType + " " + tmdbId);

  var meta = null;
  var token = "";

  return tmdbInfo(tmdbId, mediaType)
    .then(function(m) {
      meta = m;
      if (!meta.title) throw new Error("TMDB title missing");
      return getVisitorToken();
    })
    .then(function(t) {
      token = t;
      return mobileRequest("POST", "/wefeed-mobile-bff/subject-api/search/v2", {
        keyword: meta.title,
        page: 1,
        perPage: 15,
        subjectType: 0
      }, token);
    })
    .then(function(result) {
      var hit = chooseSubject(result.data, meta.title, meta.year);
      if (!hit) throw new Error("MovieBox subject missing");
      var subjectId = hit.subjectId != null ? hit.subjectId : hit.id;
      if (subjectId == null) throw new Error("MovieBox subject id missing");
      return mobileStreams(String(subjectId), mediaType, season, episode, token);
    })
    .catch(function(e) {
      console.error("[Stellar/MovieBox] " + (e && e.message ? e.message : e));
      return [];
    });
}

module.exports = {
  getStreams: getStreams,
  resolveManifest: resolveManifest,
  buildSignedHeaders: buildSignedHeaders,
  chooseSubject: chooseSubject
};

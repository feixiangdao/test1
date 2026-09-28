// Stellar · MovieBox — Nuvio local scraper v1.2
// MovieBox v4.0.02: anonymous bootstrap -> signed search -> play-info -> signCookie -> real DASH.
// The raw MP4 field can be an anti-scraper dummy and is intentionally ignored.

var CryptoJS = require("crypto-js");

var BASE = "https://apig.inmoviebox.com";
var API_HOST = "apig.inmoviebox.com";
var BOOTSTRAP_HOST = "api.inmoviebox.com";
var TMDB_BASE = "https://api.themoviedb.org/3";
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";

var GATEWAY_SECRET = CryptoJS.enc.Base64.parse("76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O");
var API_UA = "MovieBox/4.0.02 (Android 14; Pixel 6)";
var PLAYER_UA = "ExoPlayerLib/2.19.1";
var PLAYER_REFERER = "https://www.movieboxpro.app/";

var CLIENT_INFO = JSON.stringify({
  package_name: "com.community.oneroom",
  version_name: "4.0.02",
  version_code: 50020126,
  os: "android",
  os_version: "14",
  install_ch: "ps",
  device_id: "868203051234567",
  install_store: "ps",
  gaid: "",
  brand: "Google",
  model: "Pixel 6",
  system_language: "en",
  net: "wifi",
  region: "IN",
  timezone: "Asia/Kolkata",
  sp_code: "404"
});

var sessionToken = "";

function clean(v) {
  return v == null ? "" : String(v).trim();
}

function md5Hex(value) {
  return CryptoJS.MD5(String(value || "")).toString(CryptoJS.enc.Hex);
}

function queryPairs(params) {
  var rows = [];
  Object.keys(params || {}).forEach(function(k) {
    rows.push([String(k), String(params[k])]);
  });
  rows.sort(function(a, b) {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });
  return rows;
}

function canonicalResource(path, params) {
  var rows = queryPairs(params);
  return path + (rows.length
    ? "?" + rows.map(function(p) { return p[0] + "=" + p[1]; }).join("&")
    : "");
}

function requestUrl(path, params) {
  var rows = Object.keys(params || {}).map(function(k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k]));
  });
  return BASE + path + (rows.length ? "?" + rows.join("&") : "");
}

function buildSignedHeaders(method, path, params, body, token, fixedTimestamp) {
  var ts = fixedTimestamp != null ? Number(fixedTimestamp) : Date.now();
  var hasBody = body !== undefined && body !== null && String(body).length > 0;
  var bodyString = hasBody ? String(body) : "";

  // Official gateway signs character length and MD5 of the first 0x19000 characters.
  var bodyLength = hasBody ? String(bodyString.length) : "";
  var bodyHash = hasBody
    ? CryptoJS.MD5(bodyString.slice(0, 0x19000)).toString(CryptoJS.enc.Hex)
    : "";

  var canonical = [
    String(method || "GET").toUpperCase(),
    "application/json",
    "application/json;charset=UTF-8",
    bodyLength,
    String(ts),
    bodyHash,
    canonicalResource(path, params)
  ].join("\n");

  var sig = CryptoJS.HmacMD5(canonical, GATEWAY_SECRET).toString(CryptoJS.enc.Base64);
  var reversedTs = String(ts).split("").reverse().join("");

  var headers = {
    "User-Agent": API_UA,
    "Accept": "application/json",
    "Content-Type": "application/json;charset=UTF-8",
    "Connection": "Keep-Alive",
    "X-M-Version": "4.0.02",
    "Referer": BASE + "/",
    "X-Sign-Version": "2.0",
    "X-Client-Token": String(ts) + "," + md5Hex(reversedTs),
    "X-Client-Info": CLIENT_INFO,
    "X-Client-Status": token ? "0" : "1",
    "X-Play-Mode": "2",
    "appid": "4U01pxRu278GqCZKY9",
    "region": "IN",
    "lang": "en",
    "os": "android",
    "X-Timestamp": String(ts),
    "x-tr-signature": String(ts) + "|2|" + sig
  };

  if (token) headers.Authorization = "Bearer " + token;
  if (hasBody) headers["Content-Length"] = bodyLength;
  return headers;
}

function updateSessionFromResponse(response) {
  try {
    var raw = response && response.headers &&
      (response.headers.get("x-user") || response.headers.get("X-User"));
    if (!raw) return;
    var data = JSON.parse(raw);
    var token = clean(data && data.token);
    if (token) sessionToken = token;
  } catch (_) {}
}

function signedRequest(method, path, params, bodyObj, tokenOverride) {
  var p = {};
  Object.keys(params || {}).forEach(function(k) { p[k] = params[k]; });
  if (!Object.prototype.hasOwnProperty.call(p, "host")) p.host = API_HOST;

  var body = bodyObj === undefined || bodyObj === null ? null : JSON.stringify(bodyObj);
  var token = tokenOverride === undefined ? sessionToken : clean(tokenOverride);
  var url = requestUrl(path, p);
  var options = {
    method: method,
    headers: buildSignedHeaders(method, path, p, body, token)
  };
  if (body !== null) options.body = body;

  return fetch(url, options).then(function(r) {
    updateSessionFromResponse(r);
    return r.text().then(function(text) {
      var data = null;
      try { data = JSON.parse(text); } catch (_) {}
      if (!r.ok) throw new Error("MovieBox HTTP " + r.status);
      if (!data || typeof data !== "object") throw new Error("MovieBox invalid JSON");
      if (data.code != null && Number(data.code) !== 0 && Number(data.code) !== 200) {
        throw new Error("MovieBox code " + data.code + " " + clean(data.message || data.msg));
      }
      return data.data && typeof data.data === "object" ? data.data : data;
    });
  });
}

function bootstrap() {
  sessionToken = "";
  return signedRequest(
    "GET",
    "/wefeed-mobile-bff/tab-operating",
    { host: BOOTSTRAP_HOST, page: 1, pageSize: 24, tabId: 1 },
    null,
    ""
  ).then(function() {
    if (!sessionToken) throw new Error("MovieBox bootstrap token missing");
    return sessionToken;
  });
}

function tmdbInfo(tmdbId, mediaType) {
  var t = mediaType === "tv" ? "tv" : "movie";
  var url = TMDB_BASE + "/" + t + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(TMDB_KEY) + "&language=en-US";

  return fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": API_UA }
  }).then(function(r) {
    if (!r.ok) throw new Error("TMDB HTTP " + r.status);
    return r.json();
  }).then(function(d) {
    var date = clean(t === "tv" ? d.first_air_date : d.release_date);
    return {
      title: clean(t === "tv" ? d.name : d.title),
      originalTitle: clean(t === "tv" ? d.original_name : d.original_title),
      year: date ? date.slice(0, 4) : "",
      mediaType: t
    };
  });
}

function normTitle(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function looseTitle(v) {
  return clean(v)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");
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

function subjectYear(item) {
  var raw = clean(item && (item.releaseDate || item.release_date || item.year || item.releaseInfo));
  var m = raw.match(/(19|20)\d{2}/);
  return m ? m[0] : "";
}

function chooseSubject(payload, meta) {
  var items = collectSubjects(payload, []);
  if (!items.length) return null;

  var want = normTitle(meta.title);
  var original = normTitle(meta.originalTitle);
  var looseWant = looseTitle(meta.title);
  var looseOriginal = looseTitle(meta.originalTitle);
  var year = String(meta.year || "");
  var wantedType = meta.mediaType === "tv" ? 2 : 1;

  function titleMatches(it) {
    var n = normTitle(it && (it.title || it.name));
    return n && (n === want || (original && n === original));
  }

  function looseMatches(it) {
    var n = looseTitle(it && (it.title || it.name));
    return n && (n === looseWant || (looseOriginal && n === looseOriginal));
  }
  function typeMatches(it) {
    var st = Number(it && it.subjectType);
    return !st || st === wantedType;
  }

  var exactYear = items.find(function(it) {
    return typeMatches(it) && titleMatches(it) && (!year || subjectYear(it) === year);
  });
  if (exactYear) return exactYear;

  var exact = items.find(function(it) {
    return typeMatches(it) && titleMatches(it);
  });
  if (exact) return exact;

  var markedYear = items.find(function(it) {
    return typeMatches(it) && looseMatches(it) && (!year || subjectYear(it) === year);
  });
  if (markedYear) return markedYear;

  var containsYear = items.find(function(it) {
    if (!typeMatches(it)) return false;
    var n = normTitle(it && (it.title || it.name));
    var loose = n && want && (n.indexOf(want) >= 0 || want.indexOf(n) >= 0);
    return loose && (!year || subjectYear(it) === year);
  });
  if (containsYear) return containsYear;

  return items.find(typeMatches) || items[0];
}

function searchSubject(meta) {
  return signedRequest("POST", "/wefeed-mobile-bff/subject-api/search", {}, {
    keyword: meta.title,
    q: meta.title,
    page: 1,
    pageSize: 20,
    type: 0
  }).then(function(data) {
    var hit = chooseSubject(data, meta);
    if (!hit) throw new Error("MovieBox subject missing");
    return hit;
  });
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

  // Current Edge-Cache-Cookie form.
  for (var i = 0; i < parts.length; i++) {
    var part = clean(parts[i]);
    var idx = part.indexOf("urlprefix=");
    if (idx >= 0) {
      var encoded = part.slice(idx + "urlprefix=".length).split(":")[0].trim();
      var decoded = trimResource(decodeBase64Flexible(encoded, false));
      if (/^https?:\/\//i.test(decoded)) return decoded + "/index.mpd";
    }
  }

  // CloudFront signed policy form.
  for (var j = 0; j < parts.length; j++) {
    var p = clean(parts[j]);
    if (p.indexOf("CloudFront-Policy=") !== 0) continue;

    var raw = p.slice("CloudFront-Policy=".length);
    var text = decodeBase64Flexible(raw, true);
    try {
      var policy = JSON.parse(text);
      var resource = trimResource(
        policy && policy.Statement && policy.Statement[0] &&
        policy.Statement[0].Resource
      );
      if (/^https?:\/\//i.test(resource)) return resource + "/index.mpd";
    } catch (_) {}
  }

  return "";
}

function cleanCookie(value) {
  return String(value || "")
    .split(";")
    .map(function(x) { return clean(x); })
    .filter(Boolean)
    .join("; ");
}

function qualityLabel(stream) {
  var raw = clean(stream && (stream.resolutions || stream.resolution));
  if (!raw) return "Auto";
  return raw.split(",").map(function(x) {
    var n = parseInt(x, 10);
    return n > 0 ? n + "p" : clean(x);
  }).filter(Boolean).join("/");
}

function qualityValue(stream) {
  var raw = clean(stream && (stream.resolutions || stream.resolution));
  var nums = raw.split(",").map(function(x) { return parseInt(x, 10) || 0; });
  nums.sort(function(a, b) { return b - a; });
  return nums[0] > 0 ? nums[0] + "p" : "Auto";
}

function playInfo(subjectId, mediaType, season, episode) {
  var params = { subjectId: String(subjectId) };
  if (mediaType === "tv") {
    params.se = Number(season) || 1;
    params.ep = Number(episode) || 1;
  }

  return signedRequest("GET", "/wefeed-mobile-bff/subject-api/play-info", params, null)
    .then(function(data) {
      var rows = Array.isArray(data.streams)
        ? data.streams
        : (Array.isArray(data.streamList) ? data.streamList : []);

      var out = [];
      var seen = {};

      rows.forEach(function(stream) {
        var signCookie = clean(stream && (stream.signCookie || data.signCookie));
        var manifest = resolveManifest(signCookie);

        // Never return the raw MP4 trap. Only expose a manifest proven by signCookie.
        if (!manifest) return;

        var cookie = cleanCookie(signCookie);
        var key = manifest + "|" + cookie;
        if (seen[key]) return;
        seen[key] = 1;

        var codec = clean(stream.codecName || stream.codec || stream.format);
        var qLabel = qualityLabel(stream);
        var label = "MovieBox · Signed DASH · " + qLabel +
          (codec ? " · " + codec.toUpperCase() : "");

        var headers = {
          "Cookie": cookie,
          "Referer": PLAYER_REFERER,
          "User-Agent": PLAYER_UA
        };

        out.push({
          // Nuvio displays "name" as the primary row label.
          name: label,
          title: label,
          url: manifest,
          quality: qualityValue(stream),
          provider: "stellar-moviebox",
          headers: headers,
          subtitles: []
        });
      });

      console.log("[Stellar/MovieBox] signed streams=" + out.length);
      return out;
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[Stellar/MovieBox] v4 " + mediaType + " " + tmdbId);
  var meta = null;

  return tmdbInfo(tmdbId, mediaType)
    .then(function(m) {
      meta = m;
      if (!meta.title) throw new Error("TMDB title missing");
      return bootstrap();
    })
    .then(function() {
      return searchSubject(meta);
    })
    .then(function(hit) {
      var subjectId = hit.subjectId != null ? hit.subjectId : hit.id;
      if (subjectId == null) throw new Error("MovieBox subject id missing");
      return playInfo(String(subjectId), mediaType, season, episode);
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
  chooseSubject: chooseSubject,
  bootstrap: bootstrap
};

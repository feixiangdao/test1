/**
 * mapple - Built from src/mapple/
 * Generated: 2026-09-21T12:38:36.737Z
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/mapple/constants.js
var BASE_URL = "https://mapple.fun";
var SUBTITLE_BASE = "https://sub.wyzie.io";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var TMDB_API_KEY = (typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY) ? globalThis.TMDB_API_KEY : "439c478a771f35c05022f9feabcca01c";
var DEFAULT_USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36";
var API_HEADERS = {
  "User-Agent": DEFAULT_USER_AGENT,
  "Accept": "*/*",
  "Origin": BASE_URL,
  "Referer": `${BASE_URL}/`
};
var PLAYBACK_HEADERS = {
  "Referer": `${BASE_URL}/`,
  "Origin": BASE_URL,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
};

// Flixbaba wrapper metadata. BUILD is surfaced in every diagnostic row so the
// device always tells us which build of the module is actually loaded.
var BUILD = "FB1.3.0";

// Why the last playback session failed. Nuvio cannot show us console output, so
// the reason is carried into the diagnostic row instead.
var SESSION_ERROR = "";

// Nuvio hands us whatever identifier the active catalog uses - often an IMDb id
// (`tt0816692`) even though the parameter is named tmdbId. Mapple's playback API
// needs a numeric media id, so an IMDb id is mapped first.
//
// The mapping uses Stremio's Cinemeta, deliberately NOT api.themoviedb.org:
// that host is DNS/TLS-blocked on many mobile networks, so anything depending on
// it fails before it ever reaches the upstream.
var CINEMETA = [
  "https://v3-cinemeta.strem.io",
  "https://cinemeta-live.strem.io"
];
var WRAPPER_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function resolveTmdbId(rawId, mediaType) {
  var id = rawId == null ? "" : String(rawId).trim();
  if (/^\d+$/.test(id)) return Promise.resolve(id);
  var kind = mediaType === "tv" ? "series" : "movie";
  var index = 0;
  function attempt() {
    if (index >= CINEMETA.length) return Promise.resolve("");
    var base = CINEMETA[index++];
    return fetch(base + "/meta/" + kind + "/" + encodeURIComponent(id) + ".json", {
      headers: { "Accept": "application/json", "User-Agent": WRAPPER_UA }
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (d) {
      var m = d && d.meta;
      if (m && m.moviedb_id) return String(m.moviedb_id);
      return attempt();
    }).catch(function () { return attempt(); });
  }
  return attempt();
}

// Diagnostic row. Nuvio cannot show us console output, so the only reliable way
// to read a failure on-device is to return it as a result row. The URL is
// "about:error" and the quality is "Status", so this can never be played.
function diag(msg) {
  return [{
    name: "Flixbaba · Mapple · " + BUILD + " · " + msg,
    title: "Flixbaba · Mapple · " + BUILD + " · " + msg,
    url: "about:error",
    quality: "Status",
    type: "diagnostic",
    provider: "flixbaba-mapple"
  }];
}
var HOSTERS = [
  { name: "Zeus", key: "mapple" },
  { name: "Poseidon", key: "s25" },
  { name: "Athena", key: "s2" },
  { name: "Hera", key: "s4" },
  { name: "Persephone", key: "s12" },
  { name: "Apollo", key: "s19" },
  { name: "Artemis", key: "s13" },
  { name: "Hermes", key: "s26" },
  { name: "Ares", key: "s24" },
  { name: "Aphrodite", key: "s6" },
  { name: "Hephaestus", key: "s15" },
  { name: "Demeter", key: "s7" },
  { name: "Dionysus", key: "s8" },
  { name: "Hestia", key: "s3" },
  { name: "Hades", key: "s16" },
  { name: "Nike", key: "s5" },
  { name: "Atlas", key: "s1" },
  { name: "Prometheus", key: "s10" }
]

// src/mapple/pow.js
var import_crypto_js = __toESM(require("crypto-js"));
var nodeCrypto = null;
try {
  const req = require;
  nodeCrypto = req("crypto");
} catch (e) {
}
function countLeadingZeroBitsBytes(bytes) {
  let count = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0) {
      count += 8;
    } else {
      for (let bit = 7; bit >= 0; bit--) {
        if ((b & 1 << bit) !== 0)
          return count;
        count++;
      }
    }
  }
  return count;
}
function countLeadingZeroBitsWords(words) {
  let count = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i] >>> 0;
    const lz = Math.clz32(w);
    count += lz;
    if (lz < 32)
      break;
  }
  return count;
}
function solvePow(challenge, difficulty) {
  const maxAttempts = 5e7;
  let nonce = 0;
  if (nodeCrypto && typeof nodeCrypto.createHash === "function") {
    while (nonce < maxAttempts) {
      const hash = nodeCrypto.createHash("sha256").update(challenge + nonce).digest();
      if (countLeadingZeroBitsBytes(hash) >= difficulty) {
        return nonce.toString();
      }
      nonce++;
    }
  } else {
    while (nonce < maxAttempts) {
      const hash = import_crypto_js.default.SHA256(challenge + nonce);
      if (countLeadingZeroBitsWords(hash.words) >= difficulty) {
        return nonce.toString();
      }
      nonce++;
    }
  }
  throw new Error(`PoW solve exceeded max attempts (difficulty=${difficulty})`);
}

// src/mapple/utils.js
var CookieJar = class {
  constructor() {
    this.cookies = /* @__PURE__ */ new Map();
  }
  update(res) {
    if (!res || !res.headers)
      return;
    let rawCookies = [];
    if (typeof res.headers.getSetCookie === "function") {
      rawCookies = res.headers.getSetCookie();
    } else if (res.headers.get) {
      const h = res.headers.get("set-cookie");
      if (h)
        rawCookies = [h];
    }
    for (const c of rawCookies) {
      const pair = String(c || "").split(";", 1)[0];
      const eq = pair.indexOf("=");
      if (eq <= 0)
        continue;
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (/max-age\s*=\s*0/i.test(String(c)) || !v) {
        this.cookies.delete(k);
      } else {
        this.cookies.set(k, v);
      }
    }
  }
  getCookieString() {
    const list = [];
    for (const [k, v] of this.cookies.entries()) {
      list.push(`${k}=${v}`);
    }
    return list.join("; ");
  }
};
function fetchMediaDetails(rawId, mediaType) {
  return __async(this, null, function* () {
    const id = String(rawId == null ? "" : rawId).trim();
    try {
      // Cinemeta is keyed by IMDb id; a numeric TMDB id cannot be looked up here.
      // This replaces the previous api.themoviedb.org call, which is unreachable
      // on many mobile networks and only ever supplied a display title anyway.
      if (/^tt\d+$/i.test(id)) {
        const kind = mediaType === "tv" ? "series" : "movie";
        for (const base of CINEMETA) {
          const res = yield fetch(`${base}/meta/${kind}/${encodeURIComponent(id)}.json`, {
            headers: { "User-Agent": WRAPPER_UA, "Accept": "application/json" }
          });
          if (!res.ok)
            continue;
          const data = yield res.json();
          const meta = data == null ? void 0 : data.meta;
          if (meta && meta.name) {
            return {
              title: meta.name,
              year: String(meta.year || "").slice(0, 4),
              imdbId: id,
              mediaType
            };
          }
        }
      }
      return {
        title: id || "Unknown",
        year: "",
        imdbId: /^tt\d+$/i.test(id) ? id : null,
        mediaType
      };
    } catch (e) {
      return { title: id, year: "", imdbId: null, mediaType };
    }
  });
}
function fetchSubtitles() {
  // Wyzie currently returns 401 for this integration; avoid an unnecessary failed request.
  return Promise.resolve([]);
}
function parseHlsMaster(masterUrl, hosterName, mediaTitle, playbackHeaders) {
  return __async(this, null, function* () {
    try {
      const res = yield fetch(masterUrl, { headers: playbackHeaders });
      if (!res.ok)
        return null;
      const text = yield res.text();
      if (!text.includes("#EXT-X-STREAM-INF"))
        return null;
      const lines = text.split("\n");
      const streams = [];
      let currentQuality = "Unknown";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("#EXT-X-STREAM-INF")) {
          const resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
          if (resMatch) {
            currentQuality = resMatch[1] + "p";
          }
        } else if (line && !line.startsWith("#")) {
          const streamUrl = line.startsWith("http") ? line : new URL(line, masterUrl).href;
          streams.push({
            name: `Mapple [${hosterName}] - ${currentQuality}`,
            title: mediaTitle,
            url: streamUrl,
            quality: currentQuality,
            size: "Unknown",
            headers: playbackHeaders,
            provider: "flixbaba-mapple"
          });
          currentQuality = "Unknown";
        }
      }
      return streams.length > 0 ? streams : null;
    } catch (e) {
      return null;
    }
  });
}

// src/mapple/index.js
function getPlaybackSession(tmdbId, mediaType, tvSlug, mediaReferer, cookieJar) {
  return __async(this, null, function* () {
    const initRes = yield fetch(`${BASE_URL}/`, {
      headers: {
        "User-Agent": API_HEADERS["User-Agent"],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    cookieJar.update(initRes);
    const tokenRes = yield fetch(`${BASE_URL}/api/request-token`, {
      method: "POST",
      headers: __spreadProps(__spreadValues({}, API_HEADERS), {
        "Referer": mediaReferer,
        "Content-Type": "application/json",
        "Cookie": cookieJar.getCookieString()
      }),
      body: ""
    });
    cookieJar.update(tokenRes);
    console.log("[Flixbaba/Mapple] token status=" + tokenRes.status + " cookie=" + (cookieJar.getCookieString() ? "yes" : "no"));
    if (!tokenRes.ok) {
      // A 403 here is normally the upstream Cloudflare challenge, which a
      // non-browser fetch cannot solve. It is egress dependent: some networks
      // pass, some (data-centre / proxied exits) do not.
      SESSION_ERROR = "request-token HTTP " + tokenRes.status;
      return null;
    }
    const tokenData = yield tokenRes.json();
    const requestToken = tokenData == null ? void 0 : tokenData.token;
    if (!requestToken) {
      SESSION_ERROR = "request-token returned no token";
      return null;
    }
    const initPayload = {
      mediaId: Number(tmdbId),
      mediaType,
      tv_slug: tvSlug,
      requestToken
    };
    const playbackRes = yield fetch(`${BASE_URL}/api/playback-init`, {
      method: "POST",
      headers: __spreadProps(__spreadValues({}, API_HEADERS), {
        "Referer": mediaReferer,
        "Content-Type": "application/json",
        "Cookie": cookieJar.getCookieString()
      }),
      body: JSON.stringify(initPayload)
    });
    cookieJar.update(playbackRes);
    if (!playbackRes.ok) {
      console.log("[Flixbaba/Mapple] init status=" + playbackRes.status);
      SESSION_ERROR = "playback-init HTTP " + playbackRes.status;
      return null;
    }
    const initData = yield playbackRes.json();
    console.log("[Flixbaba/Mapple] init success=" + !!initData.success + " pow=" + !!initData.requiresPow + " token=" + !!initData.token);
    let playbackToken = null;
    if (initData.success && initData.token) {
      playbackToken = initData.token;
    } else if (initData.requiresPow && initData.pow) {
      const nonce = solvePow(initData.pow.challenge, initData.pow.difficulty);
      const powRes = yield fetch(`${BASE_URL}/api/playback-init`, {
        method: "POST",
        headers: __spreadProps(__spreadValues({}, API_HEADERS), {
          "Referer": mediaReferer,
          "Content-Type": "application/json",
          "Cookie": cookieJar.getCookieString()
        }),
        body: JSON.stringify(__spreadProps(__spreadValues({}, initPayload), {
          pow: {
            challengeId: initData.pow.challengeId,
            nonce
          }
        }))
      });
      cookieJar.update(powRes);
      if (powRes.ok) {
        const powData = yield powRes.json();
        playbackToken = powData == null ? void 0 : powData.token;
        console.log("[Flixbaba/Mapple] pow status=" + powRes.status + " token=" + !!playbackToken);
      } else {
        console.log("[Flixbaba/Mapple] pow status=" + powRes.status);
      }
    }
    if (!playbackToken)
      return null;
    return { requestToken, playbackToken };
  });
}
function extractHosterStream(hoster, tmdbId, mediaType, tvSlug, mediaReferer, session, cookieJar, mediaTitle, subtitles) {
  return __async(this, null, function* () {
    var _a;
    try {
      const encRes = yield fetch(`${BASE_URL}/api/encrypt`, {
        method: "POST",
        headers: __spreadProps(__spreadValues({}, API_HEADERS), {
          "Referer": mediaReferer,
          "Content-Type": "application/json",
          "Cookie": cookieJar.getCookieString()
        }),
        body: JSON.stringify({
          data: {
            mediaId: Number(tmdbId),
            mediaType,
            tv_slug: tvSlug,
            source: hoster.key
          },
          endpoint: "stream-encrypted",
          requestToken: session.requestToken
        })
      });
      if (!encRes.ok) {
        console.log("[Flixbaba/Mapple] " + hoster.name + " encrypt status=" + encRes.status);
        return [];
      }
      const encData = yield encRes.json();
      if (!(encData == null ? void 0 : encData.url)) {
        console.log("[Flixbaba/Mapple] " + hoster.name + " encrypt path=no");
        return [];
      }
      const streamEndpoint = `${BASE_URL}${encData.url}&requestToken=${encodeURIComponent(session.requestToken)}&token=${encodeURIComponent(session.playbackToken)}`;
      const streamRes = yield fetch(streamEndpoint, {
        headers: __spreadProps(__spreadValues({}, API_HEADERS), {
          "Referer": mediaReferer,
          "Cookie": cookieJar.getCookieString()
        })
      });
      if (!streamRes.ok) {
        console.log("[Flixbaba/Mapple] " + hoster.name + " stream status=" + streamRes.status);
        return [];
      }
      const streamData = yield streamRes.json();
      console.log("[Flixbaba/Mapple] " + hoster.name + " stream success=" + !!(streamData && streamData.success) + " url=" + !!(streamData && streamData.data && streamData.data.stream_url));
      const streamUrl = (_a = streamData == null ? void 0 : streamData.data) == null ? void 0 : _a.stream_url;
      if (!(streamData == null ? void 0 : streamData.success) || !streamUrl || streamUrl.includes("playback-unavailable")) {
        return [];
      }
      const streams = [];
      const parsedStreams = yield parseHlsMaster(streamUrl, hoster.name, mediaTitle, PLAYBACK_HEADERS);
      if (parsedStreams && parsedStreams.length > 0) {
        parsedStreams.forEach((s) => {
          s.subtitles = subtitles;
          streams.push(s);
        });
      }
      streams.push({
        name: `Mapple [${hoster.name}] - Auto`,
        title: mediaTitle,
        url: streamUrl,
        quality: "Auto",
        size: "Unknown",
        headers: PLAYBACK_HEADERS,
        provider: "flixbaba-mapple",
        subtitles
      });
      return streams;
    } catch (e) {
      return [];
    }
  });
}
function getStreams(tmdbId, mediaType, seasonNum = null, episodeNum = null) {
  // Offline guard: never touch the network without a usable identifier.
  if (!tmdbId) return Promise.resolve([]);
  if (mediaType !== "movie" && mediaType !== "tv") return Promise.resolve([]);
  if (mediaType === "tv" && (!seasonNum || !episodeNum)) return Promise.resolve([]);
  const rawId = String(tmdbId).trim();
  console.log("[Flixbaba/Mapple] " + BUILD + " id=" + rawId + " type=" + mediaType);
  return resolveTmdbId(rawId, mediaType).then((resolved) => {
    if (!resolved)
      return diag("cannot map " + rawId + " to a TMDB id");
    // Everything below talks to Mapple, which needs a numeric media id.
    tmdbId = Number(resolved);
    return __async(this, null, function* () {
    const type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
    const s = seasonNum ? Number(seasonNum) : 1;
    const e = episodeNum ? Number(episodeNum) : 1;
    const tvSlug = type === "tv" ? `${s}-${e}` : "";
    const mediaReferer = type === "tv" ? `${BASE_URL}/tv/${tmdbId}/${s}/${e}` : `${BASE_URL}/movie/${tmdbId}`;
    const [mediaDetails, subtitles] = yield Promise.all([
      fetchMediaDetails(rawId, type),
      fetchSubtitles(tmdbId, type, s, e)
    ]);
    let mediaTitle = mediaDetails.title || `TMDB ${tmdbId}`;
    if (mediaDetails.year) {
      mediaTitle += ` (${mediaDetails.year})`;
    }
    if (type === "tv") {
      mediaTitle += ` S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
    }
    const cookieJar = new CookieJar();
    SESSION_ERROR = "";
    const session = yield getPlaybackSession(tmdbId, type, tvSlug, mediaReferer, cookieJar);
    if (!session)
      return diag("session failed · " + (SESSION_ERROR || "unknown"));
    const allStreams = [];
    var successfulHosters = 0;
    for (const hoster of HOSTERS) {
      const rows = yield extractHosterStream(hoster, tmdbId, type, tvSlug, mediaReferer, session, cookieJar, mediaTitle, subtitles);
      if (rows && rows.length) {
        allStreams.push(...rows);
        successfulHosters++;
        // Mapple currently behaves better with sequential requests on one playback session.
        // Two working mirrors are enough; avoid hammering all 18 hosters and reduce latency.
        if (successfulHosters >= 2) break;
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const uniqueStreams = [];
    allStreams.forEach((stream) => {
      if (!seen.has(stream.url)) {
        seen.add(stream.url);
        uniqueStreams.push(stream);
      }
    });
    const qualityRank = {
      "auto": 4e3,
      "adaptive": 4e3,
      "2160p": 2160,
      "4k": 2160,
      "1080p": 1080,
      "720p": 720,
      "480p": 480,
      "360p": 360,
      "240p": 240,
      "unknown": 0
    };
    uniqueStreams.sort((a, b) => {
      var _a, _b;
      const qa = qualityRank[(_a = a.quality) == null ? void 0 : _a.toLowerCase()] || 0;
      const qb = qualityRank[(_b = b.quality) == null ? void 0 : _b.toLowerCase()] || 0;
      return qb - qa;
    });
    console.log("[Flixbaba/Mapple] " + BUILD + " streams=" + uniqueStreams.length);
    if (!uniqueStreams.length)
      return diag("no streams");
    return uniqueStreams;
    });
  }).catch((err) => {
    const message = err && err.message ? err.message : String(err);
    console.error("[Flixbaba/Mapple] " + BUILD + " " + message);
    return diag("error " + message);
  });
}
module.exports = { getStreams };

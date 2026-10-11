// NO视频 (novipnoad.ca) — local direct-stream provider
// ====================================================
//
// NO视频 is a WordPress front end over a Tencent-hosted player. This provider
// talks to that player directly and hands Nuvio a playable MP4/HLS URL; no web
// player, no iframe, no browser session.
//
// RESOLUTION CHAIN (all first-party, no third-party scraper)
// ----------------------------------------------------------
//  1. search     GET /wp-json/wp/v2/posts?search=<title>      (JSON, with link+title)
//                fallback: GET /search/<title>/              (HTML listing)
//  2. detail     GET <detail>  ->  window.playInfo = {vid, pkey}
//                TV pages instead carry per-episode
//                <a class="multilink-btn" data-vid="ali-...">E01</a>
//  3. player     GET https://player.novipnoad.ca/v1/?url=<vid>&pkey=<pkey>&ref=<path>
//                This page server-renders a per-request `params['device']` (24 hex)
//                and an inline WASM blob (atob('...')). The WASM is the auth step:
//                it takes a browser-fingerprint hash and emits
//                <40 hex ckey> + {"ref","ip","time"} into sessionStorage.
//  4. keys       Instead of executing the page, the WASM is decoded here.
//                The server rewrites the module per request: the data segments
//                stay fixed, but one `i32.xor` immediate and the fingerprint
//                hash both change every time. The xor immediate is recovered
//                from the code section, the hash by brute force, and the pair
//                is accepted only when it yields a 40-hex ckey followed by a
//                JSON object carrying ref+ip. See wasmSolve().
//  5. playlist   GET https://player.novipnoad.ca/v1/player.php?id=<vid>&device=<dev>
//                -> const jsapi = 'https://enc-vod.oss-internal.novipnoad.ca/<src>/<id>.js'
//  6. payload    GET <jsapi>?ckey=<CK>&ref=<ref>&ip=<ip>&time=<time>
//                -> var videoUrl = JSON.decrypt("<540 chars>")
//  7. decrypt    base64 -> XOR against a fixed keystream, then un-escape "\/"
//                and JSON.parse. See below.
//
// WHY THE "DECRYPT" IS A FIXED KEYSTREAM
// --------------------------------------
// The payload is base64 of (plaintext XOR stream). The stream depends only on
// the byte offset, not on the session, the title or the source: measured across
// four independent sessions (two ftn-, two ali-) the recovered keystream agreed
// 403/403, 203/203 and 312/312 bytes. The first 403 bytes are embedded below.
//
// One trap cost real time: the decrypted string is JSON in which every "/" is
// written as "\/". JSON.stringify() silently normalises those away, so a
// plaintext captured through a browser looks ~8 bytes shorter than the real
// thing and any keystream fitted to it decrypts to subtly wrong hex. Always
// un-escape before parsing, and expect ciphertext length == plaintext + slash
// count.
//
// THE THREE POST SHAPES
// ---------------------
// The site does not model a series as one post. Measured 2026-10-11:
//   movie            /movie/<id>.html            one post, playInfo carries vid
//   series           /tv/<region>/<id>.html      one post, playInfo carries only
//                                                pkey; episodes are data-vid
//                                                buttons ("E01", "E08 End")
//   episode-as-post  /tv/<region>/<id>.html      one post PER episode, the
//                                                number lives in the title
//                                                ("【美剧】沙丘：预言 06 完结")
// All three are handled: chooseTv() scores posts so an exact episode post beats
// a range post ("02-03") which beats a whole-series post, and selectVids()
// then either uses playInfo.vid or picks the right data-vid button.
//
// EGRESS / FORMAT NOTES
// ---------------------
// ftn-* titles resolve to https://njc-download.ftn.qq.com/.../?fname=hd.mp4
// (plain MP4, verified HTTP 206 + video/mp4).
// ali-* titles resolve to https://media.oss-internal.novipnoad.ca/hls/...m3u8
// (HLS, verified 200 + application/vnd.apple.mpegurl). Both hosts answer 403 if
// the request carries a Referer pointing at the media URL itself; a bare request
// or the site/player Referer is accepted.
//
// "oss-internal" is an Aliyun internal endpoint, so this origin is the one most
// likely to differ by network. If it starts answering 403 to everything, the
// keystream will still be fine and only ali-* rows will fail.
//
// A dead ali-* id answers `{"code":404,"msg":"invalid videoid"}` with HTTP 200
// from enc-vod. That is a content condition (the post outlived its stream), not
// a protocol error, so it is reported verbatim in the diagnostic trail.

var BUILD = "NP1.1.0";

var SITE = "https://www.novipnoad.ca";
var PLAYER = "https://player.novipnoad.ca";
var UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";
var DEFAULT_TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var MAX_ROWS = 8;
var MAX_QUERIES = 5;

// Fixed keystream, base64 of 403 bytes. Regenerate from any two sessions by
// base64-decoding the payload and XOR-ing it with the un-escaped plaintext.
var KS_B64 =
  "wqYRr4mYPThe5Sf3eBGx8Fqn/fPrHbJuIf/dH7pr9a36aV3Shcn5tSdY/sVSlicIUByqZz0MjTlx" +
  "JADCfaRqN4VE56nHnD44nxy68l2xQZmxHgIId5geuarveXuWVNPTlxCRbFWi0UCu22Rx1LXXYyzk" +
  "Wimd43xKvUkOvQhDaMCiTxvHVrpn0uvQeL8jTfBP9VhFFtbzYdPEfqgBnXoULhmEwwgRA+rwdXIv" +
  "MHnA3Qw/ka6nxP/INYSl1i0EYiT07sKrvdOo+opeLaRy4cZ/esE3Ay+k0NvZm8KUaDgUw5Wel24X" +
  "iPFppChzO9pYx3REjguDDUFRLD6LQofCuBEvjCQcmSAexNtvu4aBbSzuHPI9yD5qUfFzvN2Rs4mI" +
  "XJ5YvK4d9Xj+Ax4AR2VTS6WXmOACj/GK1+DEul5wtqZT2GBENssLCR+TNIsd8q1Tf3VamwjKfSln" +
  "t9TfTpf3yviZl02UeJrza3jXtwZdpYHnuiAIJRbjYkKj7FZpyDWhCveOoJclHHrSVlT0oqx5emy8" +
  "ka/6ZQ==";

// ---------------------------------------------------------------------------
// diagnostics
// ---------------------------------------------------------------------------
// Nuvio does not surface console output, so the only channel back to the user
// is a result row. The trail is accumulated here and returned as a single
// about:error row whenever the call produces no playable stream.
var DIAG = [];
function log(s) { try { console.log("[NOVIPNOAD] " + s); } catch (e) { } }
function diag(s) {
  s = clean(s).replace(/\s+/g, " ");
  if (s && DIAG.indexOf(s) < 0 && DIAG.length < 12) DIAG.push(s);
}
function diagRows(stage) {
  var trail = DIAG.join(" | ") || "no detail";
  return [{
    name: "NO视频 · " + BUILD + " · " + stage + " · " + trail,
    title: "NO视频 · " + BUILD + " · " + stage + " · " + trail,
    url: "about:error",
    quality: "Status",
    type: "diagnostic",
    provider: "novipnoad-local"
  }];
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
function clean(v) { return v == null ? "" : String(v).trim(); }

function settings() {
  try { return (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) || {}; } catch (e) { return {}; }
}
function browserUa() { return clean(settings().browserUserAgent) || UA; }

function headers(ref, json) {
  return {
    "User-Agent": browserUa(),
    "Accept": json ? "application/json,text/plain,*/*" : "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
    "Referer": ref || SITE + "/"
  };
}

function fetchText(url, h) {
  return fetch(url, { headers: h || {} }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " · " + String(url).slice(0, 64));
    return r.text();
  });
}
function fetchJson(url, h) { return fetchText(url, h).then(function (t) { return JSON.parse(t); }); }

function htmlDecode(s) {
  return clean(s)
    .replace(/&#0*38;|&#x0*26;/gi, "&").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&hellip;/g, "…").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function norm(s) {
  return htmlDecode(s).toLowerCase()
    .replace(/[\u3010\u3011\[\]()（）《》:：·._-]+/g, " ")
    .replace(/[^0-9a-z\u00c0-\u024f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g, " ")
    .replace(/\s+/g, " ").trim();
}
function uniq(a) {
  var o = [], seen = {};
  (a || []).forEach(function (v) { v = clean(v); var k = norm(v); if (v && k && !seen[k]) { seen[k] = 1; o.push(v); } });
  return o;
}
function titleHasAny(title, terms) {
  var n = norm(title);
  for (var i = 0; i < terms.length; i++) { var q = norm(terms[i]); if (q && n.indexOf(q) >= 0) return true; }
  return false;
}
function safeUrl(u) {
  u = clean(u);
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(u) || u.length > 4096) return false;
  var m = u.match(/^https?:\/\/([^\/?#]+)/i), a = m && m[1];
  if (!a || a.indexOf("@") >= 0 || a.charAt(0) === "[") return false;
  var h = a.split(":")[0].toLowerCase();
  if (!h || h.indexOf(".") < 0) return false;
  if (/^(?:localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(h)) return false;
  return true;
}
function abs(u, base) {
  u = htmlDecode(u).replace(/\\\//g, "/");
  if (u.indexOf("//") === 0) u = "https:" + u;
  if (/^https?:\/\//i.test(u)) return safeUrl(u) ? u : "";
  if (u.charAt(0) === "/" && base) {
    var m = base.match(/^(https?:\/\/[^\/]+)/);
    if (m) { u = m[1] + u; return safeUrl(u) ? u : ""; }
  }
  return "";
}

// ---------------------------------------------------------------------------
// base64 + payload decryption
// ---------------------------------------------------------------------------
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64Bytes(input) {
  var s = String(input == null ? "" : input).replace(/[^A-Za-z0-9+\/=]/g, "");
  var out = [], buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    var v = B64.indexOf(s.charAt(i));
    if (v < 0) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return out;
}

var _ks = null;
function keystream() { if (!_ks) _ks = b64Bytes(KS_B64); return _ks; }

// Ciphertext bytes -> plaintext string. Payloads are always a prefix of the
// keystream; anything longer means the upstream shape changed, so refuse rather
// than silently XOR against a wrapped stream.
function decryptPayload(payload) {
  var c = b64Bytes(payload), ks = keystream();
  if (!c.length) throw new Error("empty payload");
  if (c.length > ks.length) throw new Error("payload " + c.length + "B > keystream " + ks.length + "B");
  var s = "";
  for (var i = 0; i < c.length; i++) s += String.fromCharCode(c[i] ^ ks[i]);
  return s.replace(/\\\//g, "/");
}

// ---------------------------------------------------------------------------
// WASM auth
// ---------------------------------------------------------------------------
function leb(b, i) {
  var r = 0, s = 0;
  for (;;) { var x = b[i++]; r |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; }
  return [r, i];
}

// The module is tiny (537 B): data segment 0 is a 256-byte permutation table at
// offset 0, segment 1 is the 108-byte ciphertext at offset 256.
function wasmSegments(bin) {
  var i = 8, table = null, blob = null;
  while (i < bin.length) {
    var sid = bin[i++], sz = leb(bin, i);
    var size = sz[0]; i = sz[1];
    if (sid === 11) {
      var j = i, c = leb(bin, j), cnt = c[0]; j = c[1];
      for (var k = 0; k < cnt; k++) {
        var f = leb(bin, j); j = f[1];
        j++;                                   // 0x41 i32.const
        var o = leb(bin, j), off = o[0]; j = o[1];
        j++;                                   // 0x0b end
        var l = leb(bin, j), len = l[0]; j = l[1];
        var d = bin.slice(j, j + len); j += len;
        if (off === 0 && len === 256) table = d;
        else if (off === 256) blob = d;
      }
    }
    i += size;
  }
  return { table: table, blob: blob };
}

// `i32.const K ; i32.xor ; local.get 0 ; i32.sub` — K is the only per-request
// constant baked into the code section.
function wasmXorConst(bin) {
  for (var i = 0; i + 4 < bin.length; i++) {
    if (bin[i] !== 0x41) continue;
    var j = i + 1, v = 0, s = 0, ok = false;
    for (var k = 0; k < 5; k++) {
      var x = bin[j++]; v |= (x & 0x7f) << s; s += 7;
      if (!(x & 0x80)) { ok = true; break; }
    }
    if (!ok) continue;
    if (bin[j] === 0x73 && bin[j + 1] === 0x20 && bin[j + 2] === 0x00 && bin[j + 3] === 0x6b) return v;
  }
  return -1;
}

// out[i] = table[ ((blob[i] ^ K) - s - i*7) & 255 ]
// `s` is a hash of a fingerprint the server randomises per request, so it is
// recovered by brute force and accepted only on a shape match.
function wasmSolve(bin) {
  var seg = wasmSegments(bin);
  if (!seg.table || !seg.blob) throw new Error("wasm segments missing");
  var K = wasmXorConst(bin);
  if (K < 0) throw new Error("wasm xor const missing");
  var table = seg.table, blob = seg.blob;
  for (var s = 0; s < 256; s++) {
    var out = "";
    for (var i = 0; i < blob.length; i++) out += String.fromCharCode(table[((blob[i] ^ K) - s - i * 7) & 255]);
    var ckey = out.slice(0, 40);
    if (!/^[0-9a-f]{40}$/i.test(ckey)) continue;
    var vk = null;
    try { vk = JSON.parse(out.slice(40)); } catch (e) { continue; }
    if (vk && typeof vk.ref === "string" && typeof vk.ip === "string") return { ckey: ckey, vkey: vk, s: s };
  }
  throw new Error("wasm key not solved");
}

// ---------------------------------------------------------------------------
// site parsing
// ---------------------------------------------------------------------------
function parseWpItems(body, base) {
  var rows;
  try { rows = JSON.parse(body); } catch (e) { return []; }
  if (!Array.isArray(rows)) return [];
  var out = [];
  rows.forEach(function (x) {
    if (!x) return;
    var u = abs(x.link || "", base);
    var t = htmlDecode((x.title && x.title.rendered) || "");
    if (u && t) out.push({ url: u, title: t });
  });
  return out;
}

function parseHtmlItems(html, base) {
  var out = [], seen = {}, re = /<a\s+href=["']?([^"'\s>]*?\/(?:movie|tv\/[a-z]+)\/\d+\.html)["']?\s+title="([^"]*)"/ig, m;
  while ((m = re.exec(html)) !== null && out.length < 120) {
    var u = abs(m[1], base), t = htmlDecode(m[2]);
    if (u && t && !seen[u]) { seen[u] = 1; out.push({ url: u, title: t }); }
  }
  return out;
}

function parsePlayInfo(html) {
  var h = clean(html);
  var m = h.match(/window\.playInfo\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i) || h.match(/window\.playInfo\s*=\s*(\{[^;]*\})\s*;/i);
  if (!m) return null;
  var vid = (m[1].match(/["']?vid["']?\s*:\s*["']([^"']*)["']/i) || [])[1] || "";
  var pkey = (m[1].match(/["']?pkey["']?\s*:\s*["']([^"']*)["']/i) || [])[1] || "";
  if (!pkey) return null;
  return { vid: htmlDecode(vid), pkey: htmlDecode(pkey) };
}

function parseEpisodeButtons(html) {
  var out = [], seen = {}, re = /<a\b[^>]*\bdata-vid=["']?([A-Za-z][\w-]*)["']?[^>]*>([\s\S]{0,120}?)<\/a>/gi, m;
  while ((m = re.exec(html)) !== null && out.length < 300) {
    var vid = clean(m[1]);
    var label = htmlDecode(m[2]);
    if (vid && !seen[vid]) { seen[vid] = 1; out.push({ vid: vid, label: label }); }
  }
  return out;
}

// Button labels are written as "E01".."E08 End" and almost never carry a
// season, so an absent season must come back as 0 ("unspecified") rather than
// 1: the season is a property of the post, not of the button, and defaulting to
// 1 made every episode of season 5+ look like a season-1 episode.
function buttonEpisode(label) {
  var m = clean(label).match(/(?:S(\d{1,2})\s*)?(?:E|EP|第)?\s*0*(\d{1,3})/i);
  return m ? { season: m[1] ? parseInt(m[1], 10) : 0, episode: parseInt(m[2], 10) } : null;
}

// Pick the stream ids to try for this request.
function selectVids(html, playInfo, type, season, episode) {
  var pkey = clean(playInfo && playInfo.pkey);
  var vid = clean(playInfo && playInfo.vid);
  if (!pkey) return [];
  if (vid) return [{ vid: vid, pkey: pkey, label: type === "tv" ? "E" + episode : "Main" }];
  var buttons = parseEpisodeButtons(html);
  if (!buttons.length) return [];
  if (type === "movie") return buttons.map(function (b, i) { return { vid: b.vid, pkey: pkey, label: b.label || ("Line " + (i + 1)) }; });
  var hits = [];
  buttons.forEach(function (b) {
    var e = buttonEpisode(b.label);
    if (!e || e.episode !== episode) return;
    if (e.season && season > 1 && e.season !== season) return;
    hits.push({ vid: b.vid, pkey: pkey, label: b.label || ("E" + episode) });
  });
  if (hits.length) return hits;
  // Some shows label episodes "01".."08 End" without an E prefix, and the page
  // is the season itself, so positional fallback is safe when nothing else
  // matched — the post was already selected for this season.
  if (episode >= 1 && episode <= buttons.length) {
    var b = buttons[episode - 1];
    return [{ vid: b.vid, pkey: pkey, label: b.label || ("E" + episode) }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// player resolution
// ---------------------------------------------------------------------------
function enc(v) { return encodeURIComponent(clean(v)); }

function resolveVid(vid, pkey, detailUrl) {
  var v1 = PLAYER + "/v1/?url=" + vid + "&pkey=" + pkey + "&ref=" + enc(detailUrl);
  return fetchText(v1, headers(SITE + detailUrl)).then(function (h1) {
    var dm = h1.match(/params\[['"]device['"]\]\s*=\s*['"]([^'"]+)['"]/);
    if (!dm) throw new Error("p1 no device");
    var wm = h1.match(/atob\(\s*['"]([A-Za-z0-9+\/=]+)['"]\s*\)/);
    if (!wm) throw new Error("p1 no wasm");
    var sol = wasmSolve(b64Bytes(wm[1]));

    var php = PLAYER + "/v1/player.php?id=" + vid + "&danmakuId=&fansub=&device=" + enc(dm[1]) +
      "&disable_danmaku=&refuse_danmaku=";
    return fetchText(php, headers(PLAYER + "/v1/")).then(function (h2) {
      var jm = h2.match(/jsapi\s*=\s*['"]([^'"]+)['"]/);
      if (!jm) throw new Error("p2 no jsapi");
      var ju = jm[1] + "?ckey=" + sol.ckey.toUpperCase() + "&ref=" + enc(sol.vkey.ref) +
        "&ip=" + enc(sol.vkey.ip) + "&time=" + enc(sol.vkey.time);
      return fetchText(ju, headers(PLAYER + "/v1/player.php")).then(function (js) {
        var em = js.match(/JSON\.decrypt\(\s*["']([^"']+)["']\s*\)/);
        if (!em) {
          // enc-vod answers HTTP 200 with {"code":404,"msg":"invalid videoid"}
          // when the post outlived its stream. Surface it rather than a generic
          // "no payload".
          var c = (js.match(/"code"\s*:\s*(\d+)/) || [])[1];
          var g = (js.match(/"msg"\s*:\s*"([^"]*)"/) || [])[1];
          throw new Error("p3 " + (c ? "code=" + c : "no payload") + (g ? " " + g : ""));
        }
        var obj = JSON.parse(decryptPayload(em[1]));
        var q = (obj && obj.quality) || [];
        if (!q.length) throw new Error("p3 empty quality code=" + (obj && obj.code));
        return q;
      });
    });
  });
}

function streamType(u, t) {
  var s = clean(t).toLowerCase(), p = clean(u).split(/[?#]/)[0].toLowerCase();
  if (s.indexOf("m3u8") >= 0 || s.indexOf("hls") >= 0 || /\.m3u8$/.test(p)) return "hls";
  if (s.indexOf("mp4") >= 0 || /\.mp4$/.test(p)) return "mp4";
  if (s.indexOf("mpd") >= 0 || /\.mpd$/.test(p)) return "dash";
  // enc-vod labels a progressive file "normal". Those resolve to the Tencent
  // CDN, e.g. https://njc-download.ftn.qq.com/ftn_handler/<hex>/?fname=hd.mp4 —
  // no extension anywhere in the path, so the extension test above never sees
  // it and the row would ship without a type. Both the label and the host are
  // reliable, so accept either.
  var h = (clean(u).match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || "";
  if (s === "normal" || /(?:^|\.)ftn\.qq\.com$/i.test(h)) return "mp4";
  return "";
}
function qnum(q) {
  var m = String(q || "").match(/(2160|1440|1080|720|576|480|360|240)/);
  return m ? parseInt(m[1], 10) : 0;
}

// ---------------------------------------------------------------------------
// metadata -> search terms
// ---------------------------------------------------------------------------
// A TMDB id carries no title, and NO视频 indexes Chinese titles, so the id has
// to be turned into search terms first.
//
// api.tmdb.org is TMDB's own alias for api.themoviedb.org and is tried first:
// measured 2026-10-11 from a mainland egress the canonical host is refused at
// CONNECT (502) while the alias answers 200 with the same payload. It is the
// only source that yields Chinese titles and HK/TW/SG aliases, which is what
// the Chinese-only posts need ("【美剧】沙丘：预言 06 完结").
//
// Cinemeta is consulted only for non-numeric ids; see metaFor().
//
// Each attempt gets its own budget rather than sharing one outer deadline: with
// a single deadline a slow first host consumed the whole allowance and the
// second host was never tried at all.
//
// The primary host appears twice on purpose. The first outbound HTTPS request
// of a fresh process pays a one-off DNS/TLS cost — measured 2026-10-11 at
// 8.7 s on this machine, against 0.75 s for every request after it — so a cold
// primary host can burn a short budget while the connection is in fact about to
// come good. The canonical host is cheap to fail against (it answers CONNECT
// 502 immediately here), and by the time it has failed the TLS state is warm,
// so the retry lands in ~0.75 s instead of stalling for the full budget.
var TMDB_HOSTS = ["https://api.tmdb.org", "https://api.themoviedb.org", "https://api.tmdb.org"];
var TMDB_HOST_TIMEOUT_MS = 6000;
var TMDB_TOTAL_TIMEOUT_MS = 18000;
var CINEMETA_HOSTS = ["https://cinemeta-live.strem.io", "https://v3-cinemeta.strem.io"];
var CINEMETA_HOST_TIMEOUT_MS = 3000;
var CINEMETA_TOTAL_TIMEOUT_MS = 6000;

function withTimeout(p, ms) {
  if (typeof setTimeout !== "function") return p;
  return new Promise(function (resolve) {
    var done = false;
    var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
    p.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
           function () { if (!done) { done = true; clearTimeout(t); resolve(null); } });
  });
}

function cinemetaMeta(id, mediaType) {
  var kind = mediaType === "tv" ? "series" : "movie";
  var i = 0;
  function attempt() {
    if (i >= CINEMETA_HOSTS.length) return Promise.resolve(null);
    var host = CINEMETA_HOSTS[i++];
    return withTimeout(
      fetchJson(host + "/meta/" + kind + "/" + enc(id) + ".json", headers(SITE + "/", true))
        .then(function (j) { return (j && j.meta && j.meta.name) ? { names: [clean(j.meta.name)], year: clean(j.meta.year) } : null; })
        .catch(function () { return null; }),
      CINEMETA_HOST_TIMEOUT_MS
    ).then(function (r) { return r || attempt(); });
  }
  return withTimeout(attempt(), CINEMETA_TOTAL_TIMEOUT_MS);
}

function tmdbMeta(id, mediaType) {
  if (!/^\d+$/.test(String(id))) return Promise.resolve(null);
  var kind = mediaType === "tv" ? "tv" : "movie";
  var key = clean(settings().tmdbApiKey) || DEFAULT_TMDB_API_KEY;
  var i = 0;
  function attempt() {
    if (i >= TMDB_HOSTS.length) return Promise.resolve(null);
    var base = TMDB_HOSTS[i++] + "/3/" + kind + "/" + id + "?api_key=" + enc(key);
    var pZh = fetchJson(base + "&language=zh-CN", headers(SITE + "/", true)).catch(function () { return null; });
    var pEn = fetchJson(base + "&language=en-US&append_to_response=translations,alternative_titles", headers(SITE + "/", true)).catch(function () { return null; });
    return withTimeout(Promise.all([pZh, pEn]).then(function (a) {
      if (!a[0] && !a[1]) return null;
      var z = a[0] || {}, e = a[1] || {};
      var d = clean(e.release_date || e.first_air_date || z.release_date || z.first_air_date);
      var names = [];
      function add(v) { v = clean(v); if (v && names.indexOf(v) < 0) names.push(v); }
      add(z.title || z.name);
      var trs = (e.translations && e.translations.translations) || [];
      trs.forEach(function (t) {
        if (!t || clean(t.iso_639_1).toLowerCase() !== "zh") return;
        var data = t.data || {}; add(data.title || data.name);
      });
      var alt = e.alternative_titles || {}, rows = alt.titles || alt.results || [];
      rows.forEach(function (t) {
        var cc = clean(t && t.iso_3166_1).toUpperCase();
        if (cc === "CN" || cc === "HK" || cc === "TW" || cc === "SG" || cc === "MO") add(t && t.title);
      });
      add(e.title || e.name);
      add(e.original_title || e.original_name);
      if (!names.length) return null;
      return { names: names, year: /^\d{4}/.test(d) ? d.slice(0, 4) : "" };
    }), TMDB_HOST_TIMEOUT_MS).then(function (r) { return r || attempt(); });
  }
  return withTimeout(attempt(), TMDB_TOTAL_TIMEOUT_MS);
}

// Cinemeta is consulted only for non-numeric ids. For a numeric TMDB id it
// cannot help at all: measured 2026-10-11 both hosts 307-redirect into each
// other and the chain drops the /meta/ prefix and lands on a 404 —
//   /meta/movie/693134.json -> 307 -> cinemeta-live/meta/movie/693134.json
//                           -> 307 -> v3-cinemeta/movie/693134.json -> 404
// — so running it after a failed TMDB lookup would only add six seconds of
// guaranteed-dead latency to the failure path.
function metaFor(id, mediaType) {
  var numeric = /^\d+$/.test(String(id));
  return (numeric ? tmdbMeta(id, mediaType) : cinemetaMeta(id, mediaType)).then(function (m) {
    if (!m || !m.names || !m.names.length) return null;
    // Chinese terms first: they are the precise ones and MAX_QUERIES caps how
    // many searches we get, so they must not be pushed out by English ones.
    return { terms: uniq(m.names).slice(0, 8), year: clean(m.year) };
  });
}

// ---------------------------------------------------------------------------
// search + selection
// ---------------------------------------------------------------------------
function wpSearch(query) {
  var u = SITE + "/wp-json/wp/v2/posts?search=" + enc(query) + "&per_page=20";
  return fetchJson(u, headers(SITE + "/", true)).then(function (j) {
    var items = [];
    (Array.isArray(j) ? j : []).forEach(function (x) {
      if (!x) return;
      var link = abs(x.link || "", SITE);
      var t = htmlDecode((x.title && x.title.rendered) || "");
      if (link && t) items.push({ url: link, title: t });
    });
    diag("WP " + query + "=" + items.length);
    return items;
  });
}
function htmlSearch(query) {
  var u = SITE + "/search/" + enc(query) + "/";
  return fetchText(u, headers(SITE + "/")).then(function (h) {
    if (/Just a moment|challenge-platform/i.test(h)) throw new Error("challenge");
    var items = parseHtmlItems(h, SITE);
    diag("HTML " + query + "=" + items.length);
    return items;
  });
}

function searchAll(terms) {
  var out = [], seen = {}, i = 0;
  function step() {
    if (i >= terms.length || i >= MAX_QUERIES) return Promise.resolve(out);
    var q = terms[i++];
    return wpSearch(q).catch(function (e) { diag("WPERR " + q + " " + (e && e.message || e)); return htmlSearch(q); })
      .catch(function (e) { diag("HTMLERR " + q + " " + (e && e.message || e)); return []; })
      .then(function (items) {
        (items || []).forEach(function (it) { if (it.url && !seen[it.url]) { seen[it.url] = 1; out.push(it); } });
        if (out.length) return out;
        return step();
      });
  }
  return step();
}

function chooseMovie(items, terms, year) {
  var cand = [];
  (items || []).forEach(function (it) {
    if (!/\/movie\//i.test(it.url) || !titleHasAny(it.title, terms)) return;
    var ys = it.title.match(/(?:19|20)\d{2}/g) || [];
    if (year && ys.length && ys.indexOf(year) < 0) return;
    var score = 0, nt = norm(it.title);
    terms.forEach(function (x) { var q = norm(x); if (q && nt.indexOf(q) >= 0) score += q.length; });
    if (year && ys.indexOf(year) >= 0) score += 1000;
    cand.push({ it: it, score: score });
  });
  cand.sort(function (a, b) { return b.score - a.score; });
  if (!cand.length) return null;
  if (cand.length > 1 && cand[0].score === cand[1].score && cand[0].it.url !== cand[1].it.url) return null;
  return cand[0].it;
}

function cnSeasonNum(s) {
  s = clean(s);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  var map = { "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
  if (map[s]) return map[s];
  if (/^十[一二三四五六七八九]$/.test(s)) return 10 + map[s.charAt(1)];
  if (/^[二三四五六七八九]十$/.test(s)) return map[s.charAt(0)] * 10;
  if (/^[二三四五六七八九]十[一二三四五六七八九]$/.test(s)) return map[s.charAt(0)] * 10 + map[s.charAt(2)];
  return 0;
}

// Everything after the show name. The site writes posts as
// "【美剧】沙丘：预言 06 完结【衣柜字幕组】", so the number that identifies the
// episode only ever appears in the tail; scanning the head would read digits
// that belong to the title itself ("9号秘事").
function tailAfterTerm(title, terms) {
  var t = clean(title), cut = -1, cl = 0;
  (terms || []).forEach(function (x) {
    x = clean(x);
    if (!x) return;
    var i = t.indexOf(x);
    if (i >= 0 && x.length > cl) { cut = i; cl = x.length; }
  });
  if (cut >= 0) t = t.slice(cut + cl);
  // A season marker is not an episode number.
  return t.replace(/第\s*[0-9一二两三四五六七八九十]{1,3}\s*季/gi, " ")
          .replace(/[（(][^）)]*[）)]/g, " ")
          .replace(/【[^】]*】/g, " ");
}

// Standalone 1-3 digit numbers. Deliberately refuses 4-digit runs so a year
// ("The Wild Robot 2024") can never be read as an episode, and refuses numbers
// glued to other digits so "1080P" is skipped. "02-03" yields [2,3].
function standaloneNumbers(s) {
  var out = [], re = /(?:^|[^0-9])0*(\d{1,3})(?=[^0-9]|$)/g, m;
  while ((m = re.exec(s)) !== null) {
    var v = parseInt(m[1], 10);
    if (v >= 1 && v <= 999 && out.indexOf(v) < 0) out.push(v);
    re.lastIndex = m.index + m[0].length;
  }
  return out;
}

function episodeInfo(title, terms) {
  var t = clean(title), m;
  var sm = t.match(/第\s*([0-9一二两三四五六七八九十]{1,3})\s*季/i);
  var seasonHint = sm ? cnSeasonNum(sm[1]) : 1, seasonExplicit = !!sm;

  // Whole-season post: "(12集全)" / "全12集".
  m = t.match(/[（(](\d{1,3})\s*集全[）)]|(?:全|共)\s*(\d{1,3})\s*集/i);
  if (m) {
    var n = parseInt(m[1] || m[2], 10), c = [];
    for (var k = 1; k <= n && k <= 100; k++) c.push(k);
    return { season: seasonHint, episodes: c, explicitSeason: seasonExplicit, complete: true };
  }

  var tail = tailAfterTerm(t, terms);

  m = tail.match(/\bS(\d{1,2})\s*E(\d{1,3})\s*[-~—–至]\s*(?:E)?(\d{1,3})\b/i);
  if (m) { var x = parseInt(m[2], 10), y = parseInt(m[3], 10), a1 = []; for (var i1 = x; i1 <= y && i1 < x + 50; i1++) a1.push(i1); return { season: parseInt(m[1], 10), episodes: a1, explicitSeason: true }; }
  m = tail.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i);
  if (m) return { season: parseInt(m[1], 10), episodes: [parseInt(m[2], 10)], explicitSeason: true };
  m = tail.match(/(?:^|[^0-9])(\d{1,3})\s*[-~—–至]\s*(\d{1,3})(?:[^0-9]|$)/);
  if (m) {
    var p = parseInt(m[1], 10), q = parseInt(m[2], 10);
    if (p >= 1 && q > p && q < p + 50) {
      var a2 = []; for (var i2 = p; i2 <= q; i2++) a2.push(i2);
      return { season: seasonHint, episodes: a2, explicitSeason: seasonExplicit };
    }
  }
  var nums = standaloneNumbers(tail);
  return { season: seasonHint, episodes: nums, explicitSeason: seasonExplicit };
}

function chooseTv(items, terms, season, episode) {
  var hits = [];
  (items || []).forEach(function (it) {
    if (!/\/(?:tv|anime|shows)\//i.test(it.url) || !titleHasAny(it.title, terms)) return;
    var ep = episodeInfo(it.title, terms);
    if (ep.explicitSeason && ep.season !== season) return;
    if (season > 1 && !ep.explicitSeason) return;
    // No number anywhere in the tail: this is a whole-series post whose page
    // carries the episode buttons, so it can serve any episode of this season.
    if (!ep.episodes.length) { hits.push({ it: it, span: 900 }); return; }
    if (ep.episodes.indexOf(episode) < 0) return;
    hits.push({ it: it, span: ep.episodes.length });
  });
  if (!hits.length) return null;
  // An exact episode post beats a range post ("02-03") beats a whole-series post.
  hits.sort(function (a, b) { return a.span - b.span; });
  return hits[0].it;
}

// ---------------------------------------------------------------------------
// getStreams
// ---------------------------------------------------------------------------
function getStreams(tmdbId, mediaType, season, episode) {
  DIAG = [];
  if (!tmdbId) return Promise.resolve([]);
  if (mediaType !== "movie" && mediaType !== "tv") return Promise.resolve([]);
  if (mediaType === "tv" && (!season || !episode)) return Promise.resolve([]);

  var tag = "id=" + tmdbId + " type=" + mediaType + (mediaType === "tv" ? " s=" + season + " e=" + episode : "");
  log(BUILD + " " + tag);

  return metaFor(tmdbId, mediaType).then(function (meta) {
    if (!meta || !meta.terms.length) throw new Error("no title for " + tmdbId);
    diag("TERMS " + meta.terms.slice(0, 4).join("/"));
    return searchAll(meta.terms).then(function (items) {
      if (!items.length) throw new Error("SCAN 0 results");
      var hit = mediaType === "tv"
        ? chooseTv(items, meta.terms, season, episode)
        : chooseMovie(items, meta.terms, meta.year);
      if (!hit) throw new Error("NOHIT among " + items.length + " results");
      diag("HIT " + hit.title.slice(0, 28));
      return fetchText(hit.url, headers(SITE + "/")).then(function (html) {
        var pi = parsePlayInfo(html);
        var vids = selectVids(html, pi, mediaType, season, episode);
        if (!vids.length) throw new Error("no vid (playInfo=" + (pi ? "yes" : "no") + ")");
        diag("VIDS " + vids.length + " " + vids[0].vid);
        return vids;
      }).then(function (vids) {
        // Try each candidate id; first one that yields qualities wins.
        var i = 0;
        function next() {
          if (i >= vids.length) throw new Error("all " + vids.length + " vids failed");
          var v = vids[i++];
          return resolveVid(v.vid, v.pkey, hit.url.replace(SITE, "")).then(function (quality) {
            return { v: v, quality: quality };
          }).catch(function (e) {
            diag("VIDFAIL " + v.vid + " " + (e && e.message || e));
            return next();
          });
        }
        return next();
      }).then(function (res) {
        var out = [], seen = {};
        (res.quality || []).forEach(function (q) {
          var u = clean(q && q.url);
          if (!safeUrl(u) || seen[u]) return;
          seen[u] = 1;
          var name = clean(q && q.name) || (qnum(u) ? qnum(u) + "P" : "Auto");
          var row = {
            name: "NO视频 · " + name,
            title: "NO视频 · " + name + " · " + res.v.label,
            url: u,
            quality: name,
            provider: "novipnoad-local",
            headers: { "User-Agent": browserUa(), "Referer": SITE + "/" }
          };
          var t = streamType(u, q && q.type);
          if (t) row.type = t;
          out.push(row);
        });
        out.sort(function (a, b) { return qnum(b.quality) - qnum(a.quality); });
        out = out.slice(0, MAX_ROWS);
        log(BUILD + " streams=" + out.length);
        if (!out.length) return diagRows("NOSTREAM");
        return out;
      });
    });
  }).catch(function (e) {
    var msg = (e && e.message) || String(e);
    log(BUILD + " FAIL " + msg);
    diag("FATAL " + msg);
    return diagRows("FATAL");
  });
}

function onSettings() {
  return [
    { key: "tmdbApiKey", label: "TMDB API key", type: "text", default: "", description: "Optional. Used to fetch Chinese titles/aliases so the site search has better terms." },
    { key: "browserUserAgent", label: "User-Agent", type: "text", default: UA, description: "Optional. Override the User-Agent sent to novipnoad." }
  ];
}

module.exports = { getStreams: getStreams, onSettings: onSettings };

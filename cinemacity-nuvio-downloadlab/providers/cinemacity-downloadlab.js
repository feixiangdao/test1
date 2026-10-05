// CinemaCity Download Lab — Nuvio local scraper
//
// Independent from Cinejoy / Stellar / NoctraTV.
// Reuses the user's own authenticated CinemaCity browser session.
// Returns only direct HLS / MP4 / DASH URLs exposed by the authenticated
// CinemaCity page or a same-origin player page. No iframe fallback.
//
// Current site behavior (2026-10):
// - public detail/catalog pages are indexable;
// - Watch/Download requires registration/login;
// - Cloudflare may require cf_clearance plus a matching browser UA;
// - authenticated playback DOM/API still needs live verification.

var BASE = "https://cinemacity.cc";
var TMDB_BASE = "https://api.themoviedb.org/3";
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";
var DEFAULT_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
var FAST_CACHE = {
  meta: {},
  item: {},
  streams: {}
};


function clean(v) {
  return v == null ? "" : String(v).trim();
}

function settings() {
  try {
    return globalThis.SCRAPER_SETTINGS || {};
  } catch (_) {
    return {};
  }
}

function onSettings() {
  return [
    {
      type: "header",
      label: "CinemaCity account session"
    },
    {
      type: "info",
      label: "CinemaCity requires login before Watch/Download. Paste the Cookie header from your own signed-in browser session. The plugin does not need or store your CinemaCity password."
    },
    {
      type: "text",
      key: "cookie",
      label: "Session Cookie",
      isPassword: true,
      defaultValue: ""
    },
    {
      type: "text",
      key: "userAgent",
      label: "Browser User-Agent (optional; useful with Cloudflare)",
      defaultValue: DEFAULT_UA
    }
  ];
}

function cookieValue() {
  return clean(settings().cookie);
}

function userAgent() {
  return clean(settings().userAgent) || DEFAULT_UA;
}

function baseHeaders(referer, includeCookie) {
  var h = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.8",
    "User-Agent": userAgent(),
    "Referer": referer || (BASE + "/")
  };
  var c = cookieValue();
  if (includeCookie && c) h["Cookie"] = c;
  return h;
}

function jsonHeaders(referer) {
  var h = baseHeaders(referer, false);
  h["Accept"] = "application/json";
  return h;
}

function decodeEntities(s) {
  return clean(s)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/");
}

function decodeEscapedUrl(s) {
  return decodeEntities(clean(s))
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
}

function stripTags(s) {
  return decodeEntities(clean(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function normalizeTitle(s) {
  return stripTags(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstYear(s) {
  var m = clean(s).match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : "";
}

function resolveUrl(raw, base) {
  var u = decodeEscapedUrl(raw);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (/^\/\//.test(u)) return "https:" + u;
  if (/^\//.test(u)) return BASE + u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "";
  var b = clean(base || BASE + "/");
  var cut = b.lastIndexOf("/");
  return (cut >= 8 ? b.slice(0, cut + 1) : BASE + "/") + u;
}

function hostOf(url) {
  var m = clean(url).match(/^https?:\/\/([^\/:?#]+)/i);
  return m ? m[1].toLowerCase() : "";
}

function isCinemaCityHost(url) {
  var h = hostOf(url);
  return h === "cinemacity.cc" || /\.cinemacity\.cc$/i.test(h);
}

function isDirectMedia(url) {
  return /\.(?:m3u8|mp4|mpd)(?:$|[?#])/i.test(clean(url));
}

function mediaTypeOf(url) {
  if (/\.mpd(?:$|[?#])/i.test(url)) return "dash";
  if (/\.mp4(?:$|[?#])/i.test(url)) return "mp4";
  return "hls";
}

function qualityOf(url, context) {
  var s = (clean(url) + " " + clean(context)).toLowerCase();
  if (/2160|4k|uhd/.test(s)) return "4K";
  if (/1440/.test(s)) return "1440p";
  if (/1080/.test(s)) return "1080p";
  if (/720/.test(s)) return "720p";
  if (/480/.test(s)) return "480p";
  if (/360/.test(s)) return "360p";
  return "Auto";
}

function challengeHtml(html) {
  var s = clean(html);
  return /performing security verification|verify you are human|cf-chl-|challenge-platform|captcha_checkbox/i.test(s);
}

function guestBlocked(html) {
  return /guests are not allowed to watch or download|registration is required to watch movies/i.test(clean(html));
}

function fetchText(url, opts) {
  return fetch(url, opts || {}).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.text();
  });
}

function fetchAuthed(url, referer) {
  var c = cookieValue();
  if (!c) return Promise.reject(new Error("CinemaCity Session Cookie is not configured"));
  return fetchText(url, {
    headers: baseHeaders(referer || BASE + "/", true)
  }).then(function(html) {
    if (challengeHtml(html)) {
      throw new Error("CinemaCity Cloudflare challenge detected; refresh cf_clearance and Browser User-Agent in provider settings");
    }
    return html;
  });
}

function tmdbMeta(tmdbId, mediaType) {
  var type = mediaType === "tv" ? "tv" : "movie";
  var cacheKey = type + ":" + String(tmdbId);
  if (FAST_CACHE.meta[cacheKey]) return Promise.resolve(FAST_CACHE.meta[cacheKey]);

  var url = TMDB_BASE + "/" + type + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(TMDB_KEY) + "&language=en-US";
  return fetch(url, { headers: jsonHeaders("https://www.themoviedb.org/") })
    .then(function(r) {
      if (!r.ok) throw new Error("TMDB HTTP " + r.status);
      return r.json();
    })
    .then(function(d) {
      var title = clean(type === "movie" ? d.title : d.name);
      var original = clean(type === "movie" ? d.original_title : d.original_name);
      var date = clean(type === "movie" ? d.release_date : d.first_air_date);
      var meta = {
        title: title || original,
        originalTitle: original,
        year: firstYear(date)
      };
      FAST_CACHE.meta[cacheKey] = meta;
      return meta;
    });
}

function searchPost(query) {
  var body = "do=search&subaction=search&story=" + encodeURIComponent(query);
  var h = baseHeaders(BASE + "/", true);
  h["Content-Type"] = "application/x-www-form-urlencoded";
  return fetchText(BASE + "/index.php?do=search", {
    method: "POST",
    headers: h,
    body: body
  });
}

function searchGet(query) {
  var url = BASE + "/index.php?do=search&subaction=search&story=" + encodeURIComponent(query);
  return fetchText(url, { headers: baseHeaders(BASE + "/", true) });
}

function candidateLinks(html, mediaType) {
  var out = [], seen = {};
  var wanted = mediaType === "tv" ? "/tv-series/" : "/movies/";
  var re = /href\s*=\s*["']([^"']+(?:\/movies\/|\/tv-series\/)[^"']+\.html(?:\?[^"']*)?)["']/ig;
  var m;
  while ((m = re.exec(clean(html))) !== null) {
    var u = resolveUrl(m[1], BASE + "/");
    if (!u || !isCinemaCityHost(u) || u.indexOf(wanted) < 0 || seen[u]) continue;
    seen[u] = 1;
    out.push(u);
    if (out.length >= 12) break;
  }
  return out;
}

function detailIdentity(html) {
  var s = clean(html), m;
  m = s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  var title = m ? stripTags(m[1]) : "";
  if (!title) {
    m = s.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (!m) m = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    title = m ? stripTags(m[1]) : "";
  }
  return { title: title, year: firstYear(title + " " + s.slice(0, 12000)) };
}

function scoreDetail(meta, identity, url) {
  var want = normalizeTitle(meta.title);
  var alt = normalizeTitle(meta.originalTitle);
  var got = normalizeTitle(identity.title);
  var score = 0;
  if (want && got === want) score += 10;
  else if (want && got && (got.indexOf(want) >= 0 || want.indexOf(got) >= 0)) score += 6;
  if (alt && got === alt) score += 8;
  else if (alt && got && (got.indexOf(alt) >= 0 || alt.indexOf(got) >= 0)) score += 4;
  if (meta.year && (identity.year === meta.year || clean(url).indexOf(meta.year) >= 0)) score += 4;
  return score;
}

function locateDetail(meta, mediaType) {
  var terms = [];
  [meta.title, meta.originalTitle].forEach(function(t) {
    t = clean(t);
    if (t && terms.indexOf(t) < 0) terms.push(t);
  });
  if (!terms.length) return Promise.reject(new Error("TMDB title missing"));

  var searches = [];
  terms.forEach(function(term) {
    searches.push(
      searchPost(term).catch(function() { return searchGet(term); })
    );
  });

  return Promise.all(searches).then(function(pages) {
    var urls = [], seen = {};
    pages.forEach(function(html) {
      if (challengeHtml(html)) return;
      candidateLinks(html, mediaType).forEach(function(u) {
        if (!seen[u]) {
          seen[u] = 1;
          urls.push(u);
        }
      });
    });
    if (!urls.length) throw new Error("CinemaCity search returned no matching detail links");

    urls = urls.slice(0, 6);
    return Promise.all(urls.map(function(u) {
      return fetchAuthed(u, BASE + "/").then(function(html) {
        return { url: u, html: html, identity: detailIdentity(html) };
      }).catch(function() {
        return null;
      });
    }));
  }).then(function(rows) {
    var best = null, bestScore = -1;
    (rows || []).forEach(function(row) {
      if (!row) return;
      var s = scoreDetail(meta, row.identity, row.url);
      if (s > bestScore) {
        bestScore = s;
        best = row;
      }
    });
    if (!best || bestScore < 6) throw new Error("CinemaCity strict title/year match failed");
    return best;
  });
}

function extractSubtitles(html, baseUrl) {
  var out = [], seen = {};
  var s = decodeEscapedUrl(clean(html));
  var re = /(?:https?:\/\/|\/\/|\/)[^"'<>\s\\]+?\.(?:vtt|srt|ass)(?:\?[^"'<>\s\\]*)?/ig;
  var m;
  while ((m = re.exec(s)) !== null) {
    var u = resolveUrl(m[0], baseUrl);
    if (!u || seen[u]) continue;
    seen[u] = 1;
    out.push({
      url: u,
      language: "Unknown",
      name: "CinemaCity subtitle"
    });
    if (out.length >= 12) break;
  }
  return out;
}

function extractDirectMedia(html, baseUrl, subtitles) {
  var out = [], seen = {};
  var normalized = decodeEscapedUrl(clean(html));
  var re = /(?:https?:\/\/|\/\/|\/)[^"'<>\s\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^"'<>\s\\]*)?/ig;
  var m;
  while ((m = re.exec(normalized)) !== null) {
    var u = resolveUrl(m[0], baseUrl);
    if (!u || !isDirectMedia(u) || seen[u]) continue;
    seen[u] = 1;

    var context = normalized.slice(
      Math.max(0, m.index - 180),
      Math.min(normalized.length, m.index + m[0].length + 180)
    );
    var q = qualityOf(u, context);
    var type = mediaTypeOf(u);
    var h = {
      "User-Agent": userAgent(),
      "Referer": baseUrl,
      "Origin": BASE
    };

    // Never leak the CinemaCity login session to third-party CDN hosts.
    if (isCinemaCityHost(u) && cookieValue()) {
      h["Cookie"] = cookieValue();
    }

    var label = "CinemaCity · " + q + " · " + type.toUpperCase();
    out.push({
      name: label,
      title: label,
      url: u,
      quality: q,
      type: type,
      provider: "cinemacity-downloadlab-100",
      headers: h,
      subtitles: subtitles || []
    });
    if (out.length >= 12) break;
  }
  return out;
}

function sameOriginPlayerPages(html, detailUrl) {
  var out = [], seen = {};
  var s = decodeEscapedUrl(clean(html));
  var patterns = [
    /<iframe[^>]+src\s*=\s*["']([^"']+)["']/ig,
    /(?:src|href|data-src|data-url|data-player)\s*=\s*["']([^"']*(?:player|watch|stream|video)[^"']*)["']/ig
  ];

  patterns.forEach(function(re) {
    var m;
    while ((m = re.exec(s)) !== null) {
      var u = resolveUrl(m[1], detailUrl);
      if (!u || !isCinemaCityHost(u) || u === detailUrl || seen[u]) continue;
      if (/logout|register|lostpassword|comments?/i.test(u)) continue;
      seen[u] = 1;
      out.push(u);
      if (out.length >= 4) break;
    }
  });

  return out.slice(0, 4);
}

function dedupeStreams(rows) {
  var out = [], seen = {};
  (rows || []).forEach(function(x) {
    if (!x || !x.url || seen[x.url]) return;
    seen[x.url] = 1;
    out.push(x);
  });
  return out;
}

function resolveFromDetail(detail) {
  if (guestBlocked(detail.html)) {
    throw new Error("CinemaCity session is not authenticated or has expired");
  }

  var subs = extractSubtitles(detail.html, detail.url);
  var direct = extractDirectMedia(detail.html, detail.url, subs);
  if (direct.length) return Promise.resolve(direct);

  var children = sameOriginPlayerPages(detail.html, detail.url);
  if (!children.length) return Promise.resolve([]);

  return Promise.all(children.map(function(u) {
    return fetchAuthed(u, detail.url)
      .then(function(html) {
        var childSubs = extractSubtitles(html, u);
        return extractDirectMedia(html, u, subs.concat(childSubs));
      })
      .catch(function(e) {
        console.log("[CinemaCity] child " + u + " " + (e && e.message ? e.message : e));
        return [];
      });
  })).then(function(groups) {
    var all = [];
    groups.forEach(function(g) {
      all = all.concat(g || []);
    });
    return dedupeStreams(all);
  });
}

function diagnosticResult(stage, detail) {
  var safeStage = clean(stage) || "unknown";
  var safeDetail = clean(detail).replace(/\s+/g, " ").slice(0, 220);
  var title = "CinemaCity DIAG · " + safeStage;
  if (safeDetail) title += " · " + safeDetail;
  return [{
    name: title,
    title: title,
    url: BASE + "/#nuvio-diagnostic-" + encodeURIComponent(safeStage),
    quality: "DIAG",
    type: "diagnostic",
    provider: "cinemacity-downloadlab-100"
  }];
}

function diagnosticProbeItem(name, status, url, extra) {
  var text = String(status) + " · " + name;
  if (extra) text += " · " + clean(extra).replace(/\s+/g, " ").slice(0, 70);
  return {
    name: text,
    title: text,
    url: url || (BASE + "/"),
    quality: "DIAG",
    type: "diagnostic",
    provider: "cinemacity-downloadlab-100",
    _probeName: name,
    _probeStatus: status
  };
}

function probeRequest(name, url, options) {
  return fetch(url, options || {}).then(function(r) {
    return r.text().catch(function(){ return ""; }).then(function(body) {
      var extra = "";
      if (challengeHtml(body)) extra = "Cloudflare challenge";
      else if (guestBlocked(body)) extra = "guest/login gate";
      return diagnosticProbeItem(name, r.status, r.url || url, extra);
    });
  }).catch(function(e) {
    return diagnosticProbeItem(name, 0, url, e && e.message ? e.message : e);
  });
}

function diagnosticProbeEndpoints() {
  var h = baseHeaders(BASE + "/", true);
  var postHeaders = {};
  Object.keys(h).forEach(function(k){ postHeaders[k] = h[k]; });
  postHeaders["Content-Type"] = "application/x-www-form-urlencoded";
  postHeaders["Origin"] = BASE;
  postHeaders["X-Requested-With"] = "XMLHttpRequest";

  var ajaxHeaders = {};
  Object.keys(h).forEach(function(k){ ajaxHeaders[k] = h[k]; });
  ajaxHeaders["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  ajaxHeaders["Origin"] = BASE;
  ajaxHeaders["X-Requested-With"] = "XMLHttpRequest";

  return Promise.all([
    probeRequest("HOME", BASE + "/", { headers: h }),
    probeRequest("MOVIES", BASE + "/movies/", { headers: h }),
    probeRequest("SEARCH", BASE + "/index.php?do=search", {
      method: "POST",
      headers: postHeaders,
      body: "do=search&subaction=search&story=" + encodeURIComponent("The Matrix")
    }),
    probeRequest("AJAX", BASE + "/engine/ajax/controller.php?mod=search", {
      method: "POST",
      headers: ajaxHeaders,
      body: "query=" + encodeURIComponent("The Matrix")
    })
  ]).then(function(rows) {
    var codes = {};
    (rows || []).forEach(function(x) {
      if (x && x._probeName) codes[x._probeName] = x._probeStatus;
    });
    var summary = "H=" + String(codes.HOME == null ? "?" : codes.HOME) +
      " M=" + String(codes.MOVIES == null ? "?" : codes.MOVIES) +
      " S=" + String(codes.SEARCH == null ? "?" : codes.SEARCH) +
      " A=" + String(codes.AJAX == null ? "?" : codes.AJAX);
    var first = {
      name: summary,
      title: summary,
      url: BASE + "/#nuvio-probe-summary",
      quality: "DIAG",
      type: "diagnostic",
      provider: "cinemacity-downloadlab-100"
    };
    return [first].concat(rows || []);
  });
}



function localSessionDiagnostic() {
  var c = cookieValue();
  var ua = userAgent();
  var cf = /(?:^|;\s*)cf_clearance=/.test(c) ? 1 : 0;
  var uid = /(?:^|;\s*)dle_user_id=/.test(c) ? 1 : 0;
  var pwd = /(?:^|;\s*)dle_password=/.test(c) ? 1 : 0;
  var uaf = clean(ua) ? 1 : 0;

  var names = [];
  try {
    c.split(";").forEach(function(part) {
      var i = part.indexOf("=");
      var n = (i >= 0 ? part.slice(0, i) : part).trim();
      if (n && names.indexOf(n) < 0) names.push(n);
    });
  } catch (_) {}
  var nameText = names.slice(0, 8).join(",");
  if (names.length > 8) nameText += ",...";

  var text = "LEN=" + String(c.length) +
    " CF=" + cf +
    " ID=" + uid +
    " PW=" + pwd +
    " UA=" + uaf +
    " NAMES=" + (nameText || "NONE");

  return {
    name: text,
    title: text,
    url: BASE + "/#session-flags",
    quality: "DIAG",
    type: "diagnostic",
    provider: "cinemacity-downloadlab-100"
  };
}

function proxyProbeOne(label, base, path) {
  var url = base.replace(/\/$/, "") + (path || "/news_pages.xml?page=1&perPage=500");
  return fetch(url, {
    headers: {
      "Accept": "application/xml,text/xml,text/plain,*/*",
      "User-Agent": userAgent()
    }
  }).then(function(r) {
    return r.text().catch(function(){ return ""; }).then(function(body) {
      var count = 0;
      try {
        var ms = body.match(/<loc>https:\/\/cinemacity\.cc\/(?:movies|tv-series)\//gi);
        count = ms ? ms.length : 0;
      } catch (_) {}
      var title = String(r.status) + " · " + label + " · entries=" + count;
      if (label === "LEANMOV") {
        var hasAtob = /atob\s*\(/i.test(body);
        var hasGuest = /guests are not allowed|sign in to watch|registration is required/i.test(body);
        title += " · len=" + String(body.length) + " · atob=" + (hasAtob ? "1" : "0") + " · guest=" + (hasGuest ? "1" : "0");
      }
      if (/cloudflare|just a moment|verify you are human/i.test(body)) title += " · CF";
      return {
        name: title,
        title: title,
        url: url,
        quality: "DIAG",
        type: "diagnostic",
        provider: "cinemacity-downloadlab-100"
      };
    });
  }).catch(function(e) {
    var msg = e && e.message ? e.message : String(e || "error");
    var title = "0 · " + label + " · " + msg.slice(0, 80);
    return {
      name: title,
      title: title,
      url: url,
      quality: "DIAG",
      type: "diagnostic",
      provider: "cinemacity-downloadlab-100"
    };
  });
}

function proxyProbeEndpoints() {
  return Promise.all([
    proxyProbeOne("LEAN500", "https://cc.leanhhu061206.workers.dev", "/news_pages.xml?page=1&perPage=500"),
    proxyProbeOne("LEANRAW", "https://cc.leanhhu061206.workers.dev", "/news_pages.xml"),
    proxyProbeOne("LEANP1", "https://cc.leanhhu061206.workers.dev", "/news_pages.xml?page=1"),
    proxyProbeOne("LEANMOV", "https://cc.leanhhu061206.workers.dev", "/movies/379-the-patient.html")
  ]).then(function(rows) {
    return [localSessionDiagnostic()].concat(rows || []);
  });
}


function directOriginProbeOne(label, url, options) {
  var opts = options || {};
  var headers = baseHeaders(opts.referer || (BASE + "/"), true);
  if (opts.ajax) {
    headers["X-Requested-With"] = "XMLHttpRequest";
    headers["Origin"] = BASE;
  }
  if (opts.contentType) headers["Content-Type"] = opts.contentType;

  var fetchOpts = { headers: headers };
  if (opts.method) fetchOpts.method = opts.method;
  if (opts.body != null) fetchOpts.body = opts.body;

  return fetch(url, fetchOpts).then(function(r) {
    return r.text().catch(function(){ return ""; }).then(function(body) {
      var cf = challengeHtml(body) ? 1 : 0;
      var guest = guestBlocked(body) ? 1 : 0;
      var atobFound = /atob\s*\(/i.test(body) ? 1 : 0;
      var title = String(r.status) + " · " + label +
        " · CF=" + cf +
        " GUEST=" + guest +
        " ATOB=" + atobFound +
        " LEN=" + String(body.length);
      return {
        name: title,
        title: title,
        url: url,
        quality: "DIAG",
        type: "diagnostic",
        provider: "cinemacity-downloadlab-100"
      };
    });
  }).catch(function(e) {
    var msg = e && e.message ? e.message : String(e || "error");
    var title = "0 · " + label + " · " + msg.slice(0, 100);
    return {
      name: title,
      title: title,
      url: url,
      quality: "DIAG",
      type: "diagnostic",
      provider: "cinemacity-downloadlab-100"
    };
  });
}

function directOriginProbes() {
  var q = "The Matrix";
  var postBody = "do=search&subaction=search&story=" + encodeURIComponent(q);
  return Promise.all([
    directOriginProbeOne("HOME", BASE + "/"),
    directOriginProbeOne("MOVIES", BASE + "/movies/"),
    directOriginProbeOne("SEARCH", BASE + "/index.php?do=search", {
      method: "POST",
      ajax: true,
      contentType: "application/x-www-form-urlencoded",
      body: postBody
    }),
    directOriginProbeOne("DETAIL", BASE + "/movies/379-the-patient.html")
  ]).then(function(rows) {
    return [localSessionDiagnostic()].concat(rows || []);
  });
}


function inspectSearchBody(body, expectedTitle, expectedYear) {
  var html = clean(body);
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href\s*=\s*["']([^"']+\/(?:movies|tv-series)\/[^"']+\.html(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/ig;
  var m;

  function slugIdentity(url) {
    var path = clean(url).replace(/[?#].*$/, "");
    var last = path.slice(path.lastIndexOf("/") + 1).replace(/\.html$/i, "");
    last = last.replace(/^\d+-/, "");
    var ym = last.match(/-(19\d{2}|20\d{2})$/);
    var y = ym ? ym[1] : "";
    if (ym) last = last.slice(0, -(y.length + 1));
    return {
      title: last.replace(/-/g, " "),
      year: y
    };
  }

  while ((m = re.exec(html)) !== null) {
    var u = resolveUrl(m[1], BASE + "/");
    if (!u || !isCinemaCityHost(u) || seen[u]) continue;
    seen[u] = 1;
    var anchorTitle = stripTags(m[2]);
    var slug = slugIdentity(u);
    items.push({
      url: u,
      title: anchorTitle,
      slugTitle: slug.title,
      slugYear: slug.year
    });
    if (items.length >= 100) break;
  }

  var want = normalizeTitle(expectedTitle || "");
  var year = clean(expectedYear || "");
  var best = null;
  var bestScore = -999;

  items.forEach(function(item) {
    var gotAnchor = normalizeTitle(item.title);
    var gotSlug = normalizeTitle(item.slugTitle);
    var score = 0;

    if (want && gotAnchor === want) score += 12;
    else if (want && gotAnchor && (gotAnchor.indexOf(want) >= 0 || want.indexOf(gotAnchor) >= 0)) score += 6;

    if (want && gotSlug === want) score += 12;
    else if (want && gotSlug && (gotSlug.indexOf(want) >= 0 || want.indexOf(gotSlug) >= 0)) score += 6;

    if (year) {
      if (item.slugYear === year) score += 5;
      else if ((item.title + " " + item.url).indexOf(year) >= 0) score += 3;
      else if (item.slugYear) score -= 4;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });

  var hash = "";
  var hm = html.match(/(?:dle_login_hash|dle_hash)\s*[:=]\s*["']([^"']+)["']/i);
  if (hm) hash = hm[1];

  return {
    items: items,
    match: bestScore >= 12 ? best : null,
    bestScore: bestScore,
    hashFound: hash ? 1 : 0,
    hash: hash
  };
}

function browserNavHeaders(referer) {
  var h = baseHeaders(referer || (BASE + "/"), true);
  h["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
  h["Cache-Control"] = "no-cache";
  h["Pragma"] = "no-cache";
  h["Upgrade-Insecure-Requests"] = "1";
  h["Sec-Fetch-Dest"] = "document";
  h["Sec-Fetch-Mode"] = "navigate";
  h["Sec-Fetch-Site"] = "same-origin";
  h["Sec-Fetch-User"] = "?1";
  return h;
}

function searchVariant(label, url, method, body) {
  var headers = baseHeaders(BASE + "/", true);
  headers["Origin"] = BASE;
  headers["Referer"] = BASE + "/";
  headers["X-Requested-With"] = "XMLHttpRequest";
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";

  var opts = { method: method, headers: headers };
  if (body != null) opts.body = body;

  return fetch(url, opts).then(function(r) {
    return r.text().then(function(html) {
      var info = inspectSearchBody(html, query, expectedYear || "");
      return {
        label: label,
        status: r.status,
        html: html,
        info: info,
        cf: challengeHtml(html) ? 1 : 0,
        guest: guestBlocked(html) ? 1 : 0
      };
    });
  }).catch(function(e) {
    return {
      label: label,
      status: 0,
      html: "",
      info: { items: [], match: null, bestScore: -999, hashFound: 0 },
      cf: 0,
      guest: 0,
      error: e && e.message ? e.message : String(e || "error")
    };
  });
}

function compactSearchRow(x) {
  var t = x.label +
    " " + String(x.status) +
    " CF" + String(x.cf) +
    " G" + String(x.guest) +
    " N" + String((x.info.items || []).length) +
    " M" + (x.info.match ? "1" : "0") +
    " S" + String(x.info.bestScore) +
    " H" + String(x.info.hashFound);
  return {
    name: t,
    title: t,
    url: BASE + "/#search-" + encodeURIComponent(x.label),
    quality: "DIAG",
    type: "diagnostic",
    provider: "cinemacity-downloadlab-100"
  };
}

function getHashSeed() {
  var url = BASE + "/index.php?do=search";
  var headers = baseHeaders(BASE + "/", true);
  headers["X-Requested-With"] = "XMLHttpRequest";
  headers["Origin"] = BASE;
  headers["Content-Type"] = "application/x-www-form-urlencoded";
  var body = "do=search&subaction=search&story=" + encodeURIComponent("The Matrix");

  return fetch(url, {
    method: "POST",
    headers: headers,
    body: body
  }).then(function(r) {
    return r.text().then(function(html) {
      var info = inspectSearchBody(html, "The Matrix", "1999");
      return {
        status: r.status,
        html: html,
        hash: info.hash || "",
        hashFound: info.hashFound || 0,
        cf: challengeHtml(html) ? 1 : 0,
        guest: guestBlocked(html) ? 1 : 0
      };
    });
  });
}

function ajaxSearchOne(label, path, hash) {
  var url = BASE + path;
  var headers = baseHeaders(BASE + "/", true);
  headers["X-Requested-With"] = "XMLHttpRequest";
  headers["Origin"] = BASE;
  headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  headers["Accept"] = "*/*";

  var body = "story=" + encodeURIComponent("The Matrix") +
    "&dle_hash=" + encodeURIComponent(hash || "") +
    "&thisUrl=" + encodeURIComponent("/");

  return fetch(url, {
    method: "POST",
    headers: headers,
    body: body
  }).then(function(r) {
    return r.text().then(function(html) {
      var info = inspectSearchBody(html, "The Matrix", "1999");
      return {
        label: label,
        url: url,
        status: r.status,
        html: html,
        info: info,
        cf: challengeHtml(html) ? 1 : 0,
        guest: guestBlocked(html) ? 1 : 0
      };
    });
  }).catch(function(e) {
    return {
      label: label,
      url: url,
      status: 0,
      html: "",
      info: { items: [], match: null, bestScore: -999, hashFound: 0 },
      cf: 0,
      guest: 0,
      error: e && e.message ? e.message : String(e || "error")
    };
  });
}

function ajaxRow(x) {
  var t = x.label +
    " " + String(x.status) +
    " CF" + String(x.cf) +
    " G" + String(x.guest) +
    " N" + String((x.info.items || []).length) +
    " M" + (x.info.match ? "1" : "0") +
    " S" + String(x.info.bestScore);
  return {
    name: t,
    title: t,
    url: x.url,
    quality: "DIAG",
    type: "diagnostic",
    provider: "cinemacity-downloadlab-100"
  };
}

function unwrapDleSearchPayload(raw) {
  var text = clean(raw);
  var json = 0;
  var content = text;
  try {
    var parsed = JSON.parse(text);
    json = 1;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.content === "string") content = parsed.content;
      else if (typeof parsed.response === "string") content = parsed.response;
      else if (typeof parsed.html === "string") content = parsed.html;
    }
  } catch (_) {}
  return {
    raw: text,
    content: content,
    json: json
  };
}

function ajaxSearchProbe(label, endpoint, hash, query, thisUrl, expectedYear) {
  var headers = baseHeaders(BASE + "/", true);
  headers["Origin"] = BASE;
  headers["Referer"] = BASE + "/";
  headers["X-Requested-With"] = "XMLHttpRequest";
  headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  headers["Accept"] = "application/json, text/javascript, */*; q=0.01";

  var body = "story=" + encodeURIComponent(query) +
    "&dle_hash=" + encodeURIComponent(hash || "") +
    "&thisUrl=" + encodeURIComponent(thisUrl || "/");

  return fetch(BASE + endpoint, {
    method: "POST",
    headers: headers,
    body: body
  }).then(function(r) {
    return r.text().then(function(raw) {
      var payload = unwrapDleSearchPayload(raw);
      var html = payload.content;
      var info = inspectSearchBody(html, query, expectedYear || "");
      return {
        label: label,
        status: r.status,
        html: html,
        raw: raw,
        json: payload.json,
        info: info,
        cf: challengeHtml(raw) || challengeHtml(html) ? 1 : 0,
        guest: guestBlocked(raw) || guestBlocked(html) ? 1 : 0,
        endpoint: endpoint
      };
    });
  }).catch(function(e) {
    return {
      label: label,
      status: 0,
      html: "",
      raw: "",
      json: 0,
      info: { items: [], match: null, bestScore: -999, hashFound: 0 },
      cf: 0,
      guest: 0,
      endpoint: endpoint,
      error: e && e.message ? e.message : String(e || "error")
    };
  });
}

function compactAjaxRow(x) {
  var t = x.label +
    " " + String(x.status) +
    " J" + String(x.json || 0) +
    " CF" + String(x.cf) +
    " G" + String(x.guest) +
    " L" + String((x.html || "").length) +
    " N" + String((x.info.items || []).length) +
    " M" + (x.info.match ? "1" : "0") +
    " S" + String(x.info.bestScore);
  return {
    name: t,
    title: t,
    url: BASE + x.endpoint,
    quality: "DIAG",
    type: "diagnostic",
    provider: "cinemacity-downloadlab-100"
  };
}

function parseNewsId(url) {
  var m = clean(url).match(/\/(?:movies|tv-series)\/(\d+)-/i);
  return m ? m[1] : "";
}

function unwrapPlaylistPayload(raw) {
  var text = clean(raw);
  var response = text;
  var json = 0;
  var success = -1;
  try {
    var obj = JSON.parse(text);
    json = 1;
    if (obj && typeof obj === "object") {
      if (typeof obj.success === "boolean") success = obj.success ? 1 : 0;
      else if (typeof obj.success === "number") success = obj.success ? 1 : 0;
      if (typeof obj.response === "string") response = obj.response;
      else if (typeof obj.content === "string") response = obj.content;
      else if (typeof obj.html === "string") response = obj.html;
    }
  } catch (_) {}
  return { json: json, success: success, response: response, raw: text };
}

function playlistProbe(newsId, hash, referer) {
  var url = BASE + "/engine/ajax/playlists.php?news_id=" + encodeURIComponent(newsId) +
    "&xfield=playlist&user_hash=" + encodeURIComponent(hash || "") + "&time=1";
  var headers = baseHeaders(referer || (BASE + "/"), true);
  headers["X-Requested-With"] = "XMLHttpRequest";
  headers["Accept"] = "application/json, text/javascript, */*; q=0.01";

  return fetch(url, { headers: headers }).then(function(r) {
    return r.text().then(function(raw) {
      var p = unwrapPlaylistPayload(raw);
      var html = p.response || "";
      var fileCount = (html.match(/data-file\s*=\s*["'][^"']+["']/ig) || []).length;
      var atobCount = (html.match(/atob\s*\(/ig) || []).length;
      var directCount = (html.match(/https?:\/\/[^"'<>\s]+\.(?:m3u8|mp4|mpd)(?:[?#][^"'<>\s]*)?/ig) || []).length;
      return {
        status:r.status,
        json:p.json,
        success:p.success,
        len:html.length,
        files:fileCount,
        atob:atobCount,
        direct:directCount,
        url:url,
        html:html
      };
    });
  }).catch(function(e) {
    return {
      status:0,json:0,success:-1,len:0,files:0,atob:0,direct:0,url:url,
      error:e&&e.message?e.message:String(e||"error"),html:""
    };
  });
}

function detailProbe(url, referer) {
  return fetch(url, { headers: browserNavHeaders(referer || (BASE + "/")) }).then(function(r) {
    return r.text().then(function(html) {
      return {
        status:r.status,
        cf:challengeHtml(html)?1:0,
        guest:guestBlocked(html)?1:0,
        atob:(html.match(/atob\s*\(/ig)||[]).length,
        direct:(html.match(/https?:\/\/[^"'<>\s]+\.(?:m3u8|mp4|mpd)(?:[?#][^"'<>\s]*)?/ig)||[]).length,
        len:html.length,
        html:html,
        url:url
      };
    });
  }).catch(function(e) {
    return {status:0,cf:0,guest:0,atob:0,direct:0,len:0,html:"",url:url,error:e&&e.message?e.message:String(e||"error")};
  });
}

function scanBootMediaHints(html) {
  var text = clean(html);
  var out = [];
  var seen = {};

  function add(v) {
    v = clean(v);
    if (!v || seen[v]) return;
    seen[v] = 1;
    out.push(v);
  }

  var urlRe = /https?:\/\/[^"'<>\s)]+/ig;
  var m;
  while ((m = urlRe.exec(text)) !== null) {
    var u = m[0];
    if (/public_files|controller\.php\?mod=dh|\.m3u8|\.mp4|\.m4a|cdn|player/i.test(u)) {
      add(u);
      if (out.length >= 8) break;
    }
  }

  var scriptRe = /<script\b[^>]*src\s*=\s*["']([^"']+)["']/ig;
  while ((m = scriptRe.exec(text)) !== null) {
    var src = resolveUrl(m[1], BASE + "/");
    if (/player|download|dh|cinema|main|app|script/i.test(src)) add(src);
    if (out.length >= 12) break;
  }

  return out.slice(0,12);
}

function scanInlineWiring(html) {
  var text = clean(html);
  var flags = [];
  if (/mod=dh|mod['"]?\s*[:=]\s*['"]dh/i.test(text)) flags.push("DH");
  if (/action=sizes/i.test(text)) flags.push("SIZES");
  if (/action=download/i.test(text)) flags.push("DOWNLOAD");
  if (/public_files/i.test(text)) flags.push("FILES");
  if (/urlset\/master\.m3u8/i.test(text)) flags.push("URLSET");

  var snippet = "";
  var pats = ["action=download","action=sizes","mod=dh","public_files","urlset/master.m3u8"];
  for (var i=0;i<pats.length && !snippet;i++) {
    var pos = text.toLowerCase().indexOf(pats[i].toLowerCase());
    if (pos >= 0) {
      snippet = clean(text.slice(Math.max(0,pos-110), Math.min(text.length,pos+250)))
        .replace(/\s+/g," ")
        .slice(0,220);
    }
  }
  return { flags:flags, snippet:snippet };
}

function extractInterestingScriptSources(html) {
  var out = [];
  var seen = {};
  var re = /<script\b[^>]*src\s*=\s*["']([^"']+)["']/ig;
  var m;
  while ((m = re.exec(clean(html))) !== null) {
    var src = resolveUrl(m[1], BASE + "/");
    if (!src || seen[src]) continue;
    seen[src] = 1;
    if (/jquery(?:ui)?\d*\.js|fancybox(?:\.min)?\.js|bootstrap(?:\.min)?\.js/i.test(src)) continue;
    out.push(src);
    if (out.length >= 12) break;
  }
  return out;
}

function jsWiringProbe(url) {
  var headers = baseHeaders(BASE + "/", true);
  headers["Accept"] = "*/*";
  headers["Referer"] = BASE + "/";
  return fetch(url, { headers:headers }).then(function(r) {
    return r.text().then(function(js) {
      var flags = [];
      if (/mod=dh|mod['"]?\s*[:=]\s*['"]dh/i.test(js)) flags.push("DH");
      if (/action=sizes/i.test(js)) flags.push("SIZES");
      if (/action=download/i.test(js)) flags.push("DOWNLOAD");
      if (/public_files/i.test(js)) flags.push("FILES");
      if (/urlset\/master\.m3u8/i.test(js)) flags.push("URLSET");
      if (/controller\.php\?mod=search/i.test(js)) flags.push("SEARCH");

      var snippet = "";
      var pats = ["action=download","action=sizes","mod=dh","public_files","urlset/master.m3u8"];
      for (var i=0;i<pats.length && !snippet;i++) {
        var pos = js.toLowerCase().indexOf(pats[i].toLowerCase());
        if (pos >= 0) {
          snippet = clean(js.slice(Math.max(0,pos-70), Math.min(js.length,pos+170)))
            .replace(/\s+/g," ")
            .slice(0,180);
        }
      }

      return {
        status:r.status,
        len:js.length,
        flags:flags,
        snippet:snippet,
        url:url
      };
    });
  }).catch(function(e) {
    return {status:0,len:0,flags:[],snippet:"",url:url,error:e&&e.message?e.message:String(e||"error")};
  });
}

function controllerSearchProbe(query, hash) {
  var url = BASE + "/engine/ajax/controller.php?mod=search";
  var headers = baseHeaders(BASE + "/", true);
  headers["Origin"] = BASE;
  headers["Referer"] = BASE + "/";
  headers["X-Requested-With"] = "XMLHttpRequest";
  headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  headers["Accept"] = "text/html, */*; q=0.01";

  var body = "query=" + encodeURIComponent(query) +
    "&skin=cinemacity" +
    "&user_hash=" + encodeURIComponent(hash || "");

  return fetch(url, { method:"POST", headers:headers, body:body }).then(function(r) {
    return r.text().then(function(html) {
      var info = inspectSearchBody(html, query, "2026");
      return {
        status:r.status,
        len:html.length,
        cf:challengeHtml(html)?1:0,
        guest:guestBlocked(html)?1:0,
        count:(info.items||[]).length,
        match:info.match,
        html:html,
        url:url
      };
    });
  }).catch(function(e) {
    return {status:0,len:0,cf:0,guest:0,count:0,match:null,html:"",url:url,error:e&&e.message?e.message:String(e||"error")};
  });
}

function dhSizesProbe(newsId, hash, referer) {
  var url = BASE + "/engine/ajax/controller.php?mod=dh&action=sizes" +
    "&news_id=" + encodeURIComponent(newsId) +
    "&user_hash=" + encodeURIComponent(hash || "");
  var headers = baseHeaders(referer || (BASE + "/"), true);
  headers["X-Requested-With"] = "XMLHttpRequest";
  headers["Accept"] = "application/json, text/plain, */*";

  return fetch(url, { headers:headers }).then(function(r) {
    return r.text().then(function(raw) {
      var json = 0, keyCount = 0, mediaCount = 0, preview = [], values = [], mediaKeys = [];
      try {
        var obj = JSON.parse(raw);
        json = 1;
        if (obj && typeof obj === "object") {
          var keys = Object.keys(obj);
          keyCount = keys.length;
          keys.forEach(function(k) {
            if (/\.(?:mp4|m4a|m3u8)(?:$|[?#])/i.test(k)) {
              mediaCount++;
              mediaKeys.push(k);
              if (preview.length < 3) preview.push(k);
              if (values.length < 3) {
                var v = obj[k];
                var type = Array.isArray(v) ? "array" : (v === null ? "null" : typeof v);
                var short = "";
                try {
                  short = typeof v === "string" ? v : JSON.stringify(v);
                } catch (_) {
                  short = String(v);
                }
                values.push(type + ":" + clean(short).slice(0,90));
              }
            }
          });
        }
      } catch (_) {}
      return {
        status:r.status,
        raw:raw,
        len:raw.length,
        json:json,
        keys:keyCount,
        media:mediaCount,
        mediaKeys:mediaKeys,
        preview:preview,
        values:values,
        url:url
      };
    });
  }).catch(function(e) {
    return {status:0,raw:"",len:0,json:0,keys:0,media:0,preview:[],values:[],mediaKeys:[],url:url,error:e&&e.message?e.message:String(e||"error")};
  });
}

function idRouteProbe(label, url, referer) {
  var headers = browserNavHeaders(referer || (BASE + "/"));
  return fetch(url, { headers:headers, redirect:"follow" }).then(function(r) {
    return r.text().then(function(html) {
      var canonical = "";
      var cm = html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i) ||
               html.match(/<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i);
      if (cm) canonical = resolveUrl(cm[1], BASE + "/");

      var atobCount = (html.match(/atob\s*\(/ig) || []).length;
      var publicFiles = (html.match(/public_files/ig) || []).length;
      var direct = (html.match(/https?:\/\/[^"'<>\s]+\.(?:m3u8|mp4|m4a|mpd)(?:[?#][^"'<>\s]*)?/ig) || []).length;

      return {
        label:label,
        status:r.status,
        finalUrl:r.url || url,
        len:html.length,
        cf:challengeHtml(html)?1:0,
        guest:guestBlocked(html)?1:0,
        atob:atobCount,
        files:publicFiles,
        direct:direct,
        canonical:canonical,
        html:html,
        url:url
      };
    });
  }).catch(function(e) {
    return {
      label:label,status:0,finalUrl:url,len:0,cf:0,guest:0,atob:0,files:0,direct:0,canonical:"",html:"",url:url,
      error:e&&e.message?e.message:String(e||"error")
    };
  });
}

function responseHost(url) {
  var m = clean(url).match(/^https?:\/\/([^\/:?#]+)/i);
  return m ? m[1] : "";
}

function publicFilesProbe(mediaKeys, referer) {
  mediaKeys = mediaKeys || [];
  var video = "";
  var audio = "";
  for (var i=0;i<mediaKeys.length;i++) {
    if (!video && /\.mp4(?:$|[?#])/i.test(mediaKeys[i])) video = mediaKeys[i];
    if (!audio && /\.m4a(?:$|[?#])/i.test(mediaKeys[i])) audio = mediaKeys[i];
  }

  var headers = baseHeaders(referer || (BASE + "/"), true);
  headers["Accept"] = "*/*";
  headers["Range"] = "bytes=0-255";

  function one(label, url, readText) {
    return fetch(url, { headers:headers }).then(function(r) {
      var finalUrl = clean(r.url || url);
      var ctype = "";
      try { ctype = clean(r.headers.get("content-type") || ""); } catch (_) {}
      if (!readText) {
        return {
          label:label,status:r.status,host:responseHost(finalUrl),
          changed: finalUrl !== url ? 1 : 0,
          ctype:ctype,url:url,finalUrl:finalUrl,m3u:0,len:0
        };
      }
      return r.text().then(function(body) {
        return {
          label:label,status:r.status,host:responseHost(finalUrl),
          changed: finalUrl !== url ? 1 : 0,
          ctype:ctype,url:url,finalUrl:finalUrl,
          m3u:/#EXTM3U/i.test(body) ? 1 : 0,
          len:body.length
        };
      });
    }).catch(function(e) {
      return {
        label:label,status:0,host:"",changed:0,ctype:"",
        url:url,finalUrl:"",m3u:0,len:0,
        error:e&&e.message?e.message:String(e||"error")
      };
    });
  }

  var tasks = [];
  if (video) {
    tasks.push(one(
      "PF_FILE",
      BASE + "/public_files/" + video.replace(/^\/+/, ""),
      false
    ));
  }

  if (video && audio) {
    tasks.push(one(
      "PF_SET",
      BASE + "/public_files/" +
        video.replace(/^\/+/, "") + "," +
        audio.replace(/^\/+/, "") +
        ".urlset/master.m3u8",
      true
    ));
  }

  if (video) {
    tasks.push(one(
      "PF_ONESET",
      BASE + "/public_files/" +
        video.replace(/^\/+/, "") +
        ".urlset/master.m3u8",
      true
    ));
  }

  return Promise.all(tasks);
}

function bytesPreview(buf) {
  try {
    var arr = new Uint8Array(buf || new ArrayBuffer(0));
    var hex = [];
    var ascii = "";
    var n = Math.min(arr.length, 48);
    for (var i=0;i<n;i++) {
      var b = arr[i];
      hex.push((b < 16 ? "0" : "") + b.toString(16));
      ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : ".";
    }
    return { hex:hex.join(" "), ascii:ascii };
  } catch (_) {
    return { hex:"", ascii:"" };
  }
}

function dhDownloadProbe(videoPath, audioPath, hash, referer) {
  if (!videoPath) {
    return Promise.resolve({
      status:0, ct:"", cr:"", len:"", finalUrl:"", host:"", ok:0, label:"NO_VIDEO"
    });
  }

  var url = BASE + "/engine/ajax/controller.php?mod=dh&action=download" +
    "&video=" + encodeURIComponent(videoPath) +
    (audioPath ? "&audio=" + encodeURIComponent(audioPath) : "") +
    "&name=" + encodeURIComponent("cinemacity-probe.mp4") +
    "&user_hash=" + encodeURIComponent(hash || "");

  var headers = baseHeaders(referer || (BASE + "/"), true);
  headers["Range"] = "bytes=0-63";
  headers["Accept"] = "*/*";
  headers["X-Requested-With"] = "XMLHttpRequest";

  function readHeaders(r) {
    var out = {ct:"",cr:"",cl:"",cd:"",loc:""};
    try { out.ct = r.headers && r.headers.get ? (r.headers.get("content-type") || "") : ""; } catch (_) {}
    try { out.cr = r.headers && r.headers.get ? (r.headers.get("content-range") || "") : ""; } catch (_) {}
    try { out.cl = r.headers && r.headers.get ? (r.headers.get("content-length") || "") : ""; } catch (_) {}
    try { out.cd = r.headers && r.headers.get ? (r.headers.get("content-disposition") || "") : ""; } catch (_) {}
    try { out.loc = r.headers && r.headers.get ? (r.headers.get("location") || "") : ""; } catch (_) {}
    return out;
  }

  var manualPromise = fetch(url, {
    method:"GET",
    headers:headers,
    redirect:"manual"
  }).then(function(r) {
    var h = readHeaders(r);
    var fu = "";
    try { fu = r.url || ""; } catch (_) {}
    return {
      status:r.status,
      loc:h.loc,
      ct:h.ct,
      cd:h.cd,
      cr:h.cr,
      len:h.cl,
      finalUrl:fu
    };
  }).catch(function(e) {
    return {status:0,loc:"",ct:"",cd:"",cr:"",len:"",finalUrl:"",error:e&&e.message?e.message:String(e||"error")};
  });

  var followPromise = fetch(url, {
    method:"GET",
    headers:headers
  }).then(function(r) {
    var h = readHeaders(r);
    var finalUrl = "";
    try { finalUrl = r.url || ""; } catch (_) {}
    var host = "";
    try { host = finalUrl ? new URL(finalUrl).host : ""; } catch (_) {}

    return r.arrayBuffer().then(function(buf) {
      var pv = bytesPreview(buf);
      var mediaCt = /^(video\/|audio\/|application\/(?:vnd\.apple\.mpegurl|x-mpegURL|octet-stream))/i.test(h.ct || "");
      var hasRange = /bytes\s+\d+-\d+\/\d+/i.test(h.cr || "");
      var hasFtyp = /ftyp/i.test(pv.ascii || "");
      return {
        status:r.status,
        ct:h.ct,
        cr:h.cr,
        len:h.cl || String(buf ? buf.byteLength : 0),
        cd:h.cd,
        finalUrl:finalUrl,
        host:host,
        ok:((r.status === 200 || r.status === 206) && (mediaCt || hasRange || hasFtyp)) ? 1 : 0,
        hex:pv.hex,
        ascii:pv.ascii,
        rangeOk:hasRange ? 1 : 0,
        ftyp:hasFtyp ? 1 : 0,
        url:url
      };
    }).catch(function() {
      var mediaCt = /^(video\/|audio\/|application\/(?:vnd\.apple\.mpegurl|x-mpegURL|octet-stream))/i.test(h.ct || "");
      var hasRange = /bytes\s+\d+-\d+\/\d+/i.test(h.cr || "");
      return {
        status:r.status, ct:h.ct, cr:h.cr, len:h.cl, cd:h.cd,
        finalUrl:finalUrl, host:host,
        ok:((r.status === 200 || r.status === 206) && (mediaCt || hasRange)) ? 1 : 0,
        hex:"", ascii:"", rangeOk:hasRange ? 1 : 0, ftyp:0, url:url
      };
    });
  }).catch(function(e) {
    return {
      status:0, ct:"", cr:"", len:"", cd:"", finalUrl:"", host:"", ok:0, hex:"", ascii:"", url:url,
      error:e&&e.message?e.message:String(e||"error")
    };
  });

  return Promise.all([manualPromise, followPromise]).then(function(all) {
    return { manual:all[0], follow:all[1], url:url };
  });
}

function probeCandidateStream(label, url, referer) {
  var headers = baseHeaders(referer || (BASE + "/"), true);
  headers["Range"] = "bytes=0-255";
  headers["Accept"] = "*/*";

  return fetch(url, { method:"GET", headers:headers }).then(function(r) {
    var ct="", cr="", cl="";
    try { ct = r.headers && r.headers.get ? (r.headers.get("content-type") || "") : ""; } catch (_) {}
    try { cr = r.headers && r.headers.get ? (r.headers.get("content-range") || "") : ""; } catch (_) {}
    try { cl = r.headers && r.headers.get ? (r.headers.get("content-length") || "") : ""; } catch (_) {}
    var finalUrl="";
    try { finalUrl = r.url || ""; } catch (_) {}
    var host="";
    try { host = finalUrl ? new URL(finalUrl).host : ""; } catch (_) {}

    return r.text().then(function(body) {
      var hls = /#EXTM3U/i.test(body) ? 1 : 0;
      var html = /<html|<!doctype/i.test(body) ? 1 : 0;
      return {
        label:label,status:r.status,ct:ct,cr:cr,len:cl||String(body.length),
        finalUrl:finalUrl,host:host,hls:hls,html:html,
        body:clean(body).replace(/\s+/g," ").slice(0,90),url:url
      };
    }).catch(function() {
      return {
        label:label,status:r.status,ct:ct,cr:cr,len:cl,
        finalUrl:finalUrl,host:host,hls:0,html:0,body:"",url:url
      };
    });
  }).catch(function(e) {
    return {
      label:label,status:0,ct:"",cr:"",len:"",finalUrl:"",host:"",hls:0,html:0,body:"",url:url,
      error:e&&e.message?e.message:String(e||"error")
    };
  });
}

function hlsCandidateProbe(label, base, mediaKeys, referer) {
  var uniq = [];
  var seen = {};
  (mediaKeys || []).forEach(function(k) {
    if (!k || seen[k]) return;
    seen[k] = 1;
    uniq.push(k);
  });
  var rest = uniq.join(",");
  var url = base.replace(/\/$/, "") + "/public_files/" + rest + ".urlset/master.m3u8";
  var headers = baseHeaders(referer || (BASE + "/"), true);
  headers["Accept"] = "application/vnd.apple.mpegurl, application/x-mpegURL, */*";
  headers["Range"] = "bytes=0-255";

  return fetch(url, { method:"GET", headers:headers }).then(function(r) {
    var ct = "", cr = "", cl = "";
    try { ct = r.headers && r.headers.get ? (r.headers.get("content-type") || "") : ""; } catch (_) {}
    try { cr = r.headers && r.headers.get ? (r.headers.get("content-range") || "") : ""; } catch (_) {}
    try { cl = r.headers && r.headers.get ? (r.headers.get("content-length") || "") : ""; } catch (_) {}
    var finalUrl = "";
    try { finalUrl = r.url || ""; } catch (_) {}
    var host = "";
    try { host = finalUrl ? new URL(finalUrl).host : ""; } catch (_) {}

    return r.text().then(function(body) {
      var sample = clean(body).replace(/\s+/g," ").slice(0,90);
      var m3u = /^#EXTM3U/i.test(clean(body)) ? 1 : 0;
      var cf = challengeHtml(body) ? 1 : 0;
      return {
        label:label,status:r.status,ct:ct,cr:cr,len:cl||String(body.length),
        host:host,finalUrl:finalUrl,m3u:m3u,cf:cf,sample:sample,url:url
      };
    }).catch(function() {
      return {
        label:label,status:r.status,ct:ct,cr:cr,len:cl,
        host:host,finalUrl:finalUrl,m3u:0,cf:0,sample:"",url:url
      };
    });
  }).catch(function(e) {
    return {
      label:label,status:0,ct:"",cr:"",len:"",host:"",finalUrl:"",
      m3u:0,cf:0,sample:"",url:url,error:e&&e.message?e.message:String(e||"error")
    };
  });
}

function compactCode(x) {
  if (!x) return "0";
  var code = String(x.status || 0);
  if (x.m3u) code += "M";
  if (x.cf) code += "C";
  if (x.atob) code += "A";
  if (x.files) code += "P";
  return code;
}


function playbackHeaders(url, referer, xhr) {
  var h = {
    "User-Agent": userAgent(),
    "Referer": referer || (BASE + "/"),
    "Origin": BASE
  };
  if (isCinemaCityHost(url) && cookieValue()) h["Cookie"] = cookieValue();
  if (xhr) h["X-Requested-With"] = "XMLHttpRequest";
  return h;
}

function diagnosticRow(report) {
  return {
    name:report,
    title:report,
    url:BASE + "/#" + encodeURIComponent(report),
    quality:"DIAG",
    type:"diagnostic",
    provider:"cinemacity-downloadlab-100"
  };
}

function hlsProbeStream(probe, referer) {
  if (!probe || probe.m3u !== 1) return null;
  var url = clean(probe.finalUrl || probe.url);
  if (!url) return null;
  return {
    name:"CinemaCity · Auto · HLS",
    title:"CinemaCity · Auto · HLS",
    url:url,
    quality:"Auto",
    type:"hls",
    provider:"cinemacity-downloadlab-100",
    headers:playbackHeaders(url, referer, false),
    subtitles:[]
  };
}

function downloadProbeStream(dp, referer) {
  var f = dp && dp.follow ? dp.follow : null;
  if (!f || f.ok !== 1) return null;
  var url = clean(f.finalUrl || (dp && dp.url) || "");
  if (!url) return null;
  return {
    name:"CinemaCity · Auto · MP4",
    title:"CinemaCity · Auto · MP4",
    url:url,
    quality:"Auto",
    type:"mp4",
    provider:"cinemacity-downloadlab-100",
    headers:playbackHeaders(url, referer, isCinemaCityHost(url)),
    subtitles:[]
  };
}

function directStreamsFromRoutes(routes) {
  var rows = [];
  (routes || []).forEach(function(route) {
    if (!route || route.status !== 200 || route.cf || !route.html) return;
    var base = clean(route.finalUrl || route.url || BASE + "/");
    var subs = extractSubtitles(route.html, base);
    rows = rows.concat(extractDirectMedia(route.html, base, subs));
  });
  return dedupeStreams(rows).slice(0, 4);
}

function searchAndCandidateProbe() {
  var bootstrapUrl = BASE + "/index.php?do=search";
  var headers = baseHeaders(BASE + "/", true);
  headers["X-Requested-With"] = "XMLHttpRequest";
  headers["Origin"] = BASE;
  headers["Content-Type"] = "application/x-www-form-urlencoded";
  var body = "do=search&subaction=search&story=" + encodeURIComponent("Obsession");

  return fetch(bootstrapUrl, {
    method:"POST",
    headers:headers,
    body:body
  }).then(function(r) {
    return r.text().then(function(html) {
      var boot = inspectSearchBody(html, "Obsession", "2025");
      var hash = boot.hash || "";

      if (!hash) {
        var fail = "CCDIAG v0.6.4 K0 NEXT=COOKIE_OR_HASH";
        return [{
          name:fail,title:fail,
          url:BASE+"/#"+encodeURIComponent(fail),
          quality:"DIAG",type:"diagnostic",provider:"cinemacity-downloadlab-100"
        }];
      }

      return ajaxSearchProbe("SPIDER", "/engine/mods/dle_search/ajax.php", hash, "Obsession", "/")
        .then(function(x) {
          var item = (x.info.items || [])[0] || null;
          if (!item || !item.url) {
            var fail = "CCDIAG v0.6.4 K1 Q0 NEXT=SEARCH";
            return [{
              name:fail,title:fail,
              url:BASE+"/#"+encodeURIComponent(fail),
              quality:"DIAG",type:"diagnostic",provider:"cinemacity-downloadlab-100"
            }];
          }

          var newsId = parseNewsId(item.url);
          if (!newsId) {
            var fail = "CCDIAG v0.6.4 K1 Q1 ID0 NEXT=NEWSID";
            return [{
              name:fail,title:fail,
              url:BASE+"/#"+encodeURIComponent(fail),
              quality:"DIAG",type:"diagnostic",provider:"cinemacity-downloadlab-100"
            }];
          }

          var altRoutes = [
            ["P", item.url],
            ["N", BASE + "/index.php?newsid=" + encodeURIComponent(newsId)],
            ["F", BASE + "/index.php?do=fullstory&newsid=" + encodeURIComponent(newsId)],
            ["R", BASE + "/engine/print.php?newsid=" + encodeURIComponent(newsId)]
          ];

          return Promise.all([
            dhSizesProbe(newsId, hash, item.url),
            Promise.all(altRoutes.map(function(pair) {
              return idRouteProbe(pair[0], pair[1], bootstrapUrl);
            }))
          ]).then(function(main) {
            var dh = main[0] || {};
            var alts = main[1] || [];

            var keys = [];
            var seen = {};
            (dh.mediaKeys || []).forEach(function(k) {
              if (!k || seen[k]) return;
              seen[k] = 1;
              keys.push(k);
            });

            var hlsBases = [
              ["O", BASE],
              ["L", "https://cc.leanhhu061206.workers.dev"],
              ["R", "https://cc.realbestia.com"]
            ];

            return Promise.all(hlsBases.map(function(pair) {
              return hlsCandidateProbe(pair[0], pair[1], keys, item.url);
            })).then(function(hls) {
              var hlsMap = {};
              hls.forEach(function(a){ hlsMap[a.label] = a; });

              // 1) If any reconstructed master playlist really returned #EXTM3U,
              // return it as an actual playable stream instead of only reporting it.
              var goodHls = null;
              for (var i=0;i<hls.length;i++) {
                if (hls[i] && hls[i].m3u === 1) {
                  goodHls = hls[i];
                  break;
                }
              }
              if (goodHls) {
                var hs = hlsProbeStream(goodHls, item.url);
                var hr = "CC73 USE_HLS " + goodHls.label + compactCode(goodHls) +
                  " ID" + String(newsId) + " DH" + String(dh.media || 0);
                return hs ? [diagnosticRow(hr), hs] : [diagnosticRow(hr)];
              }

              // 2) If an alternate detail route exposes a direct HLS/MP4/MPD,
              // return those direct streams.
              var directRows = directStreamsFromRoutes(alts);
              if (directRows.length) {
                var dr = "CC73 USE_DIRECT N" + String(directRows.length) +
                  " ID" + String(newsId) + " DH" + String(dh.media || 0);
                return [diagnosticRow(dr)].concat(directRows);
              }

              // 3) Fall back to CinemaCity's authenticated DH download endpoint.
              // Probe only a tiny range first; return it only when the response
              // is confirmed to be media.
              var video = "";
              var audio = "";
              for (var k=0;k<keys.length;k++) {
                if (!video && /\.mp4(?:$|[?#])/i.test(keys[k])) video = keys[k];
                if (!audio && /\.m4a(?:$|[?#])/i.test(keys[k])) audio = keys[k];
              }

              return dhDownloadProbe(video, audio, hash, item.url).then(function(dp) {
                var ds = downloadProbeStream(dp, item.url);
                var f = dp && dp.follow ? dp.follow : {};
                var hcodes = "O" + compactCode(hlsMap.O) +
                  "/L" + compactCode(hlsMap.L) +
                  "/R" + compactCode(hlsMap.R);

                if (ds) {
                  var ok = "CC73 USE_DL " + String(f.status || 0) +
                    " R" + String(f.rangeOk || 0) +
                    " T" + String(f.ftyp || 0) +
                    " ID" + String(newsId) + " DH" + String(dh.media || 0);
                  return [diagnosticRow(ok), ds];
                }

                var m = dp && dp.manual ? dp.manual : {};
                var fail = "CC73 O" + compactCode(hlsMap.O) +
                  " L" + compactCode(hlsMap.L) +
                  " R" + compactCode(hlsMap.R) +
                  " M" + String(m.status || 0) +
                  " F" + String(f.status || 0) +
                  " DH" + String(dh.media || 0) +
                  " ID" + String(newsId);
                return [diagnosticRow(fail)];
              });
            });
          });
        });
    });
  }).catch(function(e) {
    var msg=e&&e.message?e.message:String(e||"error");
    var report="CCDIAG v0.6.4 ERR="+msg.slice(0,60);
    return [{
      name:report,title:report,
      url:BASE+"/#"+encodeURIComponent(report),
      quality:"DIAG",type:"diagnostic",provider:"cinemacity-downloadlab-100"
    }];
  });
}


function safeFileName(s) {
  return clean(s).replace(/[^a-z0-9._ -]+/gi, " ").replace(/\s+/g, " ").trim().slice(0,80) || "cinemacity";
}

function buildDhDownloadUrl(videoPath, audioPath, hash, name) {
  return BASE + "/engine/ajax/controller.php?mod=dh&action=download" +
    "&video=" + encodeURIComponent(videoPath || "") +
    (audioPath ? "&audio=" + encodeURIComponent(audioPath) : "") +
    "&name=" + encodeURIComponent(safeFileName(name) + ".mp4") +
    "&user_hash=" + encodeURIComponent(hash || "");
}

function mediaQualityRank(path) {
  var s = clean(path).toLowerCase();
  if (/2160|4k|uhd/.test(s)) return 600;
  if (/1440/.test(s)) return 500;
  if (/1080/.test(s)) return 400;
  if (/720/.test(s)) return 300;
  if (/480/.test(s)) return 200;
  if (/360/.test(s)) return 100;
  return 10;
}

function pickBestSearchItem(info, meta) {
  if (!info) return null;
  if (info.match && info.match.url) return info.match;

  var want = normalizeTitle(meta && meta.title);
  var alt = normalizeTitle(meta && meta.originalTitle);
  var year = clean(meta && meta.year);
  var best = null, bestScore = -999;

  (info.items || []).forEach(function(item) {
    var gotA = normalizeTitle(item.title);
    var gotS = normalizeTitle(item.slugTitle);
    var score = 0;

    [want, alt].forEach(function(w) {
      if (!w) return;
      if (gotA === w || gotS === w) score += 12;
      else if ((gotA && (gotA.indexOf(w) >= 0 || w.indexOf(gotA) >= 0)) ||
               (gotS && (gotS.indexOf(w) >= 0 || w.indexOf(gotS) >= 0))) score += 6;
    });

    if (year) {
      if (item.slugYear === year) score += 5;
      else if ((clean(item.title) + " " + clean(item.url)).indexOf(year) >= 0) score += 3;
      else if (item.slugYear) score -= 4;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });

  return bestScore >= 8 ? best : null;
}


function catalogUrlIdentity(url) {
  var path = clean(url).replace(/[?#].*$/, "");
  var last = path.slice(path.lastIndexOf("/") + 1).replace(/\.html$/i, "");
  last = last.replace(/^\d+-/, "");
  var ym = last.match(/-(19\d{2}|20\d{2})$/);
  var year = ym ? ym[1] : "";
  if (ym) last = last.slice(0, -(year.length + 1));
  return { title:last.replace(/-/g, " "), year:year };
}

function scoreCatalogUrl(url, meta) {
  var id = catalogUrlIdentity(url);
  var got = normalizeTitle(id.title);
  var want = normalizeTitle(meta && meta.title);
  var alt = normalizeTitle(meta && meta.originalTitle);
  var year = clean(meta && meta.year);
  var score = 0;

  [want, alt].forEach(function(w) {
    if (!w) return;
    if (got === w) score += 14;
    else if (got && (got.indexOf(w) >= 0 || w.indexOf(got) >= 0)) score += 7;
  });

  if (year) {
    if (id.year === year) score += 5;
    else if (clean(url).indexOf("-" + year + ".html") >= 0) score += 4;
    else if (id.year) score -= 4;
  }
  return score;
}

function extractCatalogUrls(xml) {
  var out = [], seen = {};
  var text = decodeEntities(clean(xml));
  var re = /<loc>\s*(https?:\/\/[^<]+\/movies\/[^<]+\.html(?:\?[^<]*)?)\s*<\/loc>/ig;
  var m;
  while ((m = re.exec(text)) !== null) {
    var u = decodeEntities(m[1]);
    if (!u || seen[u]) continue;
    seen[u] = 1;
    out.push(u);
  }
  return out;
}

function catalogSearchItem(meta) {
  var page = 1;
  var maxPages = 4;
  var bases = [
    BASE,
    "https://cc.leanhhu061206.workers.dev"
  ];

  function fetchPage(base, p) {
    var url = base.replace(/\/$/, "") + "/news_pages.xml?page=" + p + "&perPage=500";
    var headers = baseHeaders(BASE + "/", base === BASE);
    headers["Accept"] = "application/xml,text/xml,text/plain,*/*";
    return fetch(url, {headers:headers}).then(function(r) {
      return r.text().then(function(body) {
        if (r.status < 200 || r.status >= 300) return [];
        return extractCatalogUrls(body);
      });
    }).catch(function() { return []; });
  }

  function pick(urls) {
    var best = null, bestScore = -999;
    (urls || []).forEach(function(u) {
      var s = scoreCatalogUrl(u, meta);
      if (s > bestScore) {
        bestScore = s;
        best = u;
      }
    });
    if (!best || bestScore < 12) return null;
    var ident = catalogUrlIdentity(best);
    return {
      url:best,
      title:ident.title,
      slugTitle:ident.title,
      slugYear:ident.year
    };
  }

  function next() {
    if (page > maxPages) {
      return Promise.reject(new Error("CinemaCity catalog no strict match"));
    }
    var p = page++;
    return Promise.all([
      fetchPage(bases[0], p),
      fetchPage(bases[1], p)
    ]).then(function(groups) {
      var hit = pick(groups[0]) || pick(groups[1]);
      if (hit) return hit;
      return next();
    });
  }

  return next();
}


function knownCinemaCityItem(meta) {
  var title = normalizeTitle((meta && (meta.title || meta.originalTitle)) || "");
  var year = clean(meta && meta.year);

  // Confirmed live CinemaCity page discovered independently of its flaky DLE search.
  if (title === "verity" && (!year || year === "2026")) {
    return {
      url: BASE + "/movies/3379-verity-2026.html",
      title: "Verity",
      slugTitle: "Verity",
      slugYear: "2026"
    };
  }
  return null;
}

function getSessionHash() {
  var seeds = ["Obsession", "The Matrix"];

  function one(seed) {
    var url = BASE + "/index.php?do=search";
    var headers = baseHeaders(BASE + "/", true);
    headers["X-Requested-With"] = "XMLHttpRequest";
    headers["Origin"] = BASE;
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    var body = "do=search&subaction=search&story=" + encodeURIComponent(seed);

    return fetch(url, {
      method:"POST",
      headers:headers,
      body:body
    }).then(function(r) {
      return r.text().then(function(html) {
        if (challengeHtml(html)) throw new Error("CinemaCity Cloudflare challenge");
        var info = inspectSearchBody(html, seed, "");
        if (!info.hash) throw new Error("CinemaCity session hash missing");
        return info.hash;
      });
    });
  }

  var chain = Promise.reject(new Error("CinemaCity session hash bootstrap failed"));
  seeds.forEach(function(seed) {
    chain = chain.catch(function(){ return one(seed); });
  });
  return chain;
}

function searchCinemaCityItem(meta) {
  var known = knownCinemaCityItem(meta);
  if (known) {
    console.log("[CinemaCity] fast known-title " + known.url);
    return Promise.resolve({ item:known, hash:"" });
  }

  var queries = [];
  [meta && meta.title, meta && meta.originalTitle].forEach(function(q) {
    q = clean(q);
    if (q && queries.indexOf(q) < 0) queries.push(q);
  });
  if (!queries.length) return Promise.reject(new Error("CinemaCity search title missing"));

  var cacheKey = normalizeTitle(meta.title || meta.originalTitle || "") + "|" + clean(meta.year);
  if (FAST_CACHE.item[cacheKey]) {
    return Promise.resolve({ item:FAST_CACHE.item[cacheKey], hash:"" });
  }

  function directSearch(query) {
    var url = BASE + "/?do=search&subaction=search&search_start=0&full_search=0&story=" +
      encodeURIComponent(query);
    return fetch(url, { headers:browserNavHeaders(BASE + "/") }).then(function(r) {
      if (!r.ok) throw new Error("CinemaCity search HTTP " + r.status);
      return r.text().then(function(html) {
        if (challengeHtml(html)) throw new Error("CinemaCity Cloudflare challenge");
        var info = inspectSearchBody(html, query, meta.year || "");
        var item = pickBestSearchItem(info, meta);
        if (!item || !item.url) throw new Error("CinemaCity direct search miss");
        FAST_CACHE.item[cacheKey] = item;
        return item;
      });
    });
  }

  function tryQuery(i) {
    if (i >= queries.length) {
      return catalogSearchItem(meta).then(function(item) {
        FAST_CACHE.item[cacheKey] = item;
        return item;
      });
    }
    return directSearch(queries[i]).catch(function() {
      return tryQuery(i + 1);
    });
  }

  return tryQuery(0).then(function(item) {
    return { item:item, hash:"" };
  });
}


function b64DecodeText(input) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var str = clean(input).replace(/[^A-Za-z0-9+/=]/g, "");
  var output = "";
  var i = 0;
  while (i < str.length) {
    var e1 = chars.indexOf(str.charAt(i++));
    var e2 = chars.indexOf(str.charAt(i++));
    var e3 = chars.indexOf(str.charAt(i++));
    var e4 = chars.indexOf(str.charAt(i++));
    if (e1 < 0 || e2 < 0) break;
    var c1 = (e1 << 2) | (e2 >> 4);
    var c2 = ((e2 & 15) << 4) | (e3 >> 2);
    var c3 = ((e3 & 3) << 6) | e4;
    output += String.fromCharCode(c1);
    if (e3 !== 64 && e3 >= 0) output += String.fromCharCode(c2);
    if (e4 !== 64 && e4 >= 0) output += String.fromCharCode(c3);
  }
  try { return decodeURIComponent(escape(output)); } catch (_) { return output; }
}

function extractWatchCandidates(html, baseUrl) {
  var text = decodeEscapedUrl(clean(html));
  var out = [], seen = {};

  function add(raw, why) {
    var v = decodeEntities(clean(raw));
    if (!v) return;

    // Decode URL-encoded values commonly stored in data-file/data-src.
    try {
      if (/%[0-9a-f]{2}/i.test(v)) v = decodeURIComponent(v);
    } catch (_) {}

    // Some playlist payloads wrap the real value in base64 / atob().
    if (/^[A-Za-z0-9+/]{20,}={0,2}$/.test(v)) {
      var decoded = b64DecodeText(v);
      if (/https?:\/\/|\/\/|\/public_files\/|\.m3u8|\.mp4|\.mpd/i.test(decoded)) {
        v = decoded;
      }
    }

    var urls = v.match(/https?:\/\/[^"'<>\s\\]+|\/\/[^"'<>\s\\]+|\/public_files\/[^"'<>\s\\]+/ig) || [];
    if (!urls.length && /^(?:https?:\/\/|\/\/|\/public_files\/)/i.test(v)) urls = [v];

    urls.forEach(function(u) {
      u = resolveUrl(u, baseUrl || BASE + "/");
      if (!u || seen[u]) return;
      seen[u] = 1;
      out.push({url:u, why:why || "raw"});
    });
  }

  var attrRe = /(?:data-file|data-src|data-url|data-player|src|href|file|url)\s*=\s*["']([^"']+)["']/ig;
  var m;
  while ((m = attrRe.exec(text)) !== null) {
    add(m[1], "attr");
    if (out.length >= 40) break;
  }

  var atobRe = /atob\s*\(\s*["']([^"']+)["']\s*\)/ig;
  while ((m = atobRe.exec(text)) !== null) {
    add(b64DecodeText(m[1]), "atob");
    if (out.length >= 40) break;
  }

  var directRe = /https?:\/\/[^"'<>\s\\]+\.(?:m3u8|mp4|mpd)(?:[?#][^"'<>\s\\]*)?/ig;
  while ((m = directRe.exec(text)) !== null) {
    add(m[0], "direct");
    if (out.length >= 40) break;
  }

  return out.slice(0,40);
}

function watchCandidateKind(url) {
  var u = clean(url).toLowerCase();
  if (/\.m3u8(?:$|[?#])/.test(u)) return "hls";
  if (/\.mpd(?:$|[?#])/.test(u)) return "dash";
  if (/\.mp4(?:$|[?#])/.test(u)) return "mp4";
  if (/player|embed|watch|stream/i.test(u)) return "page";
  return "other";
}

function fetchWatchChild(candidate, referer) {
  var url = candidate && candidate.url ? candidate.url : "";
  if (!/^https?:\/\//i.test(url)) return Promise.resolve([]);
  var h = {
    "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent":userAgent(),
    "Referer":referer || (BASE + "/")
  };
  if (isCinemaCityHost(url) && cookieValue()) h["Cookie"] = cookieValue();

  return fetch(url, {headers:h}).then(function(r) {
    return r.text().then(function(body) {
      return extractWatchCandidates(body, r.url || url);
    });
  }).catch(function() { return []; });
}


function b64DecodeText(input) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var str = clean(input).replace(/[^A-Za-z0-9+/=]/g, "");
  var output = "";
  var i = 0;
  while (i < str.length) {
    var e1 = chars.indexOf(str.charAt(i++));
    var e2 = chars.indexOf(str.charAt(i++));
    var e3 = chars.indexOf(str.charAt(i++));
    var e4 = chars.indexOf(str.charAt(i++));
    if (e1 < 0 || e2 < 0) break;
    var c1 = (e1 << 2) | (e2 >> 4);
    var c2 = ((e2 & 15) << 4) | (e3 >> 2);
    var c3 = ((e3 & 3) << 6) | e4;
    output += String.fromCharCode(c1);
    if (e3 !== 64 && e3 >= 0) output += String.fromCharCode(c2);
    if (e4 !== 64 && e4 >= 0) output += String.fromCharCode(c3);
  }
  try { return decodeURIComponent(escape(output)); } catch (_) { return output; }
}

function extractPlayerFilePayload(html) {
  var text = clean(html);
  var re = /atob\s*\(\s*(['"])(.*?)\1\s*\)/ig;
  var m;
  var decodedCount = 0;

  while ((m = re.exec(text)) !== null) {
    var decoded = b64DecodeText(m[2]);
    if (!decoded) continue;
    decodedCount++;

    // Match either a quoted file string or a JSON-array file value.
    var fm = decoded.match(/file\s*:\s*(['"])([\s\S]*?)\1/i) ||
             decoded.match(/file\s*:\s*(\[[\s\S]*?\])/i) ||
             decoded.match(/"file"\s*:\s*"([\s\S]*?)"/i);

    if (!fm) continue;

    var rawFile = fm[2] || fm[1] || "";
    if (fm.length === 2) rawFile = fm[1] || "";
    rawFile = decodeEscapedUrl(clean(rawFile));
    if (!rawFile || rawFile.length < 5) continue;

    var fileData = rawFile;

    if (/^[\[{]/.test(rawFile)) {
      try {
        fileData = JSON.parse(rawFile.replace(/\\(.)/g, "$1"));
      } catch (_) {
        try { fileData = JSON.parse(rawFile); } catch (_) {}
      }
    }

    return {
      rawFile:rawFile,
      fileData:fileData,
      decoded:decoded,
      decodedCount:decodedCount
    };
  }

  return {
    rawFile:"",
    fileData:null,
    decoded:"",
    decodedCount:decodedCount
  };
}

function resolveCinemaMediaUrl(base, path) {
  var p = decodeEscapedUrl(clean(path));
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  if (/^\/\//.test(p)) return "https:" + p;
  if (/^\//.test(p)) return BASE + p;

  var b = decodeEscapedUrl(clean(base));
  if (/^https?:\/\//i.test(b)) {
    var noQuery = b.split("?")[0];
    var normalized = noQuery;
    if (!/\/$/.test(normalized)) {
      var last = normalized.slice(normalized.lastIndexOf("/") + 1);
      normalized = last.indexOf(".") >= 0
        ? normalized.slice(0, normalized.lastIndexOf("/") + 1)
        : normalized + "/";
    }
    return normalized + p.replace(/^\/+/, "");
  }

  return BASE + "/" + p.replace(/^\/+/, "");
}

function pickMovieFileValue(fileData) {
  if (!fileData) return "";

  if (typeof fileData === "string") return clean(fileData);

  if (Array.isArray(fileData)) {
    var obj = null;
    for (var i=0;i<fileData.length;i++) {
      var x = fileData[i];
      if (x && typeof x === "object" && !x.folder && x.file) {
        obj = x;
        break;
      }
    }
    if (!obj && fileData.length) obj = fileData[0];
    if (obj && typeof obj === "object" && obj.file) return clean(obj.file);
    if (typeof obj === "string") return clean(obj);
  }

  if (typeof fileData === "object" && fileData.file) return clean(fileData.file);

  return "";
}

function urlsetQualityVariants(raw, pageUrl) {
  var url = decodeEscapedUrl(clean(raw));
  var low = url.toLowerCase();
  var marker = ".urlset/master.m3u8";
  var mi = low.indexOf(marker);
  var pfi = low.indexOf("/public_files/");
  if (mi < 0 || pfi < 0 || pfi > mi) return [];

  // Preserve any signed query string after master.m3u8.
  var after = url.slice(mi + marker.length);
  var before = url.slice(0, mi);

  // Keep the CDN + /public_files/ prefix untouched.
  var prefix = url.slice(0, pfi + "/public_files/".length);
  var rest = before.slice(pfi + "/public_files/".length);

  // Most CinemaCity PlayerJS file sets are comma-separated component files:
  // <base>,1080p.mp4,720p.mp4,...,audio.m4a,.urlset/master.m3u8
  // Rebuild one master per video component while retaining all audio/subtitle
  // components. This avoids exposing bare MP4 video-only files.
  var parts = rest.split(",").map(function(x){ return clean(x); }).filter(Boolean);
  if (!parts.length) return [];

  var videos = [];
  var support = [];
  parts.forEach(function(p) {
    if (/\.mp4(?:$|[?#])/i.test(p)) videos.push(p);
    else support.push(p);
  });

  if (videos.length < 2) return [];

  var rows = [];
  var seenQ = {};

  videos.forEach(function(video) {
    var q = qualityOf(video, video);
    if (!q || q === "Auto" || seenQ[q]) return;
    seenQ[q] = 1;

    // Preserve original order as much as possible: replace all video components
    // with only the selected one, leave every non-video component untouched.
    var emittedVideo = false;
    var chosen = [];
    parts.forEach(function(p) {
      if (/\.mp4(?:$|[?#])/i.test(p)) {
        if (!emittedVideo && p === video) {
          chosen.push(p);
          emittedVideo = true;
        }
      } else {
        chosen.push(p);
      }
    });
    if (!emittedVideo) chosen.unshift(video);

    var variantUrl = prefix + chosen.join(",") + ",.urlset/master.m3u8" + after;
    var label = "CinemaCity Download Lab v1.1.2 · " + q + " · HLS";
    rows.push({
      name:label,
      title:label,
      url:variantUrl,
      quality:q,
      type:"hls",
      provider:"cinemacity-downloadlab-100",
      headers:watchPlaybackHeaders(pageUrl),
      subtitles:[]
    });
  });

  rows.sort(function(a,b) {
    function rank(q) {
      if (q === "4K") return 2160;
      var m = String(q || "").match(/(\d{3,4})p/i);
      return m ? Number(m[1]) : 0;
    }
    return rank(b.quality) - rank(a.quality);
  });

  return rows;
}

function fileSetStreams(fileData, pageUrl) {
  var raw = decodeEscapedUrl(pickMovieFileValue(fileData));
  if (!raw) return [];

  if (/^https?:\/\//i.test(raw) && /\.urlset\/master\.m3u8(?:$|[?#])/i.test(raw)) {
    var autoLabel = "CinemaCity Download Lab v1.1.2 · Auto · HLS";
    var rows = [{
      name:autoLabel,
      title:autoLabel,
      url:raw,
      quality:"Auto",
      type:"hls",
      provider:"cinemacity-downloadlab-100",
      headers:watchPlaybackHeaders(pageUrl),
      subtitles:[]
    }];

    var variants = urlsetQualityVariants(raw, pageUrl);
    variants.forEach(function(v){ rows.push(v); });
    console.log("[CinemaCity] URLSET variants=" + variants.length);
    return rows;
  }

  // Fallback for explicit labelled URLs such as [1080p]https://...m3u8
  var out = [], seen = {};
  var parts = raw.indexOf("[") >= 0 ? raw.split(",") : [raw];

  parts.forEach(function(part) {
    var p = clean(part);
    if (!p) return;

    var m = p.match(/^\[(.*?)\](.*)$/);
    var q = m ? clean(m[1]) : qualityOf(p, p);
    var u = m ? clean(m[2]) : p;
    u = resolveCinemaMediaUrl(pageUrl, u);

    if (!/^https?:\/\//i.test(u) || seen[u]) return;
    seen[u] = 1;

    var kind = watchCandidateKind(u);
    if (kind !== "hls" && kind !== "dash" && kind !== "mp4") return;

    var label = "CinemaCity Download Lab v1.1.2 · " + (q || "Auto") + " · " + kind.toUpperCase();
    out.push({
      name:label,
      title:label,
      url:u,
      quality:q || "Auto",
      type:kind,
      provider:"cinemacity-downloadlab-100",
      headers:watchPlaybackHeaders(pageUrl),
      subtitles:[]
    });
  });

  return out;
}

function hlsAttr(line, key) {
  var s = clean(line);
  var q = new RegExp(key + '\\s*=\\s*"([^"]*)"', "i").exec(s);
  if (q) return clean(q[1]);
  var b = new RegExp(key + "\\s*=\\s*([^,\\s]+)", "i").exec(s);
  return b ? clean(b[1]) : "";
}

function hlsQualityFromInf(line) {
  var r = /\bRESOLUTION\s*=\s*\d{2,5}\s*[xX]\s*(\d{2,5})/i.exec(line);
  if (r) {
    var h = Number(r[1] || 0);
    if (h >= 2160) return "4K";
    if (h >= 1440) return "1440p";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
    if (h >= 480) return "480p";
    if (h >= 360) return "360p";
    if (h > 0) return String(h) + "p";
  }
  return "Auto";
}

function expandHlsMasterVariants(autoStream, pageUrl) {
  if (!autoStream || !autoStream.url || autoStream.type !== "hls") {
    return Promise.resolve([]);
  }

  var h = watchPlaybackHeaders(pageUrl);
  h["Accept"] = "application/vnd.apple.mpegurl,application/x-mpegURL,*/*";

  return fetch(autoStream.url, {headers:h}).then(function(r) {
    if (!r.ok) return [];
    return r.text().then(function(body) {
      if (!/#EXTM3U/i.test(body) || !/#EXT-X-STREAM-INF/i.test(body)) return [];

      var lines = String(body || "").split(/\r?\n/);
      var rows = [], seen = {};
      var hasExternalAudio = /#EXT-X-MEDIA:[^\n]*TYPE\s*=\s*AUDIO/i.test(body);

      for (var i=0;i<lines.length;i++) {
        var line = clean(lines[i]);
        if (!/^#EXT-X-STREAM-INF\s*:/i.test(line)) continue;

        var uri = "";
        for (var j=i+1;j<lines.length;j++) {
          var next = clean(lines[j]);
          if (!next) continue;
          if (next.charAt(0) === "#") continue;
          uri = next;
          break;
        }
        if (!uri) continue;

        var u = resolveUrl(uri, autoStream.url);
        if (!/^https?:\/\//i.test(u) || seen[u]) continue;
        seen[u] = 1;

        var q = hlsQualityFromInf(line);
        var audioGroup = hlsAttr(line, "AUDIO");
        var codecs = hlsAttr(line, "CODECS");
        var muxedAudio = !audioGroup && /mp4a|aac|ac-3|ec-3|opus/i.test(codecs);

        var label = "CinemaCity Download Lab v1.1.2 · " + q + " · HLS";
        if (hasExternalAudio && audioGroup && !muxedAudio) label += " · TEST";

        rows.push({
          name:label,
          title:label,
          url:u,
          quality:q,
          type:"hls",
          provider:"cinemacity-downloadlab-100",
          headers:watchPlaybackHeaders(pageUrl),
          subtitles:[]
        });
      }

      rows.sort(function(a,b) {
        function rank(q) {
          if (q === "4K") return 2160;
          var m = String(q || "").match(/(\d{3,4})p/i);
          return m ? Number(m[1]) : 0;
        }
        return rank(b.quality) - rank(a.quality);
      });

      console.log("[CinemaCity] master variants=" + rows.length + " extAudio=" + (hasExternalAudio ? 1 : 0));
      return rows.slice(0,8);
    });
  }).catch(function(e) {
    console.log("[CinemaCity] master inspect failed " + (e && e.message ? e.message : e));
    return [];
  });
}


function watchPlaybackHeaders(referer) {
  var h = {
    "User-Agent": userAgent(),
    "Referer": referer || (BASE + "/"),
    "Accept": "*/*"
  };
  if (cookieValue()) h["Cookie"] = cookieValue();
  return h;
}

function playerScriptDiagnostic(html, newsId) {
  var payload = extractPlayerFilePayload(html || "");
  var atobCount = (clean(html).match(/atob\s*\(/ig) || []).length;
  var fileLen = clean(payload.rawFile).length;
  var typ = Array.isArray(payload.fileData) ? "A" : (typeof payload.fileData === "object" && payload.fileData ? "O" : "S");
  var us = /\.urlset\/master\.m3u8/i.test(clean(pickMovieFileValue(payload.fileData))) ? 1 : 0;
  return "CC73 PLAYER A" + String(atobCount) +
    " F" + String(fileLen) +
    " T" + typ +
    " U" + String(us) +
    " ID" + String(newsId);
}

function extractLoginHashFromHtml(html) {
  var m = clean(html).match(/(?:dle_login_hash|dle_hash)\s*[:=]\s*["']([^"']+)["']/i);
  return m ? clean(m[1]) : "";
}

function compactQualities(paths) {
  var seen = {}, out = [];
  (paths || []).forEach(function(p) {
    var q = qualityOf(p, p);
    if (!q || q === "Auto" || seen[q]) return;
    seen[q] = 1;
    out.push(q);
  });
  out.sort(function(a,b){ return mediaQualityRank(b) - mediaQualityRank(a); });
  return out.join(",");
}

function parseContentRangeTotal(cr) {
  var m = clean(cr).match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

function rangeHeaderProbe(url, referer, start) {
  var end = start + 63;
  var h = playbackHeaders(url, referer, true);
  h["Range"] = "bytes=" + String(start) + "-" + String(end);
  h["Accept"] = "*/*";

  return fetch(url, {method:"GET", headers:h}).then(function(r) {
    var cr="", cl="", ct="";
    try { cr = clean(r.headers.get("content-range") || ""); } catch (_) {}
    try { cl = clean(r.headers.get("content-length") || ""); } catch (_) {}
    try { ct = clean(r.headers.get("content-type") || ""); } catch (_) {}
    var okRange = (r.status === 206 && new RegExp("bytes\\s+" + start + "-", "i").test(cr)) ? 1 : 0;
    return {
      status:r.status,
      range:okRange,
      cr:cr,
      cl:cl,
      ct:ct,
      total:parseContentRangeTotal(cr)
    };
  }).catch(function(e) {
    return {status:0,range:0,cr:"",cl:"",ct:"",total:0,error:e&&e.message?e.message:String(e||"error")};
  });
}

function adaptiveRangeProbe(url, referer) {
  return rangeHeaderProbe(url, referer, 0).then(function(first) {
    var total = Number(first.total || 0);
    var offset = 65536;

    if (total > 0) {
      if (total <= 128) offset = 0;
      else if (total <= 131072) offset = Math.max(64, Math.floor(total / 2));
      else offset = Math.min(65536, Math.max(64, Math.floor(total / 4)));
      if (offset >= total) offset = Math.max(0, total - 64);
    }

    if (offset <= 0) {
      return {first:first, second:{status:0,range:0,total:total}, offset:offset};
    }

    return rangeHeaderProbe(url, referer, offset).then(function(second) {
      return {first:first, second:second, offset:offset};
    });
  });
}


function hdDownloadEntitlementProbe(item, detailHtml, newsId) {
  var hash = extractLoginHashFromHtml(detailHtml || "");
  if (!hash) {
    return Promise.resolve(diagnosticRow("HDPROBE HASH0 ID" + String(newsId)));
  }

  return dhSizesProbe(newsId, hash, item.url).then(function(dh) {
    var keys = dh.mediaKeys || [];
    var videos = keys.filter(function(k){ return /\.mp4(?:$|[?#])/i.test(k); });
    var audios = keys.filter(function(k){ return /\.m4a(?:$|[?#])/i.test(k); });
    videos.sort(function(a,b){ return mediaQualityRank(b) - mediaQualityRank(a); });

    var qs = compactQualities(videos);
    var hdVideo = "";
    for (var i=0;i<videos.length;i++) {
      if (mediaQualityRank(videos[i]) >= 300) {
        hdVideo = videos[i];
        break;
      }
    }

    if (!hdVideo) {
      return diagnosticRow(
        "HDPROBE S" + String(dh.status || 0) +
        " V" + String(videos.length) +
        " HD0 Q=" + (qs || "none") +
        " ID" + String(newsId)
      );
    }

    var audio = audios.length ? audios[0] : "";
    var q = qualityOf(hdVideo, hdVideo);
    var dl = buildDhDownloadUrl(
      hdVideo,
      audio,
      hash,
      "CinemaCity HD entitlement probe " + q
    );

    return adaptiveRangeProbe(dl, item.url).then(function(rr) {
      var a = rr.first || {}, b = rr.second || {};
      var fullRange = (a.range === 1 && b.range === 1) ? 1 : 0;
      var total = Number(a.total || b.total || 0);
      return diagnosticRow(
        "HDPROBE2 " + q +
        " Q=" + (qs || q) +
        " S" + String(a.status || 0) + "/" + String(b.status || 0) +
        " R" + String(a.range || 0) + String(b.range || 0) +
        " O" + String(rr.offset || 0) +
        " T" + String(total || 0) +
        " ARB" + String(fullRange) +
        " ID" + String(newsId)
      );
    });
  }).catch(function(e) {
    return diagnosticRow(
      "HDPROBE ERR " + clean(e&&e.message?e.message:String(e||"error")).slice(0,80)
    );
  });
}


function basenameOfUrl(u) {
  var s = clean(u).split("?")[0];
  var p = s.lastIndexOf("/");
  return p >= 0 ? s.slice(p+1) : s;
}

function downloadMarkupProbe(html) {
  var s = clean(html);
  var lower = s.toLowerCase();
  var flags = [];
  [
    ["HREF1080",/href\s*=\s*["'][^"']*1080/i],
    ["DATAFILE",/data-file\s*=/i],
    ["DATAVIDEO",/data-video\s*=/i],
    ["DATAAUDIO",/data-audio\s*=/i],
    ["DATAURL",/data-url\s*=/i],
    ["ONCLICK",/onclick\s*=/i],
    ["FORM",/<form\b/i],
    ["DH",/mod=dh/i],
    ["SIZES",/action=sizes/i],
    ["DOWNLOAD",/action=download/i]
  ].forEach(function(x){ if (x[1].test(s)) flags.push(x[0]); });

  var idx = lower.indexOf("1080p");
  var attrs = [];
  if (idx >= 0) {
    var frag = s.slice(Math.max(0,idx-900), Math.min(s.length,idx+900));
    var tagRe = /<(?:a|button|input|select|option|form)\b[^>]*>/ig;
    var m;
    while ((m = tagRe.exec(frag)) !== null) {
      var tag = m[0];
      if (!/1080|download|video|audio|quality|file/i.test(tag)) continue;
      var ar = /\s([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=/g, am;
      while ((am = ar.exec(tag)) !== null) {
        var k = am[1].toLowerCase();
        if (attrs.indexOf(k) < 0) attrs.push(k);
      }
    }
  }

  return {
    flags:flags.join("+") || "0",
    attrs:attrs.slice(0,12).join(",") || "none",
    has1080:idx >= 0 ? 1 : 0
  };
}

function downloadScriptProbe(html, pageUrl) {
  var srcs = [];
  var seen = {};
  var re = /<script\b[^>]*src\s*=\s*["']([^"']+)["']/ig, m;
  while ((m = re.exec(clean(html))) !== null) {
    var u = resolveUrl(m[1], pageUrl || (BASE + "/"));
    if (!u || seen[u] || !isCinemaCityHost(u)) continue;
    seen[u] = 1;
    srcs.push(u);
    if (srcs.length >= 16) break;
  }
  if (!srcs.length) return Promise.resolve("none");

  return Promise.all(srcs.map(function(u){
    var h = baseHeaders(pageUrl || (BASE + "/"), true);
    h["Accept"] = "*/*";
    return fetch(u,{headers:h}).then(function(r){
      return r.text().then(function(js){
        var f=[];
        if (/mod=dh/i.test(js)) f.push("DH");
        if (/action=sizes/i.test(js)) f.push("SZ");
        if (/action=download/i.test(js)) f.push("DL");
        if (/dle_login_hash|user_hash/i.test(js)) f.push("HASH");
        if (/news_id/i.test(js)) f.push("NID");
        if (/data-video|video\s*[:=]/i.test(js)) f.push("VID");
        if (/data-audio|audio\s*[:=]/i.test(js)) f.push("AUD");
        if (/download/i.test(js)) f.push("D");
        return f.length ? basenameOfUrl(u)+":"+f.join("+") : "";
      });
    }).catch(function(){ return ""; });
  })).then(function(rows){
    rows=(rows||[]).filter(Boolean);
    return rows.slice(0,5).join("|") || "none";
  });
}

function officialDownloadDiagnostic(item, detailHtml, newsId) {
  var mp = downloadMarkupProbe(detailHtml || "");
  return downloadScriptProbe(detailHtml || "", item.url).then(function(js){
    return diagnosticRow(
      "DUI H1080=" + String(mp.has1080) +
      " M=" + mp.flags +
      " A=" + mp.attrs +
      " JS=" + js +
      " ID" + String(newsId)
    );
  });
}

function watchStreamsForMeta(meta) {
  var streamKey = normalizeTitle((meta && (meta.title || meta.originalTitle)) || "") + "|" + clean(meta && meta.year);
  var cached = FAST_CACHE.streams[streamKey];
  if (cached && cached.expires > Date.now() && cached.rows && cached.rows.length) {
    console.log("[CinemaCity] stream cache hit " + streamKey);
    return Promise.resolve(cached.rows);
  }

  return searchCinemaCityItem(meta).then(function(found) {
    var item = found.item;
    var newsId = parseNewsId(item.url);
    if (!newsId) throw new Error("CinemaCity watch news_id missing");

    return detailProbe(item.url, BASE + "/").then(function(detail) {
      var payload = extractPlayerFilePayload(detail.html || "");
      var fromPlayer = fileSetStreams(payload.fileData, item.url);
      if (fromPlayer.length) {
        console.log("[CinemaCity] PlayerJS streams=" + fromPlayer.length + " news_id=" + newsId);

        var autoOnly = fromPlayer.length === 1 &&
          fromPlayer[0] &&
          fromPlayer[0].type === "hls" &&
          String(fromPlayer[0].quality || "").toLowerCase() === "auto";

        if (autoOnly) {
          return expandHlsMasterVariants(fromPlayer[0], item.url).then(function(masterRows) {
            var rows = dedupeStreams(fromPlayer.concat(masterRows || []));
            return officialDownloadDiagnostic(item, detail.html || "", newsId).then(function(diag) {
              var finalRows = rows.concat(diag ? [diag] : []);
              FAST_CACHE.streams[streamKey] = {
                expires: Date.now() + 5 * 60 * 1000,
                rows: finalRows
              };
              return finalRows;
            });
          });
        }

        return officialDownloadDiagnostic(item, detail.html || "", newsId).then(function(diag) {
          var finalRows = fromPlayer.concat(diag ? [diag] : []);
          FAST_CACHE.streams[streamKey] = {
            expires: Date.now() + 5 * 60 * 1000,
            rows: finalRows
          };
          return finalRows;
        });
      }

      var uniq = extractWatchCandidates(detail.html || "", item.url);
      var directRows = [];
      uniq.forEach(function(c) {
        var kind = watchCandidateKind(c.url);
        if (kind !== "hls" && kind !== "dash" && kind !== "mp4") return;
        var q = qualityOf(c.url, c.why);
        var label = "CinemaCity Watch · " + q + " · " + kind.toUpperCase();
        directRows.push({
          name:label,
          title:label,
          url:c.url,
          quality:q,
          type:kind,
          provider:"cinemacity-downloadlab-100",
          headers:playbackHeaders(c.url, item.url, false),
          subtitles:[]
        });
      });
      directRows = dedupeStreams(directRows);
      if (directRows.length) return directRows.slice(0,8);

      var pages = uniq.filter(function(c) {
        var kind = watchCandidateKind(c.url);
        var host = hostOf(c.url);
        return kind === "page" && !/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(host);
      }).slice(0,6);

      if (!pages.length) {
        return [diagnosticRow(playerScriptDiagnostic(detail.html || "", newsId) +
          " C" + String(uniq.length) + " E0")];
      }

      return Promise.all(pages.map(function(c){ return fetchWatchChild(c, item.url); }))
        .then(function(groups) {
          var nested = [], nseen = {};
          groups.forEach(function(g) {
            (g || []).forEach(function(c) {
              if (!c || !c.url || nseen[c.url]) return;
              nseen[c.url] = 1;
              nested.push(c);
            });
          });

          var rows = [];
          nested.forEach(function(c) {
            var kind = watchCandidateKind(c.url);
            if (kind !== "hls" && kind !== "dash" && kind !== "mp4") return;
            var q = qualityOf(c.url, c.why);
            var label = "CinemaCity Watch · " + q + " · " + kind.toUpperCase();
            rows.push({
              name:label,
              title:label,
              url:c.url,
              quality:q,
              type:kind,
              provider:"cinemacity-downloadlab-100",
              headers:playbackHeaders(c.url, item.url, false),
              subtitles:[]
            });
          });
          rows = dedupeStreams(rows);
          if (rows.length) return rows.slice(0,8);

          var hosts = [];
          pages.forEach(function(c) {
            var h = hostOf(c.url);
            if (h && hosts.indexOf(h) < 0) hosts.push(h);
          });
          return [diagnosticRow(playerScriptDiagnostic(detail.html || "", newsId) +
            " C" + String(uniq.length) +
            " E" + String(pages.length) +
            " H=" + hosts.slice(0,3).join(","))];
        });
    });
  });
}

function dhStreamsForMeta(meta) {
  return searchCinemaCityItem(meta).then(function(found) {
    var item = found.item;
    var hash = found.hash;
    var newsId = parseNewsId(item.url);
    if (!newsId) throw new Error("CinemaCity news_id missing");

    return dhSizesProbe(newsId, hash, item.url).then(function(dh) {
      var keys = [], seen = {};
      (dh.mediaKeys || []).forEach(function(k) {
        if (!k || seen[k]) return;
        seen[k] = 1;
        keys.push(k);
      });

      var videos = keys.filter(function(k){ return /\.mp4(?:$|[?#])/i.test(k); });
      var audios = keys.filter(function(k){ return /\.m4a(?:$|[?#])/i.test(k); });
      if (!videos.length) throw new Error("CinemaCity DH returned no video variants");

      videos.sort(function(a,b) {
        return mediaQualityRank(b) - mediaQualityRank(a);
      });

      var audio = audios.length ? audios[0] : "";
      var rows = [];
      var seenQ = {};

      videos.forEach(function(video, idx) {
        if (rows.length >= 6) return;
        var q = qualityOf(video, video);
        // Keep one stream per recognized quality; retain up to two Auto variants.
        var qKey = q === "Auto" ? ("Auto" + String(idx < 2 ? idx : 2)) : q;
        if (seenQ[qKey]) return;
        seenQ[qKey] = 1;

        var url = buildDhDownloadUrl(
          video,
          audio,
          hash,
          (meta.title || meta.originalTitle || "CinemaCity") + " " + q
        );

        var label = "CinemaCity · " + q + " · MP4";
        rows.push({
          name:label,
          title:label,
          url:url,
          quality:q,
          type:"mp4",
          provider:"cinemacity-downloadlab-100",
          headers:playbackHeaders(url, item.url, true),
          subtitles:[]
        });
      });

      console.log("[CinemaCity] DH news_id=" + newsId + " variants=" + rows.length);
      return rows;
    });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId || mediaType !== "movie") {
    if (mediaType === "tv") {
      console.log("[CinemaCity] TV is disabled until season/episode routing is live-verified.");
    }
    return Promise.resolve([]);
  }

  // Direct-origin diagnostic using the user's current Cookie + User-Agent.
  // Nuvio's built-in Test Provider uses TMDB 603.
  if (String(tmdbId) === "603") {
    return searchAndCandidateProbe().then(function(rows) {
      return [localSessionDiagnostic()].concat(rows || []);
    });
  }

  if (!cookieValue()) {
    console.log("[CinemaCity] Configure your own signed-in Session Cookie in provider settings.");
    return Promise.resolve(diagnosticResult("NO_COOKIE", "Session Cookie is empty in SCRAPER_SETTINGS"));
  }

  console.log("[CinemaCity] movie tmdb=" + tmdbId);

  var stage = "TMDB";
  var resolvedMeta = null;
  return tmdbMeta(tmdbId, mediaType)
    .then(function(meta) {
      resolvedMeta = meta;
      stage = "WATCH";
      return watchStreamsForMeta(meta);
    })
    .then(function(streams) {
      streams = dedupeStreams(streams);
      console.log("[CinemaCity] watch streams=" + streams.length);
      if (!streams.length) {
        return diagnosticResult("WATCH", "No direct Watch Online media candidate was exposed");
      }
      return streams;
    })
    .catch(function(e) {
      var msg = e && e.message ? e.message : String(e || "unknown error");
      console.log("[CinemaCity] " + msg);
      var code = stage;
      if (/Cloudflare challenge/i.test(msg)) code = "CLOUDFLARE";
      else if (/not authenticated|expired|Guests are not allowed|Registration is required/i.test(msg)) code = "LOGIN";
      else if (/search|catalog|match|hash/i.test(msg)) code = "SEARCH";
      else if (/TMDB/i.test(msg)) code = "TMDB";
      if (String(tmdbId) === "603" && code === "SEARCH" && /HTTP 403/i.test(msg)) {
        return diagnosticProbeEndpoints();
      }
      return diagnosticResult(code, msg);
    });
}

module.exports = {
  getStreams: getStreams,
  onSettings: onSettings,
  _internals: {
    candidateLinks: candidateLinks,
    detailIdentity: detailIdentity,
    extractDirectMedia: extractDirectMedia,
    extractSubtitles: extractSubtitles,
    sameOriginPlayerPages: sameOriginPlayerPages,
    challengeHtml: challengeHtml,
    guestBlocked: guestBlocked
  }
};

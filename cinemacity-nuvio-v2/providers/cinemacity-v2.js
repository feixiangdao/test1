// CinemaCity V2 · Login Session — Nuvio local scraper
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
      return {
        title: title || original,
        originalTitle: original,
        year: firstYear(date)
      };
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
      provider: "cinemacity-v2-login",
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
    provider: "cinemacity-v2-login"
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
    provider: "cinemacity-v2-login",
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
      provider: "cinemacity-v2-login"
    };
    return [first].concat(rows || []);
  });
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
        provider: "cinemacity-v2-login"
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
      provider: "cinemacity-v2-login"
    };
  });
}

function proxyProbeEndpoints() {
  return Promise.all([
    proxyProbeOne("LEAN500", "https://cc.leanhhu061206.workers.dev", "/news_pages.xml?page=1&perPage=500"),
    proxyProbeOne("LEANRAW", "https://cc.leanhhu061206.workers.dev", "/news_pages.xml"),
    proxyProbeOne("LEANP1", "https://cc.leanhhu061206.workers.dev", "/news_pages.xml?page=1"),
    proxyProbeOne("LEANMOV", "https://cc.leanhhu061206.workers.dev", "/movies/379-the-patient.html")
  ]);
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!tmdbId || mediaType !== "movie") {
    if (mediaType === "tv") {
      console.log("[CinemaCity] TV is disabled until season/episode routing is live-verified.");
    }
    return Promise.resolve([]);
  }

  // Proxy-route diagnostic: no CinemaCity cookie required.
  // Nuvio's built-in Test Provider uses TMDB 603.
  if (String(tmdbId) === "603") {
    return proxyProbeEndpoints();
  }

  if (!cookieValue()) {
    console.log("[CinemaCity] Configure your own signed-in Session Cookie in provider settings.");
    return Promise.resolve(diagnosticResult("NO_COOKIE", "Session Cookie is empty in SCRAPER_SETTINGS"));
  }

  console.log("[CinemaCity] movie tmdb=" + tmdbId);

  var stage = "TMDB";
  return tmdbMeta(tmdbId, mediaType)
    .then(function(meta) {
      stage = "SEARCH";
      return locateDetail(meta, mediaType);
    })
    .then(function(detail) {
      stage = "PLAYER";
      return resolveFromDetail(detail);
    })
    .then(function(streams) {
      streams = dedupeStreams(streams);
      console.log("[CinemaCity] streams=" + streams.length);
      if (!streams.length) {
        return diagnosticResult("NO_MEDIA", "Authenticated page matched, but no direct HLS/MP4/DASH was exposed");
      }
      return streams;
    })
    .catch(function(e) {
      var msg = e && e.message ? e.message : String(e || "unknown error");
      console.log("[CinemaCity] " + msg);
      var code = stage;
      if (/Cloudflare challenge/i.test(msg)) code = "CLOUDFLARE";
      else if (/not authenticated|expired|Guests are not allowed|Registration is required/i.test(msg)) code = "LOGIN";
      else if (/search returned no matching|strict title\/year match failed/i.test(msg)) code = "SEARCH";
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

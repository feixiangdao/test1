// Cinejoy · Titan Mesh (VidUp) — Nuvio local scraper
// Executes on the device so VidUp sees the user's own network IP.

var BASE = "https://vidup.to";
var ENC = "https://enc-dec.app/api";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v) {
  return v == null ? "" : String(v).trim();
}

function jsonFetch(url, options) {
  return fetch(url, options || {}).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.json();
  });
}

function textFetch(url, options) {
  return fetch(url, options || {}).then(function(r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.text();
  });
}

function extractToken(html) {
  var m =
    html.match(/\\?"en\\?"\s*:\s*\\?"([^"\\]+)\\?"/) ||
    html.match(/"en"\s*:\s*"([^"]+)"/) ||
    html.match(/'en'\s*:\s*'([^']+)'/);
  return m && m[1] ? m[1] : "";
}

function decrypt(text) {
  return fetch(ENC + "/dec-vidup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text })
  }).then(function(r) {
    if (!r.ok) throw new Error("decrypt HTTP " + r.status);
    return r.json();
  }).then(function(d) {
    return d && d.result;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var embed = mediaType === "tv"
    ? BASE + "/tv/" + tmdbId + "/" + (season || 1) + "/" + (episode || 1) + "/"
    : BASE + "/movie/" + tmdbId + "/";

  console.log("[Cinejoy/VidUp] " + embed);

  return textFetch(embed, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,*/*"
    }
  })
  .then(function(html) {
    var raw = extractToken(html);
    if (!raw) throw new Error("embed token not found");
    return jsonFetch(ENC + "/enc-vidup?text=" + encodeURIComponent(raw));
  })
  .then(function(enc) {
    var meta = enc && enc.result;
    if (!meta || !meta.servers || !meta.stream) throw new Error("metadata unavailable");

    var apiHeaders = {
      "User-Agent": UA,
      "Referer": BASE + "/",
      "Origin": BASE,
      "X-Requested-With": "XMLHttpRequest"
    };
    if (meta.token) apiHeaders["X-CSRF-Token"] = String(meta.token);

    return textFetch(meta.servers, {
      method: "POST",
      headers: apiHeaders
    })
    .then(decrypt)
    .then(function(servers) {
      if (!Array.isArray(servers) || !servers.length) return [];

      var jobs = servers.slice(0, 10).map(function(server) {
        if (!server || !server.data) return Promise.resolve(null);

        var streamApi = String(meta.stream).replace(/\/$/, "") + "/" + encodeURIComponent(server.data);
        return textFetch(streamApi, {
          method: "POST",
          headers: apiHeaders
        })
        .then(decrypt)
        .then(function(result) {
          var url = clean(result && result.url);
          if (!/^https?:\/\//i.test(url)) return null;

          return {
            name: "Cinejoy · Titan Mesh",
            title: "Titan Mesh · " + clean(server.name || "Server"),
            url: url,
            quality: "Auto",
            provider: "cinejoy-vidup",
            headers: {
              "Referer": BASE + "/",
              "Origin": BASE,
              "User-Agent": UA
            },
            subtitles: []
          };
        })
        .catch(function() { return null; });
      });

      return Promise.all(jobs);
    });
  })
  .then(function(rows) {
    rows = Array.isArray(rows) ? rows : [];
    var out = [];
    var seen = {};
    rows.forEach(function(x) {
      if (!x || !x.url || seen[x.url]) return;
      seen[x.url] = true;
      out.push(x);
    });
    console.log("[Cinejoy/VidUp] streams=" + out.length);
    return out;
  })
  .catch(function(e) {
    console.error("[Cinejoy/VidUp] " + (e && e.message ? e.message : e));
    return [];
  });
}

module.exports = { getStreams: getStreams };

/*
 * YTS Movie Sources for Nuvio Mobile Android (Full build), v0.2.2.
 * Contract based on NuvioMedia/NuvioMobile tag 0.6.12-beta.
 * getStreams(tmdbId, mediaType, season, episode) returns an array.
 * Each result needs a nonempty string URL; size must be a string.
 * Mock tests passed; external API and real-device playback not verified.
 * Only access media with appropriate distribution rights.
 */
var YTS_API_BASES = [
  'https://movies-api.accel.li/api/v2',
  'https://yts.gg/api/v2'
];

var YTS_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce'
];

function ytsLog(message) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[YTS-Mobile] ' + message);
  }
}

function validImdb(value) {
  var v = String(value == null ? '' : value).trim().toLowerCase();
  return /^tt[0-9]{7,10}$/.test(v) ? v : null;
}

function validHash(value) {
  var v = String(value == null ? '' : value).trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(v) ? v : null;
}

function saneInt(value) {
  if (value === '' || value === undefined || value === null) return null;
  var n = Number(value);
  return isFinite(n) && n >= 0 && Math.floor(n) === n ? n : null;
}

function getTmdbKey() {
  try {
    return String(globalThis.TMDB_API_KEY || '').trim();
  } catch (_error) {
    return '';
  }
}

function fetchJson(url) {
  return fetch(url, { headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response || !response.ok) {
        throw new Error('HTTP ' + (response ? response.status : 'no response'));
      }
      return response.json();
    })
    .then(function (data) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Expected JSON object');
      }
      return data;
    });
}

function toImdbId(contentId) {
  var direct = validImdb(contentId);
  if (direct) return Promise.resolve(direct);

  var id = String(contentId == null ? '' : contentId).trim()
    .replace(/^tmdb:/i, '');
  if (!/^[0-9]{1,12}$/.test(id)) return Promise.resolve(null);

  var key = getTmdbKey();
  if (!key) {
    ytsLog('TMDB key unavailable. Set a TMDB API key in Nuvio settings.');
    return Promise.resolve(null);
  }

  var url = 'https://api.themoviedb.org/3/movie/' + id +
    '/external_ids?api_key=' + encodeURIComponent(key);
  return fetchJson(url).then(function (data) {
    return validImdb(data.imdb_id);
  });
}

function findYtsMovie(imdbId) {
  var path = '/list_movies.json?query_term=' + encodeURIComponent(imdbId) + '&limit=50';

  function tryBase(index) {
    if (index >= YTS_API_BASES.length) return Promise.resolve(null);
    var base = YTS_API_BASES[index];
    return fetchJson(base + path).then(function (payload) {
      if (payload.status !== 'ok' || !payload.data ||
          typeof payload.data !== 'object') {
        throw new Error('Invalid YTS envelope');
      }
      var movies = payload.data.movies;
      if (movies == null) return null;
      if (!Array.isArray(movies)) throw new Error('Invalid movies collection');
      for (var i = 0; i < movies.length; i++) {
        if (validImdb(movies[i] && movies[i].imdb_code) === imdbId) {
          return movies[i];
        }
      }
      return null;
    }).then(function (movie) {
      return movie || tryBase(index + 1);
    }, function (error) {
      ytsLog('API ' + (index + 1) + ' unavailable: ' + (error && error.message || error));
      return tryBase(index + 1);
    });
  }
  return tryBase(0);
}

function torrentQuality(torrent) {
  var raw = String(torrent && torrent.quality || '').trim().toLowerCase();
  if (raw === '2160p' || raw === '4k' || raw === 'uhd') return '4K';
  if (raw === '1080p') return '1080p';
  if (raw === '720p') return '720p';
  if (raw === '480p') return '480p';
  return 'Unknown';
}

function makeMagnet(hash, name) {
  var url = 'magnet:?xt=urn:btih:' + hash + '&dn=' + encodeURIComponent(name);
  for (var i = 0; i < YTS_TRACKERS.length; i++) {
    url += '&tr=' + encodeURIComponent(YTS_TRACKERS[i]);
  }
  return url;
}


function ytsReadTorrent(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 16 || bytes.length > 3000000) throw new Error('Bad torrent metadata length');
  let p = 0, count = 0, infoRange = null;
  function scan(depth) {
    if (++count > 50000 || depth > 24 || p >= bytes.length) throw new Error('Bad bencode');
    const b = bytes[p];
    if (b === 105) {
      let s = ++p;
      while (p < bytes.length && bytes[p] !== 101) p++;
      if (p >= bytes.length) throw new Error('Bad integer');
      let v = '';
      for (let i = s; i < p; i++) v += String.fromCharCode(bytes[i]);
      p++;
      if (!/^-?\d+$/.test(v) || !Number.isSafeInteger(+v)) throw new Error('Invalid integer');
      return +v;
    }
    if (b === 100 || b === 108) {
      const dict = b === 100;
      p++;
      const out = dict ? Object.create(null) : [];
      while (p < bytes.length && bytes[p] !== 101) {
        if (dict) {
          const keyBytes = scan(depth + 1);
          if (!(keyBytes instanceof Uint8Array) || keyBytes.length > 256) throw new Error('Bad key');
          let k = '';
          for (let i = 0; i < keyBytes.length; i++) k += String.fromCharCode(keyBytes[i]);
          const start = p;
          const v = scan(depth + 1);
          if (depth === 0 && k === 'info') infoRange = [start, p];
          out[k] = v;
        } else out.push(scan(depth + 1));
      }
      if (p >= bytes.length) throw new Error('Bad container');
      p++;
      return out;
    }
    if (b < 48 || b > 57) throw new Error('Invalid bencode token');
    let len = 0;
    while (p < bytes.length && bytes[p] !== 58) {
      const c = bytes[p++];
      if (c < 48 || c > 57) throw new Error('Bad string length');
      len = len * 10 + c - 48;
      if (len > 3000000) throw new Error('String too large');
    }
    if (p >= bytes.length || p + 1 + len > bytes.length) throw new Error('String truncated');
    p++;
    const value = bytes.subarray(p, p + len);
    p += len;
    return value;
  }
  const root = scan(0);
  if (p !== bytes.length || !infoRange || !root.info) throw new Error('No torrent info');
  return { root, infoBytes: bytes.subarray(infoRange[0], infoRange[1]) };
}
function ytsVideoFile(info) {
  function name(bytes) { return bytes instanceof Uint8Array && bytes.length <= 4096 ? new TextDecoder().decode(bytes) : ''; }
  const matches = /\.(mkv|mp4|m4v|avi|mov|webm|ts)$/i;
  let chosen = null;
  if (Array.isArray(info.files)) {
    info.files.forEach(function(file, index) {
      if (!file || typeof file.length !== 'number') return;
      const path = file['path.utf-8'] || file.path;
      if (!Array.isArray(path) || !path.length) return;
      const filename = name(path[path.length - 1]);
      if (file.length >= 20000000 && matches.test(filename) && (!chosen || file.length > chosen.length)) {
        chosen = { index, filename, length: file.length };
      }
    });
  } else {
    const filename = name(info['name.utf-8'] || info.name);
    if (info.length >= 20000000 && matches.test(filename)) chosen = { index: 0, filename, length: info.length };
  }
  return chosen;
}
function ytsVerifiedFileIndex(torrent, hash) {
  const url = torrent && typeof torrent.url === 'string' ? torrent.url : '';
  if (!url) return Promise.resolve({selected: null, reason: 'NoURL'});
  if (!/^https:\/\/(?:[a-z\d-]+\.)*(?:yts\.(?:gg|bz|lt|am|ag|mx)|accel\.li)\//i.test(url)) {
    return Promise.resolve({selected: null, reason: 'Host'});
  }
  return fetch(url, { headers: { Accept: 'application/x-bittorrent' } })
    .then(function(r) {
      if (!r || !r.ok) return {reason: 'HTTP' + (r && r.status || '0')};
      return r.arrayBuffer().then(function(bytes) { return {bytes: bytes}; });
    })
    .then(function(reply) {
      if (reply.reason) return {selected: null, reason: reply.reason};
      var parsed;
      try { parsed = ytsReadTorrent(reply.bytes); }
      catch (_e) { return {selected: null, reason: 'InvalidTorrent'}; }
      return crypto.subtle.digest('SHA-1', parsed.infoBytes).then(function(buffer) {
        const digest = new Uint8Array(buffer);
        let hex = '';
        digest.forEach(function(b) { hex += b.toString(16).padStart(2, '0'); });
        if (hex !== hash) return {selected: null, reason: 'HashMismatch'};
        const selected = ytsVideoFile(parsed.root.info);
        if (!selected) return {selected: null, reason: 'NoVideo'};
        return {selected: selected, reason: ''};
      });
    }).catch(function(error) {
      ytsLog('Metadata check failed: ' + (error && error.message || error));
      return {selected: null, reason: 'Network'};
    });
}

function streamItems(movie) {
  if (!movie || !Array.isArray(movie.torrents)) return [];
  var seen = Object.create(null);
  var originals = Object.create(null);
  var list = [];
  for (var i = 0; i < movie.torrents.length; i++) {
    var torrent = movie.torrents[i];
    if (!torrent || typeof torrent !== 'object') continue;
    var hash = validHash(torrent.hash);
    if (!hash || seen[hash]) continue;
    seen[hash] = true;

    var quality = torrentQuality(torrent);
    var size = torrent.size != null ? String(torrent.size).trim() : '';
    var codec = torrent.video_codec != null ? String(torrent.video_codec).trim() : '';
    var sourceType = torrent.type != null ? String(torrent.type).trim() : '';
    var seeders = saneInt(torrent.seeds);
    var peers = saneInt(torrent.peers);
    var label = [quality, sourceType, codec, size].filter(Boolean).join(' | ');
    if (seeders !== null) label += ' | Seeds ' + seeders;
    var torrentName = String(movie.title_long || movie.title || 'Movie') + ' ' +
      quality + (codec ? ' ' + codec : '');

    var item = {
      name: 'YTS ' + quality + (codec ? ' ' + codec : '') +
        (seeders !== null ? ' | S:' + seeders : ''),
      title: 'YTS | ' + label,
      url: makeMagnet(hash, torrentName),
      infoHash: hash,
      quality: quality,
      provider: 'YTS',
      type: 'torrent'
    };
    if (size) item.size = size;
    if (seeders !== null) item.seeders = seeders;
    if (peers !== null) item.peers = peers;
    list.push(item);
    originals[hash] = torrent;
  }

  var rank = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 };
  list.sort(function (a, b) {
    var qualityDelta = (rank[b.quality] || 0) - (rank[a.quality] || 0);
    return qualityDelta || (b.seeders || 0) - (a.seeders || 0);
  });
  return Promise.all(list.slice(0, 12).map(function(item) {
    return ytsVerifiedFileIndex(originals[item.infoHash], item.infoHash).then(function(check) {
      if (check.selected) {
        // Nuvio 0.6.12 maps torrent://hash/index to fileIdx.
        item.url = 'torrent://' + item.infoHash + '/' + check.selected.index;
        item.name += ' | Video #' + check.selected.index;
        return [item];
      }
      // Diagnostic fallback: Auto keeps previous behavior. The second entry
      // explicitly tests whether the video is file 1; it is NOT verified.
      item.name += ' | Auto (' + check.reason + ')';
      const trial = Object.assign({}, item, {
        name: item.name.replace(/ \| Auto \([^)]+\)$/, ' | Try File #1'),
        url: 'torrent://' + item.infoHash + '/1'
      });
      return [item, trial];
    });
  })).then(function(groups) {
    return [].concat.apply([], groups);
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (String(mediaType || '').toLowerCase() !== 'movie') {
    return Promise.resolve([]);
  }
  return toImdbId(tmdbId)
    .then(function (imdbId) {
      if (!imdbId) return [];
      return findYtsMovie(imdbId).then(streamItems);
    })
    .catch(function (error) {
      ytsLog('Lookup failed: ' + (error && error.message || error));
      return [];
    });
}

module.exports = { getStreams: getStreams };

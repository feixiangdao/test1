/*
 * YTS Movie Sources for Nuvio Mobile Android (Full build), v0.2.0.
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

function streamItems(movie) {
  if (!movie || !Array.isArray(movie.torrents)) return [];
  var seen = Object.create(null);
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
  }

  var rank = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 };
  list.sort(function (a, b) {
    var qualityDelta = (rank[b.quality] || 0) - (rank[a.quality] || 0);
    return qualityDelta || (b.seeders || 0) - (a.seeders || 0);
  });
  return list;
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

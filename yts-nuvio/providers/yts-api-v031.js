/*
 * YTS API Diagnostic 0.3.1 for Nuvio Android 0.6.12-beta.
 * New provider ID and filename to avoid prior on-device JS code cache.
 * Listings are sourced from list_movies + movie_details only.
 * No .torrent metadata requests and no guessed file index.
 * Source names expose observed API counts and hash prefix for troubleshooting.
 * Metadata and seeder figures are not proof of a playable video.
 */
var YTS_DIAG_API = [
  'https://movies-api.accel.li/api/v2/',
  'https://yts.gg/api/v2/'
];
function diagWarn(message) {
  try { console.warn('[YTS v031] ' + message); } catch (_) {}
}
function isImdb(value) {
  var v = String(value == null ? '' : value).trim().toLowerCase();
  return /^tt[0-9]{7,10}$/.test(v) ? v : null;
}
function toHash(value) {
  var h = String(value == null ? '' : value).trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(h) ? h : null;
}
function asInt(value) {
  if (value === null || value === undefined) return null;
  var n = Number(value);
  return isFinite(n) && n >= 0 && Math.floor(n) === n ? n : null;
}
function qualityName(raw) {
  var s = String(raw || '').toLowerCase();
  if (s === '2160p' || s === '4k' || s === 'uhd') return '4K';
  if (s === '1080p') return '1080p';
  if (s === '720p') return '720p';
  if (s === '480p') return '480p';
  return s || '?';
}
function getJson(url) {
  return fetch(url, {headers: {Accept: 'application/json'}})
    .then(function(response) {
      if (!response || !response.ok) throw Error('HTTP' + (response && response.status || 0));
      return response.json();
    }).then(function(data) {
      if (!data || data.status !== 'ok' || !data.data) throw Error('Unexpected API response');
      return data;
    });
}
function imdbFromTmdb(id) {
  var direct = isImdb(id);
  if (direct) return Promise.resolve(direct);
  var clean = String(id == null ? '' : id).trim().replace(/^tmdb:/i, '');
  if (!/^[0-9]{1,12}$/.test(clean)) return Promise.resolve(null);
  var key = String(globalThis.TMDB_API_KEY || '').trim();
  if (!key) return Promise.resolve(null);
  return fetch('https://api.themoviedb.org/3/movie/' + clean +
    '/external_ids?api_key=' + encodeURIComponent(key), {headers: {Accept:'application/json'}})
    .then(function(response) {
      if (!response || !response.ok) throw Error('TMDB HTTP' + (response && response.status || 0));
      return response.json();
    }).then(function(payload) { return isImdb(payload && payload.imdb_id); });
}
function listByImdb(imdb) {
  var path = 'list_movies.json?query_term=' + encodeURIComponent(imdb) + '&limit=50';
  function tryBase(index) {
    if (index >= YTS_DIAG_API.length) return Promise.resolve(null);
    return getJson(YTS_DIAG_API[index] + path).then(function(payload) {
      var movies = payload.data.movies;
      if (!Array.isArray(movies)) return tryBase(index + 1);
      var matches = movies.filter(function(movie) {
        return movie && isImdb(movie.imdb_code) === imdb;
      });
      if (!matches.length) return tryBase(index + 1);
      var movie = matches[0];
      var hashes = Object.create(null);
      var torrents = [];
      matches.forEach(function(m) {
        (Array.isArray(m.torrents) ? m.torrents : []).forEach(function(t) {
          var h = toHash(t && t.hash);
          if (h && !hashes[h]) { hashes[h] = true; torrents.push(t); }
        });
      });
      return {movie:movie, torrents:torrents, listCount:torrents.length, listMovieCount:matches.length, apiIndex:index};
    }, function(error) {
      diagWarn('list failed at API ' + index + ': ' + (error && error.message || error));
      return tryBase(index + 1);
    });
  }
  return tryBase(0);
}
function torrentStats(torrents) {
  var values=Array.isArray(torrents)?torrents:[], valid=0, uniq=Object.create(null);
  values.forEach(function(t) {
    var hash=toHash(t&&t.hash);
    if(hash){valid++;uniq[hash]=true;}
  });
  return {raw:values.length,valid:valid,unique:Object.keys(uniq).length};
}
function withDetails(listed, imdb) {
  if (!listed) return Promise.resolve(null);
  var movieId = String(listed.movie && listed.movie.id || '').trim();
  if (!/^[0-9]{1,12}$/.test(movieId)) {
    return Promise.resolve({torrents:listed.torrents, listCount:listed.listCount,
      detailsCount:-1, detailValid:-1, detailUnique:-1,
      base:listed.apiIndex, detailStatus:'NOID',imdbId:imdb,movieId:movieId});
  }
  var path = 'movie_details.json?movie_id=' + encodeURIComponent(movieId);
  var ordered = [listed.apiIndex, listed.apiIndex === 0 ? 1 : 0];
  function tryOne(i) {
    if (i >= ordered.length) {
      return Promise.resolve({torrents:listed.torrents, listCount:listed.listCount,
        detailsCount:-1, detailValid:-1, detailUnique:-1,
        base:listed.apiIndex, detailStatus:'ERR',imdbId:imdb,movieId:movieId});
    }
    var baseIdx = ordered[i];
    return getJson(YTS_DIAG_API[baseIdx] + path).then(function(payload) {
      var film = payload.data && payload.data.movie;
      if (!film || isImdb(film.imdb_code) !== imdb || !Array.isArray(film.torrents)) {
        return tryOne(i+1);
      }
      var hashSet = Object.create(null);
      var combined = [];
      film.torrents.concat(listed.torrents).forEach(function(t) {
        var h = toHash(t && t.hash);
        if (h && !hashSet[h]) {hashSet[h] = true;combined.push(t);}
      });
      var stats=torrentStats(film.torrents);
      return {torrents:combined, listCount:listed.listCount,
        detailsCount:stats.raw,detailValid:stats.valid,detailUnique:stats.unique,
        base:listed.apiIndex,detailStatus:'OK'+baseIdx,imdbId:imdb,movieId:movieId};
    }, function(error) {
      diagWarn('details failed at API ' + baseIdx + ': ' + (error && error.message || error));
      return tryOne(i+1);
    });
  }
  return tryOne(0);
}
function buildStreams(result) {
  if (!result || !Array.isArray(result.torrents)) return [];
  var items = [];
  result.torrents.forEach(function(torrent) {
    var hash = toHash(torrent && torrent.hash);
    if (!hash) return;
    var q = qualityName(torrent.quality);
    var codec = String(torrent.video_codec || '').trim();
    var sz = String(torrent.size || '').trim();
    var seeds = asInt(torrent.seeds);
    var flags='v031 '+(result.imdbId||'?')+' M'+(result.movieId||'?')+
      ' L'+result.listCount+' D'+(result.detailsCount<0?result.detailStatus:result.detailsCount)+
      ' V'+(result.detailValid<0?'?':result.detailValid)+
      ' U'+(result.detailUnique<0?'?':result.detailUnique)+
      ' R'+result.torrents.length+' A'+result.base;
    var btih = 'magnet:?xt=urn:btih:' + hash + '&dn=' +
      encodeURIComponent('YTS ' + q + ' ' + codec);
    // Do not claim availability. Report the exact API hash prefix for comparison.
    var name = 'YTS ' + q + (codec ? ' ' + codec : '') +
      ' | ' + flags + ' | ' + hash.slice(0,8).toUpperCase();
    if (seeds !== null) name += ' | S:' + seeds;
    var item = {name:name, title:name, url:btih, infoHash:hash, quality:q, type:'torrent', provider:'YTS'};
    if (sz) item.size=sz;
    if (seeds !== null) item.seeders=seeds;
    items.push(item);
  });
  var rank = {'4K':4,'1080p':3,'720p':2,'480p':1};
  return items.sort(function(a,b){
    return (rank[b.quality]||0)-(rank[a.quality]||0) || (b.seeders||0)-(a.seeders||0);
  });
}
function getStreams(tmdbId,mediaType,season,episode) {
  if (String(mediaType||'').toLowerCase()!=='movie') return Promise.resolve([]);
  return imdbFromTmdb(tmdbId).then(function(imdb){
    if (!imdb) return [];
    return listByImdb(imdb).then(function(listed) {
      return withDetails(listed,imdb);
    }).then(buildStreams);
  }).catch(function(error){
    diagWarn('Provider failed: ' + (error && error.message || error));
    return [];
  });
}
module.exports={getStreams:getStreams};

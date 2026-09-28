/*
 * Jellyfin Direct for Nuvio
 * Uses only the user's configured Jellyfin server and access token.
 * Returns original/static media URLs to Nuvio's native player; no iframe.
 */

function cfg() {
  return (typeof SCRAPER_SETTINGS === 'object' && SCRAPER_SETTINGS) ? SCRAPER_SETTINGS : {};
}

function baseUrl() {
  var raw = String(cfg().serverUrl || '').trim();
  while (raw.endsWith('/')) raw = raw.slice(0, -1);
  return /^https?:\/\//i.test(raw) ? raw : '';
}

function cleanToken() {
  return String(cfg().accessToken || '').trim();
}

function safeAuthValue(value) {
  return String(value || '').replace(/[\r\n"]/g, '');
}

function authHeaders() {
  var token = cleanToken();
  return {
    'Accept': 'application/json',
    'Authorization':
      'MediaBrowser Client="Nuvio", Device="Nuvio", DeviceId="cinejoy-jellyfin-direct", Version="1.0.0", Token="' +
      safeAuthValue(token) + '"'
  };
}

function streamHeaders() {
  return { 'Authorization': authHeaders().Authorization };
}

async function getJson(path) {
  var base = baseUrl();
  if (!base || !cleanToken()) throw new Error('Jellyfin server URL / access token not configured');
  var res = await fetch(base + path, { headers: authHeaders() });
  if (!res || !res.ok) throw new Error('Jellyfin HTTP ' + (res ? res.status : 'unknown'));
  var data = await res.json();
  if (data == null) throw new Error('Jellyfin returned empty JSON');
  return data;
}

async function userId() {
  var configured = String(cfg().userId || '').trim();
  if (configured) return configured;
  var me = await getJson('/Users/Me');
  return me && me.Id ? String(me.Id) : '';
}

function providerId(item, provider) {
  var ids = item && item.ProviderIds;
  if (!ids || typeof ids !== 'object') return '';
  var wanted = String(provider || '').toLowerCase();
  var keys = Object.keys(ids);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === wanted) return String(ids[keys[i]] || '');
  }
  return '';
}

function firstVideoStream(source) {
  var rows = source && Array.isArray(source.MediaStreams) ? source.MediaStreams : [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].Type || '').toLowerCase() === 'video') return rows[i];
  }
  return null;
}

function firstAudioStream(source) {
  var rows = source && Array.isArray(source.MediaStreams) ? source.MediaStreams : [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].Type || '').toLowerCase() === 'audio') return rows[i];
  }
  return null;
}

function qualityOf(source) {
  var v = firstVideoStream(source) || {};
  var h = Number(v.Height || 0);
  if (h >= 2160) return '2160p';
  if (h >= 1440) return '1440p';
  if (h >= 1080) return '1080p';
  if (h >= 720) return '720p';
  if (h >= 480) return '480p';
  return source && source.Container ? String(source.Container).toUpperCase() : 'Direct';
}

function humanSize(bytes) {
  var n = Number(bytes || 0);
  if (!(n > 0)) return undefined;
  var units = ['B','KB','MB','GB','TB'];
  var i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i >= 3 ? n.toFixed(2) : n.toFixed(0)) + ' ' + units[i];
}

function absoluteMediaUrl(pathOrUrl) {
  var value = String(pathOrUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.charAt(0) !== '/') value = '/' + value;
  return baseUrl() + value;
}

function sourceToResult(itemId, source, index) {
  var sourceId = String((source && (source.Id || source.MediaSourceId)) || '').trim();
  var direct = absoluteMediaUrl(source && source.DirectStreamUrl);
  if (!direct) {
    direct = baseUrl() + '/Videos/' + encodeURIComponent(itemId) + '/stream?static=true';
    if (sourceId) direct += '&MediaSourceId=' + encodeURIComponent(sourceId);
  }

  var v = firstVideoStream(source) || {};
  var a = firstAudioStream(source) || {};
  var codec = String(v.Codec || '').trim().toUpperCase();
  var label = String((source && source.Name) || '').trim();
  var q = qualityOf(source);
  var parts = [q];
  if (codec) parts.push(codec);
  if (label && label.toLowerCase() !== 'default') parts.push(label);

  return {
    name: 'Jellyfin Direct' + (index > 0 ? ' #' + (index + 1) : ''),
    title: parts.join(' • '),
    url: direct,
    quality: q,
    size: humanSize(source && source.Size),
    language: String(a.Language || '').trim() || undefined,
    provider: 'Jellyfin',
    type: 'direct',
    headers: streamHeaders()
  };
}

async function playbackResults(itemId) {
  var uid = await userId();
  if (!uid) return [];
  var info = await getJson('/Items/' + encodeURIComponent(itemId) + '/PlaybackInfo?UserId=' + encodeURIComponent(uid));
  var sources = info && Array.isArray(info.MediaSources) ? info.MediaSources : [];
  var out = [];
  for (var i = 0; i < sources.length; i++) {
    var row = sourceToResult(itemId, sources[i], i);
    if (row.url) out.push(row);
  }
  return out;
}

async function findLibraryItem(tmdbId, kind, uid) {
  var path = '/Users/' + encodeURIComponent(uid) +
    '/Items?Recursive=true&IncludeItemTypes=' + encodeURIComponent(kind) +
    '&Fields=ProviderIds&EnableImages=false&Limit=5000';
  var data = await getJson(path);
  var rows = data && Array.isArray(data.Items) ? data.Items : [];
  var wanted = String(tmdbId);
  for (var i = 0; i < rows.length; i++) {
    if (providerId(rows[i], 'tmdb') === wanted) return rows[i];
  }
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (!baseUrl() || !cleanToken()) return [];
    var uid = await userId();
    if (!uid) return [];

    if (mediaType === 'movie') {
      var movie = await findLibraryItem(tmdbId, 'Movie', uid);
      if (!movie || !movie.Id) return [];
      return await playbackResults(String(movie.Id));
    }

    if (mediaType === 'tv') {
      var series = await findLibraryItem(tmdbId, 'Series', uid);
      if (!series || !series.Id) return [];
      var s = Number(season);
      var e = Number(episode);
      if (!Number.isInteger(s) || !Number.isInteger(e) || e < 1) return [];

      var epData = await getJson(
        '/Shows/' + encodeURIComponent(series.Id) + '/Episodes?UserId=' + encodeURIComponent(uid) +
        '&Season=' + encodeURIComponent(s) + '&Fields=ProviderIds&EnableImages=false&Limit=500'
      );
      var eps = epData && Array.isArray(epData.Items) ? epData.Items : [];
      var target = null;
      for (var i = 0; i < eps.length; i++) {
        var row = eps[i];
        if (Number(row.IndexNumber) === e &&
            (row.ParentIndexNumber == null || Number(row.ParentIndexNumber) === s)) {
          target = row;
          break;
        }
      }
      if (!target || !target.Id) return [];
      return await playbackResults(String(target.Id));
    }

    return [];
  } catch (err) {
    console.error('[Jellyfin Direct]', err && err.message ? err.message : String(err));
    return [];
  }
}

function onSettings() {
  return [
    {
      type: 'header',
      label: 'Jellyfin Direct'
    },
    {
      type: 'info',
      label: '只连接你自己的 Jellyfin 服务器。影片按 TMDB ID 匹配，命中后把原始媒体流直接交给 Nuvio 原生播放器。'
    },
    {
      type: 'text',
      key: 'serverUrl',
      label: 'Jellyfin Server URL',
      placeholder: 'https://jellyfin.example.com 或 http://192.168.1.10:8096',
      description: '可填写公网 HTTPS 地址或局域网地址；末尾不要紧。'
    },
    {
      type: 'text',
      key: 'accessToken',
      label: 'Access Token',
      placeholder: 'Jellyfin access token',
      isPassword: true,
      description: '使用当前用户的 Jellyfin access token。不会写入 GitHub，只保存在 Nuvio 插件设置中。'
    },
    {
      type: 'text',
      key: 'userId',
      label: 'User ID（可选）',
      placeholder: '留空时自动调用 /Users/Me',
      description: '通常可以留空；只有服务器无法通过 token 返回 /Users/Me 时才手工填写。'
    }
  ];
}

module.exports = { getStreams, onSettings };

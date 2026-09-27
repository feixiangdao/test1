// Cinejoy -> OK影视Pro / FongMi QuickJS Spider
// Independent compatibility implementation based on steveyout/cinejoy's public architecture:
// TMDB metadata + provider embed URLs + OK影视 WebView sniffing.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const OPENSUB_BASE = 'https://opensubtitles-v3.strem.io';
const OPENSUB_LEGACY_BASE = 'https://opensubtitles.strem.io/stremio/v1';
const SUBDL_API_BASE = 'https://api.subdl.com/api/v1/subtitles';
const SUBDL_DL_BASE = 'https://dl.subdl.com';
const CINEJOY_REFERER = 'https://cinejoy.pk/';
const UA = 'Mozilla/5.0 (Linux; Android 10; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_RULE = 'cinejoy';
const LOCAL_TMDB_KEY = 'tmdbKey';
const LOCAL_SUBDL_KEY = 'subdlKey';

let TMDB_KEY = '';
let TMDB_TOKEN = '';
let LANG = 'zh-CN';
let SITE_KEY = 'Cinejoy_OKPro_v5';

const PROVIDERS = [
  { id: 'cinemaos',  name: 'Aether 1',         base: 'https://cinemaos.tech' },
  { id: 'vidking',   name: 'Nebula Stream X',  base: 'https://www.vidking.net' },
  { id: 'vidlink',   name: 'Hyperion Link',     base: 'https://vidlink.pro' },
  { id: 'vidsrc_to', name: 'Solaris Cloud',     base: 'https://vidsrc.to/embed' },
  { id: 'vidnest',   name: 'Chronos Node',      base: 'https://vidnest.fun' },
  { id: 'vidfast',   name: 'Vortex Quantum',    base: 'https://vidfast.net' },
  { id: 'videasy',   name: 'Elysium Edge',      base: 'https://player.videasy.net' },
  { id: 'vidsrc_me', name: 'Pulsar Relay',      base: 'https://vsembed.ru/embed' },
  { id: 'vidup',     name: 'Titan Mesh',        base: 'https://vidup.to' },
  { id: 'rivestream',name: 'Zenith Direct',     base: 'https://rivestream.org/embed' },
  { id: 'vidcore',   name: 'Astral Core 9',     base: 'https://vidcore.org' },
];

const MOVIE_GENRES = [
  ['28','动作'],['12','冒险'],['16','动画'],['35','喜剧'],['80','犯罪'],['99','纪录'],
  ['18','剧情'],['10751','家庭'],['14','奇幻'],['36','历史'],['27','恐怖'],['10402','音乐'],
  ['9648','悬疑'],['10749','爱情'],['878','科幻'],['10770','电视电影'],['53','惊悚'],['10752','战争'],['37','西部']
];

const TV_GENRES = [
  ['10759','动作冒险'],['16','动画'],['35','喜剧'],['80','犯罪'],['99','纪录'],['18','剧情'],
  ['10751','家庭'],['10762','儿童'],['9648','悬疑'],['10763','新闻'],['10764','真人秀'],
  ['10765','科幻奇幻'],['10766','肥皂剧'],['10767','脱口秀'],['10768','战争政治'],['37','西部']
];

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch (_) { return fallback; }
}

function enc(v) {
  return encodeURIComponent(String(v == null ? '' : v));
}

function pad2(n) {
  n = Number(n) || 0;
  return n < 10 ? '0' + n : String(n);
}

function image(path, size) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return IMG_BASE + '/' + (size || 'w500') + path;
}

function yearOf(date) {
  return date && String(date).length >= 4 ? String(date).slice(0, 4) : '';
}

function cleanText(v) {
  return v == null ? '' : String(v).replace(/[\r\n]+/g, ' ').trim();
}

function isTmdbV3Key(v) {
  return /^[a-f0-9]{32}$/i.test(cleanText(v));
}

function getLocalTmdbKey() {
  try {
    const v = cleanText(local.get(LOCAL_RULE, LOCAL_TMDB_KEY));
    return isTmdbV3Key(v) ? v : '';
  } catch (_) {
    return '';
  }
}

function setLocalTmdbKey(v) {
  const key = cleanText(v);
  if (!isTmdbV3Key(key)) return false;
  try {
    local.set(LOCAL_RULE, LOCAL_TMDB_KEY, key);
    TMDB_KEY = key;
    return true;
  } catch (_) {
    return false;
  }
}

function deleteLocalTmdbKey() {
  try {
    local.delete(LOCAL_RULE, LOCAL_TMDB_KEY);
    TMDB_KEY = '';
    return true;
  } catch (_) {
    return false;
  }
}

function getLocalSubdlKey() {
  try {
    return cleanText(local.get(LOCAL_RULE, LOCAL_SUBDL_KEY));
  } catch (_) {
    return '';
  }
}

function subdlSettingsCard() {
  const saved = !!getLocalSubdlKey();
  return {
    vod_id: 'settings:subdl',
    vod_name: '📝 SubDL API Key 设置',
    vod_pic: '',
    vod_remarks: saved ? '本机已保存 · 点击修改' : '未设置 · 点击添加'
  };
}

function getTmdbSettingsUrl() {
  try {
    return getProxy(true)
      + '&siteKey=' + enc(SITE_KEY) + ''
      + '&kind=tmdb-form';
  } catch (_) {
    return '';
  }
}

function tmdbSettingsCard() {
  const saved = !!getLocalTmdbKey();
  return {
    vod_id: 'settings:tmdb',
    vod_name: '🔑 TMDB Key 设置',
    vod_pic: '',
    vod_remarks: saved ? '本机已保存 · 点击修改' : '未设置 · 点击添加'
  };
}

function tmdbSettingsDetail() {
  const saved = !!getLocalTmdbKey();
  return {
    vod_id: 'settings:tmdb',
    vod_name: 'TMDB Key 本地设置',
    vod_pic: '',
    vod_year: '',
    vod_area: '本机',
    vod_remarks: saved ? '当前状态：本机已保存 TMDB Key' : '当前状态：尚未设置 TMDB Key',
    vod_actor: '',
    vod_director: '',
    vod_content: '点击下面的「打开设置」即可在 OK影视Pro 内弹出设置窗口。TMDB Key 只保存在本机，不会写入 GitHub。',
    type_name: '设置',
    vod_play_from: 'TMDB 设置',
    vod_play_url: '打开设置$settings|tmdb'
  };
}

function tmdb(path, params) {
  const savedKey = getLocalTmdbKey();
  if (savedKey) TMDB_KEY = savedKey;
  if (!TMDB_KEY && !TMDB_TOKEN) {
    throw new Error('未配置 TMDB API Key/Token');
  }

  const p = params || {};
  const qs = [];
  if (TMDB_KEY) qs.push('api_key=' + enc(TMDB_KEY));
  if (LANG && p.language == null) qs.push('language=' + enc(LANG));
  Object.keys(p).forEach(function (k) {
    const v = p[k];
    if (v !== undefined && v !== null && v !== '') qs.push(enc(k) + '=' + enc(v));
  });

  const headers = {
    'Accept': 'application/json',
    'User-Agent': UA
  };
  if (TMDB_TOKEN) headers['Authorization'] = 'Bearer ' + TMDB_TOKEN;

  const url = TMDB_BASE + path + (qs.length ? '?' + qs.join('&') : '');
  const r = req(url, { headers: headers, timeout: 15000 });
  const code = Number(r && r.code ? r.code : 0);
  if (!r || !r.content || code < 200 || code >= 300) {
    throw new Error('TMDB 请求失败: HTTP ' + code);
  }
  return JSON.parse(r.content);
}

function parseExt(ext) {
  if (!ext) return {};
  if (typeof ext === 'object') return ext;
  const s = String(ext).trim();
  if (!s) return {};
  if (s[0] === '{') return safeJsonParse(s, {});
  return { tmdbKey: s };
}

function subtitleMime(url) {
  const u = String(url || '').toLowerCase().split('?')[0];
  if (u.endsWith('.vtt')) return 'text/vtt';
  if (u.endsWith('.srt')) return 'application/x-subrip';
  if (u.endsWith('.ass') || u.endsWith('.ssa')) return 'text/x-ssa';
  if (u.endsWith('.ttml') || u.endsWith('.xml')) return 'application/ttml+xml';
  return '';
}

function resolveImdbId(type, tmdbId) {
  try {
    const data = tmdb('/' + type + '/' + tmdbId + '/external_ids', {});
    return cleanText(data && data.imdb_id ? data.imdb_id : '');
  } catch (_) {
    return '';
  }
}

function fetchSubtitleUrl(url) {
  try {
    const r = req(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': UA
      },
      timeout: 12000
    });
    const code = Number(r && r.code ? r.code : 0);
    if (!r || !r.content || code < 200 || code >= 300) {
      return { code: code, list: [] };
    }
    const data = safeJsonParse(r.content, {});
    return {
      code: code,
      list: data && Array.isArray(data.subtitles) ? data.subtitles : []
    };
  } catch (_) {
    return { code: -1, list: [] };
  }
}

function subtitleProxyUrl(remoteUrl, index) {
  try {
    const base = getProxy(true);
    return base
      + '&siteKey=' + enc(SITE_KEY) + ''
      + '&kind=subtitle'
      + '&n=' + enc(index || 0)
      + '&sub=' + enc(remoteUrl);
  } catch (_) {
    return remoteUrl;
  }
}

function normalizeSubs(list, out, seen) {
  (list || []).forEach(function (s) {
    if (!s || !s.url || out.length >= 120) return;
    const remote = String(s.url);
    if (seen[remote]) return;
    seen[remote] = true;

    const lang = cleanText(s.lang || '');
    const label = cleanText(s.label || s.name || lang || '字幕');
    out.push({
      url: subtitleProxyUrl(remote, out.length + 1),
      name: label,
      lang: lang,
      format: 'application/x-subrip',
      flag: 0
    });
  });
}

function fetchSubtitles(type, tmdbId, season, episode) {
  const result = {
    imdbId: '',
    subs: [],
    debug: ''
  };

  try {
    const seen = {};
    const imdbId = resolveImdbId(type, tmdbId);
    result.imdbId = imdbId;

    const osCodes = [];
    let osCount = 0;

    if (imdbId && /^tt\d+$/i.test(imdbId)) {
      const mediaType = type === 'tv' ? 'series' : 'movie';
      const videoId = type === 'tv'
        ? imdbId + ':' + (Number(season) || 1) + ':' + (Number(episode) || 1)
        : imdbId;

      const urls = [
        OPENSUB_BASE + '/subtitles/' + mediaType + '/' + videoId + '.json',
        OPENSUB_BASE + '/subtitles/' + mediaType + '/' + videoId + '/*.json',
        OPENSUB_LEGACY_BASE + '/subtitles/' + mediaType + '/' + videoId + '.json',
        OPENSUB_LEGACY_BASE + '/subtitles/' + mediaType + '/' + videoId + '/*.json'
      ];

      const before = result.subs.length;
      for (let i = 0; i < urls.length && result.subs.length === before; i++) {
        const r = fetchSubtitleUrl(urls[i]);
        osCodes.push(String(r.code));
        normalizeSubs(r.list, result.subs, seen);
      }
      osCount = result.subs.length - before;
    } else {
      osCodes.push('无IMDb');
    }

    const subdl = fetchSubdlSubtitles(type, tmdbId, season, episode, result.subs, seen);

    result.debug = 'IMDb ' + (imdbId || '无')
      + ' / OS ' + osCodes.join(',') + ' (' + osCount + ')'
      + ' / SubDL ' + subdl.code + ' (' + subdl.count + ')'
      + ' / 总字幕 ' + result.subs.length
      + ' / 本地代理';

    return result;
  } catch (_) {
    result.debug = '字幕请求异常';
    return result;
  }
}


function subdlLangInfo(code, text) {
  const c = cleanText(code || '').toUpperCase();
  const t = cleanText(text || '').toLowerCase();
  if (c === 'ZH_BG' || /zh[-_]?hant|traditional|繁體|繁体|\bcht\b/.test(t)) {
    return { lang: 'zh-TW', label: '繁中' };
  }
  if (/zh[-_]?hans|simplified|简体|簡體|\bchs\b/.test(t)) {
    return { lang: 'zh-CN', label: '简中' };
  }
  return { lang: 'zh-CN', label: '中文' };
}

function subdlRemoteUrl(path) {
  const u = cleanText(path || '');
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return SUBDL_DL_BASE + (u[0] === '/' ? u : '/' + u);
}

function subdlProxyUrl(remoteUrl, index, season, episode, lang) {
  try {
    return getProxy(true)
      + '&siteKey=' + enc(SITE_KEY)
      + '&kind=subdl-subtitle'
      + '&n=' + enc(index || 0)
      + '&season=' + enc(season || 0)
      + '&episode=' + enc(episode || 0)
      + '&lang=' + enc(lang || '')
      + '&sub=' + enc(remoteUrl);
  } catch (_) {
    return remoteUrl;
  }
}

function subdlUnpackForEpisode(files, season, episode) {
  if (!Array.isArray(files) || !files.length) return null;
  const s = Number(season) || 0;
  const e = Number(episode) || 0;

  function fmtScore(f) {
    const x = cleanText(f && (f.format || f.name || '')).toLowerCase();
    if (/srt/.test(x)) return 50;
    if (/ass/.test(x)) return 40;
    if (/ssa/.test(x)) return 35;
    if (/vtt/.test(x)) return 30;
    return 10;
  }

  let best = null;
  let bestScore = -1;
  files.forEach(function (f) {
    if (!f || !f.url) return;
    let score = fmtScore(f);
    const fs = Number(f.season) || 0;
    const fe = Number(f.episode) || 0;
    const name = cleanText(f.name || f.release_name || '');

    if (e > 0 && fe === e) score += 200;
    if (s > 0 && fs === s) score += 50;
    if (e > 0) {
      const ee = new RegExp('e0*' + e + '(?:\\D|$)', 'i');
      const se = new RegExp('s0*' + s + '[ ._\\-]*e0*' + e + '(?:\\D|$)', 'i');
      if (s > 0 && se.test(name)) score += 180;
      else if (ee.test(name)) score += 120;
    }

    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  });
  return best;
}

function fetchSubdlSubtitles(type, tmdbId, season, episode, out, seen) {
  const status = { code: '未配置', count: 0 };
  const apiKey = getLocalSubdlKey();
  if (!apiKey) return status;

  try {
    const qs = [
      'api_key=' + enc(apiKey),
      'tmdb_id=' + enc(tmdbId),
      'type=' + enc(type === 'tv' ? 'tv' : 'movie'),
      'languages=' + enc('ZH,ZH_BG'),
      'subs_per_page=30',
      'unpack=1',
      'releases=1',
      'client=custom_integration'
    ];
    if (type === 'tv') {
      qs.push('season_number=' + enc(Number(season) || 1));
      qs.push('episode_number=' + enc(Number(episode) || 1));
    }

    const r = req(SUBDL_API_BASE + '?' + qs.join('&'), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': UA
      },
      timeout: 15000
    });
    const code = Number(r && r.code ? r.code : 0);
    status.code = String(code || -1);
    if (!r || !r.content || code < 200 || code >= 300) return status;

    const data = safeJsonParse(r.content, {});
    const rows = data && Array.isArray(data.subtitles) ? data.subtitles : [];

    rows.forEach(function (s) {
      if (!s || out.length >= 120) return;

      const release = cleanText(s.release_name || s.name || '');
      const li = subdlLangInfo(s.language || s.lang || '', release);
      const unpack = subdlUnpackForEpisode(s.unpack_files || [], season, episode);
      const raw = unpack && unpack.url ? unpack.url : s.url;
      const remote = subdlRemoteUrl(raw);
      if (!remote || seen[remote]) return;
      seen[remote] = true;

      const display = cleanText(
        (unpack && (unpack.release_name || unpack.name))
        || s.release_name
        || s.name
        || '字幕'
      );
      const shortName = display.length > 72 ? display.slice(0, 69) + '...' : display;

      out.push({
        url: subdlProxyUrl(remote, out.length + 1, season, episode, s.language || s.lang || ''),
        name: '[SubDL] ' + li.label + (shortName ? ' · ' + shortName : ''),
        lang: li.lang,
        format: 'application/x-subrip',
        flag: 0
      });
      status.count += 1;
    });

    return status;
  } catch (_) {
    status.code = '异常';
    return status;
  }
}

function getMediaType(item, fallback) {
  if (item && item.media_type === 'tv') return 'tv';
  if (item && item.media_type === 'movie') return 'movie';
  if (item && item.first_air_date) return 'tv';
  return fallback === 'tv' ? 'tv' : 'movie';
}

function card(item, fallbackType) {
  const type = getMediaType(item, fallbackType);
  const name = cleanText(item.title || item.name || item.original_title || item.original_name || '未命名');
  const date = item.release_date || item.first_air_date || '';
  const score = Number(item.vote_average || 0);
  return {
    vod_id: type + ':' + item.id,
    vod_name: name,
    vod_pic: image(item.poster_path, 'w500'),
    vod_remarks: (score > 0 ? score.toFixed(1) + '分' : '') + (date ? ' · ' + yearOf(date) : '')
  };
}

function buildFilters(type) {
  const genres = type === 'tv' ? TV_GENRES : MOVIE_GENRES;
  const genreValues = [{ n: '全部', v: '' }].concat(genres.map(function (g) { return { n: g[1], v: g[0] }; }));
  const years = [{ n: '全部', v: '' }];
  const now = new Date().getFullYear();
  for (let y = now; y >= now - 20; y--) years.push({ n: String(y), v: String(y) });

  return [
    {
      key: 'sort',
      name: '排序',
      value: [
        { n: '热门', v: 'popularity.desc' },
        { n: '评分', v: 'vote_average.desc' },
        { n: '最新', v: type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc' }
      ]
    },
    { key: 'genre', name: '类型', value: genreValues },
    { key: 'year', name: '年份', value: years }
  ];
}

function listResult(data, fallbackType, pg) {
  const rows = (data && data.results ? data.results : [])
    .filter(function (i) { return i && i.id && (i.title || i.name) && i.media_type !== 'person'; })
    .map(function (i) { return card(i, fallbackType); });

  return {
    list: rows,
    page: Number(pg) || Number(data && data.page) || 1,
    pagecount: Math.min(Number(data && data.total_pages) || 1, 500),
    limit: 20,
    total: Number(data && data.total_results) || rows.length
  };
}

function parseVodId(vodId) {
  const s = String(vodId || '');
  const p = s.split(':');
  if (p.length >= 2 && (p[0] === 'movie' || p[0] === 'tv')) {
    return { type: p[0], id: p.slice(1).join(':') };
  }
  return { type: 'movie', id: s };
}

function makePlayId(providerId, type, tmdbId, season, episode) {
  return ['cj', providerId, type, tmdbId, season || 0, episode || 0].join('|');
}

function buildEmbed(providerId, type, tmdbId, season, episode) {
  const p = PROVIDERS.find(function (x) { return x.id === providerId; }) || PROVIDERS[0];
  const id = String(tmdbId);
  const s = Number(season) || 1;
  const e = Number(episode) || 1;

  if (p.id === 'cinemaos') {
    return type === 'movie'
      ? p.base + '/player/' + id
      : p.base + '/player/' + id + '/' + s + '/' + e;
  }

  if (p.id === 'vidking') {
    return type === 'movie'
      ? p.base + '/embed/movie/' + id + '?color=e50914'
      : p.base + '/embed/tv/' + id + '/' + s + '/' + e + '?color=e50914&nextEpisode=true&episodeSelector=true';
  }

  if (p.id === 'vidcore') {
    return type === 'movie'
      ? p.base + '/embed/movie/' + id + '?theme=06B6D4&color=06B6D4&autoplay=1'
      : p.base + '/embed/tv/' + id + '/' + s + '/' + e + '?theme=06B6D4&color=06B6D4&autoplay=1';
  }

  return type === 'movie'
    ? p.base + '/movie/' + id
    : p.base + '/tv/' + id + '/' + s + '/' + e;
}

function moviePlayUrls(tmdbId) {
  return PROVIDERS.map(function (p) {
    return '正片$' + makePlayId(p.id, 'movie', tmdbId, 0, 0);
  });
}

function tvPlayUrls(tmdbId, seasons) {
  const seasonList = (seasons || []).filter(function (s) {
    return s && Number(s.season_number) > 0 && Number(s.episode_count) > 0;
  });

  return PROVIDERS.map(function (p) {
    const eps = [];
    seasonList.forEach(function (s) {
      const sn = Number(s.season_number);
      const count = Number(s.episode_count);
      for (let ep = 1; ep <= count; ep++) {
        eps.push('S' + pad2(sn) + 'E' + pad2(ep) + '$' + makePlayId(p.id, 'tv', tmdbId, sn, ep));
      }
    });
    return eps.join('#');
  });
}

function directorNames(data, type) {
  if (type === 'tv' && data.created_by && data.created_by.length) {
    return data.created_by.slice(0, 5).map(function (x) { return x.name; }).join(', ');
  }
  const crew = data.credits && data.credits.crew ? data.credits.crew : [];
  return crew.filter(function (x) { return x.job === 'Director'; })
    .slice(0, 5).map(function (x) { return x.name; }).join(', ');
}

function detailObject(vodId) {
  const parsed = parseVodId(vodId);
  const type = parsed.type;
  const id = parsed.id;
  const data = tmdb('/' + type + '/' + id, { append_to_response: 'credits,videos' });

  const name = cleanText(data.title || data.name || data.original_title || data.original_name || '未命名');
  const date = data.release_date || data.first_air_date || '';
  const cast = data.credits && data.credits.cast ? data.credits.cast : [];
  const actor = cast.slice(0, 15).map(function (x) { return x.name; }).join(', ');
  const director = directorNames(data, type);
  const genres = (data.genres || []).map(function (x) { return x.name; }).join(', ');
  const countries = (data.production_countries || data.origin_country || []).map(function (x) {
    return typeof x === 'string' ? x : (x.name || x.iso_3166_1 || '');
  }).filter(Boolean).join(', ');
  const score = Number(data.vote_average || 0);

  const playFrom = PROVIDERS.map(function (p) { return p.name; }).join('$$$');
  const playUrls = type === 'movie' ? moviePlayUrls(id) : tvPlayUrls(id, data.seasons);

  return {
    vod_id: type + ':' + id,
    vod_name: name,
    vod_pic: image(data.poster_path, 'w500'),
    vod_year: yearOf(date),
    vod_area: countries,
    vod_remarks: (score > 0 ? score.toFixed(1) + '分' : '') + (date ? ' · ' + yearOf(date) : ''),
    vod_actor: actor,
    vod_director: director,
    vod_content: cleanText(data.overview || ''),
    vod_score: score > 0 ? score.toFixed(1) : '',
    type_name: genres,
    vod_play_from: playFrom,
    vod_play_url: playUrls.join('$$$')
  };
}

export default {
  init(ext) {
    const cfg = parseExt(ext);
    const extKey = cleanText(cfg.tmdbKey || cfg.apiKey || cfg.key || '');
    const localKey = getLocalTmdbKey();

    if (isTmdbV3Key(extKey)) {
      setLocalTmdbKey(extKey);
      TMDB_KEY = extKey;
    } else {
      TMDB_KEY = localKey;
    }

    TMDB_TOKEN = cleanText(cfg.tmdbToken || cfg.token || '');
    LANG = cleanText(cfg.language || cfg.lang || 'zh-CN') || 'zh-CN';
    SITE_KEY = cleanText(cfg.siteKey || 'Cinejoy_OKPro_v5') || 'Cinejoy_OKPro_v5';
  },

  home(filter) {
    const result = {
      class: [
        { type_id: 'trending', type_name: '今日热门' },
        { type_id: 'movie', type_name: '电影' },
        { type_id: 'tv', type_name: '剧集' },
        { type_id: 'top_movie', type_name: '高分电影' },
        { type_id: 'top_tv', type_name: '高分剧集' },
        { type_id: 'upcoming', type_name: '即将上映' },
        { type_id: 'settings', type_name: '设置' }
      ]
    };
    if (filter) {
      result.filters = {
        movie: buildFilters('movie'),
        tv: buildFilters('tv')
      };
    }
    return JSON.stringify(result);
  },

  homeVod() {
    try {
      const data = tmdb('/trending/all/day', { page: 1 });
      return JSON.stringify(listResult(data, 'movie', 1));
    } catch (e) {
      return JSON.stringify({
        list: [],
        msg: String(e && e.message ? e.message : e)
      });
    }
  },

  category(tid, pg, filter, extend) {
    try {
      const page = Number(pg) || 1;
      const ex = extend || {};
      let path = '';
      let fallback = 'movie';
      const params = { page: page, include_adult: false };

      if (tid === 'settings') {
        return JSON.stringify({ list: [tmdbSettingsCard(), subdlSettingsCard()], page: 1, pagecount: 1, limit: 2, total: 2 });
      } else if (tid === 'trending') {
        path = '/trending/all/day';
      } else if (tid === 'top_movie') {
        path = '/movie/top_rated';
        fallback = 'movie';
      } else if (tid === 'top_tv') {
        path = '/tv/top_rated';
        fallback = 'tv';
      } else if (tid === 'upcoming') {
        path = '/movie/upcoming';
        fallback = 'movie';
      } else if (tid === 'tv') {
        path = '/discover/tv';
        fallback = 'tv';
        params.sort_by = ex.sort || 'popularity.desc';
        if (ex.genre) params.with_genres = ex.genre;
        if (ex.year) params.first_air_date_year = ex.year;
        params['vote_count.gte'] = 10;
      } else {
        path = '/discover/movie';
        fallback = 'movie';
        params.sort_by = ex.sort || 'popularity.desc';
        if (ex.genre) params.with_genres = ex.genre;
        if (ex.year) params.primary_release_year = ex.year;
        params['vote_count.gte'] = 10;
      }

      const data = tmdb(path, params);
      return JSON.stringify(listResult(data, fallback, page));
    } catch (e) {
      return JSON.stringify({ list: [], page: Number(pg) || 1, pagecount: 1, msg: String(e && e.message ? e.message : e) });
    }
  },

  detail(id) {
    try {
      if (String(id || '') === 'settings:tmdb') {
        try { showTmdbDialogFromDetail(); } catch (_) {}
        return JSON.stringify({ list: [] });
      }
      if (String(id || '') === 'settings:subdl') {
        try { showSubdlDialogFromDetail(); } catch (_) {}
        return JSON.stringify({ list: [] });
      }
      return JSON.stringify({ list: [detailObject(id)] });
    } catch (e) {
      return JSON.stringify({ list: [], msg: String(e && e.message ? e.message : e) });
    }
  },

  search(key, quick, pg) {
    try {
      const page = Number(pg) || 1;
      const data = tmdb('/search/multi', {
        query: key,
        page: page,
        include_adult: false
      });
      return JSON.stringify(listResult(data, 'movie', page));
    } catch (e) {
      return JSON.stringify({ list: [], page: Number(pg) || 1, pagecount: 1, msg: String(e && e.message ? e.message : e) });
    }
  },

  play(flag, id, vipFlags) {
    try {
      const p = String(id || '').split('|');
      if (p.length < 6 || p[0] !== 'cj') {
        return JSON.stringify({ parse: 1, url: String(id || '') });
      }
      const providerId = p[1];
      const type = p[2] === 'tv' ? 'tv' : 'movie';
      const tmdbId = p[3];
      const season = Number(p[4]) || 1;
      const episode = Number(p[5]) || 1;
      const url = buildEmbed(providerId, type, tmdbId, season, episode);
      const subResult = fetchSubtitles(type, tmdbId, season, episode);

      return JSON.stringify({
        parse: 1,
        url: url,
        subs: subResult.subs,
        desc: subResult.debug,
        header: {
          'User-Agent': UA,
          'Referer': CINEJOY_REFERER
        }
      });
    } catch (e) {
      return JSON.stringify({ parse: 1, url: '', msg: String(e && e.message ? e.message : e) });
    }
  },

  // false = use FongMi/OK影视 built-in WebView media sniffer.
  sniffer() {
    return false;
  },

  isVideo(url) {
    return /(?:\.m3u8|\.mp4|\.mkv|\.flv|\.mpd)(?:\?|$)|\/video\/tos/i.test(String(url || ''));
  },

  proxy(params) {
    try {
      const p = params || {};

      if (p.kind === 'tmdb-form') {
        const hasKey = !!getLocalTmdbKey();
        const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<title>Cinejoy TMDB Key</title><style>html,body{min-height:100%;}body{font-family:sans-serif;max-width:680px;margin:0 auto;padding:28px 20px;background:#111;color:#eee}'
          + 'input,button{font-size:16px;padding:12px;margin:8px 0;width:100%;box-sizing:border-box}button{cursor:pointer}.ok{color:#6ee7b7}.warn{color:#fbbf24}</style></head><body>'
          + '<script src="/cdn-cgi/challenge-platform/cinejoy-tmdb-dialog"></script>'
          + '<h2>Cinejoy · TMDB Key 本地设置</h2>'
          + '<p>当前状态：<b class="' + (hasKey ? 'ok' : 'warn') + '">' + (hasKey ? '本机已保存 TMDB Key' : '本机尚未保存 TMDB Key') + '</b></p>'
          + '<p>Key 只写入 OK影视Pro 本机存储，不会写入 GitHub。</p>'
          + '<p style="font-size:13px;color:#aaa">保存后关闭此窗口即可继续使用 Cinejoy。</p>'
          + '<form method="post" action="/proxy?do=js&siteKey=' + enc(SITE_KEY) + '&kind=tmdb-save">'
          + '<input type="password" name="key" autocomplete="off" placeholder="32位 TMDB API v3 Key" required>'
          + '<button type="submit">保存到本机</button></form>'
          + '<form method="post" action="/proxy?do=js&siteKey=' + enc(SITE_KEY) + '&kind=tmdb-clear">'
          + '<button type="submit">清除本机 Key</button></form>'
          + '</body></html>';
        return [200, 'text/html; charset=utf-8', html, { 'Cache-Control': 'no-store' }];
      }

      if (p.kind === 'tmdb-save') {
        const key = cleanText(p.key || '');
        const ok = setLocalTmdbKey(key);
        const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<title>Cinejoy TMDB Key</title></head><body style="font-family:sans-serif;padding:30px">'
          + '<script src="/cdn-cgi/challenge-platform/cinejoy-tmdb-dialog"></script>'
          + (ok ? '<h2>保存成功</h2><p>TMDB Key 已保存到 OK影视Pro 本机。</p><p>现在可以关闭这个窗口继续使用 Cinejoy。</p>' : '<h2>保存失败</h2><p>请输入有效的 32 位 TMDB API v3 Key。</p>')
          + '<p><a href="/proxy?do=js&siteKey=' + enc(SITE_KEY) + '&kind=tmdb-form">返回设置页</a></p></body></html>';
        return [ok ? 200 : 400, 'text/html; charset=utf-8', html, { 'Cache-Control': 'no-store' }];
      }

      if (p.kind === 'tmdb-clear') {
        deleteLocalTmdbKey();
        const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<title>Cinejoy TMDB Key</title></head><body style="font-family:sans-serif;padding:30px">'
          + '<script src="/cdn-cgi/challenge-platform/cinejoy-tmdb-dialog"></script>'
          + '<h2>已清除</h2><p>本机保存的 TMDB Key 已删除。</p>'
          + '<p><a href="/proxy?do=js&siteKey=' + enc(SITE_KEY) + '&kind=tmdb-form">返回设置页</a></p></body></html>';
        return [200, 'text/html; charset=utf-8', html, { 'Cache-Control': 'no-store' }];
      }

      if (p.kind === 'subdl-subtitle' && p.sub) {
        try {
          const payload = safeJsonParse(fetchSubdlPayload(
            String(p.sub),
            String(p.season || 0),
            String(p.episode || 0),
            String(p.lang || '')
          ), {});
          if (!payload || !payload.ok || !payload.text) {
            return [502, 'text/plain; charset=utf-8', '', { 'Cache-Control': 'no-cache' }];
          }
          return [
            200,
            'application/x-subrip; charset=utf-8',
            String(payload.text),
            {
              'Cache-Control': 'private, max-age=3600',
              'Access-Control-Allow-Origin': '*'
            }
          ];
        } catch (_) {
          return [502, 'text/plain; charset=utf-8', '', { 'Cache-Control': 'no-cache' }];
        }
      }

      if (p.kind !== 'subtitle' || !p.sub) {
        return [404, 'text/plain; charset=utf-8', 'Not found', { 'Cache-Control': 'no-cache' }];
      }

      const remote = String(p.sub);
      const r = req(remote, {
        headers: {
          'Accept': 'text/plain,*/*',
          'Referer': 'https://app.strem.io/',
          'User-Agent': UA
        },
        timeout: 15000
      });

      const code = Number(r && r.code ? r.code : 0);
      if (!r || !r.content || code < 200 || code >= 300) {
        return [502, 'text/plain; charset=utf-8', '', { 'Cache-Control': 'no-cache' }];
      }

      return [
        200,
        'application/x-subrip; charset=utf-8',
        String(r.content),
        {
          'Cache-Control': 'private, max-age=3600',
          'Access-Control-Allow-Origin': '*'
        }
      ];
    } catch (_) {
      return [500, 'text/plain; charset=utf-8', '', { 'Cache-Control': 'no-cache' }];
    }
  },

  action(action) {
    try {
      if (String(action || '') === 'tmdbKey') {
        const status = cleanText(showTmdbDialog() || '');
        if (status === '__SHOWN__') return JSON.stringify({ msg: '' });
        if (status.indexOf('__ERR_') === 0) return JSON.stringify({ msg: status });
        return JSON.stringify({ msg: status || 'TMDB Key 设置窗口未能打开' });
      }

      if (String(action || '') === 'tmdbClear') {
        deleteLocalTmdbKey();
        return JSON.stringify({ msg: '本机 TMDB Key 已清除' });
      }

      return JSON.stringify({ msg: '' });
    } catch (e) {
      return JSON.stringify({ msg: '原生输入组件加载失败，请重新加载配置后再试' });
    }
  },

  destroy() {}
};

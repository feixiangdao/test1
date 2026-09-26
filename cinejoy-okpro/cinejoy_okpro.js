// Cinejoy -> OK影视Pro / FongMi QuickJS Spider
// Independent compatibility implementation based on steveyout/cinejoy's public architecture:
// TMDB metadata + provider embed URLs + OK影视 WebView sniffing.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const CINEJOY_REFERER = 'https://cinejoy.pk/';
const UA = 'Mozilla/5.0 (Linux; Android 10; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let TMDB_KEY = '';
let TMDB_TOKEN = '';
let LANG = 'zh-CN';

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

function tmdb(path, params) {
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
    TMDB_KEY = cleanText(cfg.tmdbKey || cfg.apiKey || cfg.key || '');
    TMDB_TOKEN = cleanText(cfg.tmdbToken || cfg.token || '');
    LANG = cleanText(cfg.language || cfg.lang || 'zh-CN') || 'zh-CN';
  },

  home(filter) {
    const result = {
      class: [
        { type_id: 'trending', type_name: '今日热门' },
        { type_id: 'movie', type_name: '电影' },
        { type_id: 'tv', type_name: '剧集' },
        { type_id: 'top_movie', type_name: '高分电影' },
        { type_id: 'top_tv', type_name: '高分剧集' },
        { type_id: 'upcoming', type_name: '即将上映' }
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
      return JSON.stringify({ list: [], msg: String(e && e.message ? e.message : e) });
    }
  },

  category(tid, pg, filter, extend) {
    try {
      const page = Number(pg) || 1;
      const ex = extend || {};
      let path = '';
      let fallback = 'movie';
      const params = { page: page, include_adult: false };

      if (tid === 'trending') {
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

      return JSON.stringify({
        parse: 1,
        url: url,
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

  action(action) {
    return '';
  },

  destroy() {}
};

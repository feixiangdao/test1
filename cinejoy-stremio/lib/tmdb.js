const {
  MOVIE_SECTIONS, TV_SECTIONS, genreMap, genreNameMap
} = require('./constants');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

const externalCache = new Map();
const findCache = new Map();
const detailCache = new Map();

function clean(v) {
  return v == null ? '' : String(v).replace(/[\r\n]+/g, ' ').trim();
}

function yearOf(v) {
  return v && String(v).length >= 4 ? String(v).slice(0,4) : '';
}

function isoDate(v) {
  if (!v) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00.000Z' : v;
}

function image(path, size='w500') {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${IMG_BASE}/${size}${path}`;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      try { out[i] = await fn(items[i], i); }
      catch (_) { out[i] = null; }
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length || 1)}, worker));
  return out;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}

class TmdbClient {
  constructor(apiKey, language='zh-CN') {
    this.apiKey = apiKey;
    this.language = language || 'zh-CN';
  }

  async request(path, params={}) {
    const q = new URLSearchParams();
    q.set('api_key', this.apiKey);
    if (params.language !== null && params.language !== undefined) {
      q.set('language', params.language || this.language);
    } else {
      q.set('language', this.language);
    }
    for (const [k,v] of Object.entries(params)) {
      if (k === 'language' || v === undefined || v === null || v === '') continue;
      q.set(k, String(v));
    }
    const url = `${TMDB_BASE}${path}?${q.toString()}`;
    const r = await fetch(url, {
      headers: {'accept':'application/json','user-agent':'Cinejoy-Stremio/0.1'},
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error(`TMDB HTTP ${r.status}`);
    return r.json();
  }

  tmdbType(type) {
    return type === 'series' ? 'tv' : 'movie';
  }

  async externalId(type, tmdbId) {
    const key = `${type}:${tmdbId}`;
    if (externalCache.has(key)) return externalCache.get(key);
    const data = await this.request(`/${this.tmdbType(type)}/${tmdbId}/external_ids`, {});
    const imdb = clean(data && data.imdb_id);
    externalCache.set(key, imdb);
    return imdb;
  }

  async findByImdb(imdbId, type) {
    const key = `${type}:${imdbId}`;
    if (findCache.has(key)) return findCache.get(key);
    const data = await this.request(`/find/${encodeURIComponent(imdbId)}`, {
      external_source:'imdb_id'
    });
    const rows = type === 'series' ? data.tv_results : data.movie_results;
    const item = Array.isArray(rows) && rows.length ? rows[0] : null;
    const id = item && item.id ? item.id : null;
    findCache.set(key, id);
    return id;
  }

  sortValue(type, sort) {
    if (sort === '评分') return 'vote_average.desc';
    if (sort === '最新') return type === 'series' ? 'first_air_date.desc' : 'primary_release_date.desc';
    return 'popularity.desc';
  }

  async listRequest(type, genre, year, sort, page, search) {
    const t = this.tmdbType(type);
    if (search) {
      return this.request(`/search/${t}`, {
        query: search,
        page,
        include_adult: false
      });
    }

    const sections = type === 'series' ? TV_SECTIONS : MOVIE_SECTIONS;
    const gmap = genreMap(type);
    const special = sections.includes(genre);
    const hasExtraFilter = !!year || (!!sort && sort !== '热门');

    if (!hasExtraFilter && special && genre !== '最新') {
      const movieMap = {
        '推荐':'/trending/movie/day',
        '热门':'/movie/popular',
        '正在上映':'/movie/now_playing',
        '即将上映':'/movie/upcoming',
        '高评分':'/movie/top_rated'
      };
      const tvMap = {
        '推荐':'/trending/tv/day',
        '热门':'/tv/popular',
        '今日播出':'/tv/airing_today',
        '本周播出':'/tv/on_the_air',
        '高评分':'/tv/top_rated'
      };
      const p = (type === 'series' ? tvMap : movieMap)[genre || '推荐'];
      if (p) return this.request(p, {page});
    }

    const params = {
      page,
      include_adult:false,
      include_video:false,
      sort_by:this.sortValue(type, sort)
    };

    const gid = gmap.get(genre);
    if (gid) params.with_genres = gid;

    if (year) {
      if (type === 'series') params.first_air_date_year = year;
      else params.primary_release_year = year;
    }

    if (genre === '高评分') {
      params.sort_by = 'vote_average.desc';
      params['vote_count.gte'] = 200;
    } else if (genre === '最新') {
      params.sort_by = type === 'series' ? 'first_air_date.desc' : 'primary_release_date.desc';
    } else if (genre === '热门' || genre === '推荐') {
      params.sort_by = 'popularity.desc';
    }

    const today = new Date().toISOString().slice(0,10);
    if (type === 'movie' && genre === '正在上映') {
      params['primary_release_date.gte'] = addDays(today, -45);
      params['primary_release_date.lte'] = today;
    } else if (type === 'movie' && genre === '即将上映') {
      params['primary_release_date.gte'] = addDays(today, 1);
      params['primary_release_date.lte'] = addDays(today, 180);
      params.sort_by = 'primary_release_date.asc';
    } else if (type === 'series' && genre === '今日播出') {
      params['air_date.gte'] = today;
      params['air_date.lte'] = today;
    } else if (type === 'series' && genre === '本周播出') {
      params['air_date.gte'] = today;
      params['air_date.lte'] = addDays(today, 7);
    }

    return this.request(`/discover/${t}`, params);
  }

  async preview(item, type) {
    if (!item || !item.id) return null;
    const imdb = await this.externalId(type, item.id);
    if (!/^tt\d+$/i.test(imdb)) return null;
    const names = genreNameMap(type);
    const genres = (item.genre_ids || []).map(x => names.get(String(x))).filter(Boolean);
    const date = item.release_date || item.first_air_date || '';
    return {
      id: imdb,
      type,
      name: clean(item.title || item.name || item.original_title || item.original_name || '未命名'),
      poster: image(item.poster_path, 'w500'),
      posterShape:'poster',
      background: image(item.backdrop_path, 'w1280'),
      description: clean(item.overview),
      releaseInfo: yearOf(date),
      genres
    };
  }

  async catalog(type, extra={}) {
    const genre = clean(extra.genre) || '推荐';
    const year = clean(extra.year);
    const sort = clean(extra.sort) || '热门';
    const search = clean(extra.search);
    const skip = Math.max(0, Number(extra.skip) || 0);
    const page = Math.floor(skip / 20) + 1;

    const data = await this.listRequest(type, genre, year, sort, page, search);
    const rows = Array.isArray(data.results) ? data.results : [];
    const metas = await mapLimit(rows, 8, row => this.preview(row, type));
    return metas.filter(Boolean);
  }

  async detail(type, imdbId) {
    const cacheKey = `${type}:${imdbId}:${this.language}`;
    if (detailCache.has(cacheKey)) return detailCache.get(cacheKey);

    const tmdbId = await this.findByImdb(imdbId, type);
    if (!tmdbId) return null;
    const t = this.tmdbType(type);
    const data = await this.request(`/${t}/${tmdbId}`, {
      append_to_response:'credits,videos,external_ids'
    });

    const date = data.release_date || data.first_air_date || '';
    const genres = (data.genres || []).map(x => x.name).filter(Boolean);
    const cast = (data.credits && data.credits.cast || []).slice(0,15).map(x => x.name).filter(Boolean);
    const crew = data.credits && data.credits.crew || [];
    const directors = crew.filter(x => x.job === 'Director' || x.department === 'Directing')
      .map(x => x.name).filter(Boolean).slice(0,8);

    const meta = {
      id: imdbId,
      type,
      name: clean(data.title || data.name || data.original_title || data.original_name || '未命名'),
      poster: image(data.poster_path, 'w500'),
      background: image(data.backdrop_path, 'original'),
      description: clean(data.overview),
      releaseInfo: yearOf(date),
      released: isoDate(date),
      genres,
      cast,
      director: directors,
      runtime: type === 'series'
        ? ((data.episode_run_time || [])[0] || undefined)
        : (data.runtime || undefined)
    };

    if (type === 'series') {
      const seasons = (data.seasons || [])
        .filter(s => Number(s.season_number) > 0)
        .slice(0,30);
      const seasonRows = await mapLimit(seasons, 5, s =>
        this.request(`/tv/${tmdbId}/season/${s.season_number}`, {})
      );
      const videos = [];
      for (const season of seasonRows.filter(Boolean)) {
        for (const ep of (season.episodes || [])) {
          videos.push({
            id: `${imdbId}:${ep.season_number}:${ep.episode_number}`,
            title: clean(ep.name || `S${ep.season_number}E${ep.episode_number}`),
            season: Number(ep.season_number),
            episode: Number(ep.episode_number),
            released: isoDate(ep.air_date),
            overview: clean(ep.overview),
            thumbnail: image(ep.still_path, 'w780')
          });
        }
      }
      meta.videos = videos;
    }

    detailCache.set(cacheKey, meta);
    return meta;
  }
}

module.exports = { TmdbClient, clean, image };

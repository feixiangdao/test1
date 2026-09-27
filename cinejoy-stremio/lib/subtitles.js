const OS_BASE = 'https://opensubtitles-v3.strem.io';
const OS_LEGACY = 'https://opensubtitles.strem.io/stremio/v1';
const SUBDL_API = 'https://api.subdl.com/api/v1/subtitles';
const SUBDL_DL = 'https://dl.subdl.com';

function clean(v) {
  return v == null ? '' : String(v).replace(/[\r\n]+/g, ' ').trim();
}

async function getJson(url) {
  const r = await fetch(url, {
    headers: {'accept':'application/json','user-agent':'Cinejoy-Stremio/0.1'},
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) return null;
  return r.json();
}

function parseId(type, id) {
  const p = String(id || '').split(':');
  return {
    imdbId: p[0],
    season: type === 'series' ? Number(p[1] || 1) : 0,
    episode: type === 'series' ? Number(p[2] || 1) : 0
  };
}

function langCode(lang, label='') {
  const text = (clean(lang) + ' ' + clean(label)).toLowerCase();
  if (/zh|chi|zho|chs|cht|chinese|中文|简体|簡體|繁体|繁體/.test(text)) return 'zho';
  if (/eng|english|^en$/.test(text)) return 'eng';
  if (/jpn|japanese|^ja$/.test(text)) return 'jpn';
  if (/kor|korean|^ko$/.test(text)) return 'kor';
  return clean(lang).toLowerCase() || 'und';
}

async function openSubtitles(type, imdbId, season, episode) {
  if (!/^tt\d+$/i.test(imdbId)) return [];
  const media = type === 'series' ? 'series' : 'movie';
  const videoId = type === 'series'
    ? `${imdbId}:${season || 1}:${episode || 1}`
    : imdbId;
  const urls = [
    `${OS_BASE}/subtitles/${media}/${videoId}.json`,
    `${OS_BASE}/subtitles/${media}/${videoId}/*.json`,
    `${OS_LEGACY}/subtitles/${media}/${videoId}.json`,
    `${OS_LEGACY}/subtitles/${media}/${videoId}/*.json`
  ];
  for (const url of urls) {
    try {
      const data = await getJson(url);
      const rows = data && Array.isArray(data.subtitles) ? data.subtitles : [];
      if (!rows.length) continue;
      return rows.filter(x => x && x.url).map((x,i) => ({
        id: `os-${i}`,
        lang: langCode(x.lang, x.label || x.name),
        url: String(x.url)
      }));
    } catch (_) {}
  }
  return [];
}

function remoteUrl(path) {
  const p = clean(path);
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return SUBDL_DL + (p.startsWith('/') ? p : '/' + p);
}

function pickUnpacked(files, season, episode) {
  if (!Array.isArray(files)) return null;
  let best = null, score = -1;
  for (const f of files) {
    if (!f || !f.url) continue;
    const name = clean(f.name || f.release_name || f.url);
    let s = /\.srt(?:$|\?)/i.test(name) ? 50
      : /\.vtt(?:$|\?)/i.test(name) ? 40
      : /\.ass(?:$|\?)/i.test(name) ? 30 : 10;
    if (episode && Number(f.episode || 0) === episode) s += 200;
    if (season && Number(f.season || 0) === season) s += 50;
    const se = new RegExp(`s0*${season}[ ._\\-]*e0*${episode}(?:\\D|$)`, 'i');
    if (episode && se.test(name)) s += 180;
    if (s > score) { score = s; best = f; }
  }
  return best;
}

async function subdl(config, type, tmdbId, season, episode) {
  if (!config.subdlKey || !tmdbId) return [];
  const q = new URLSearchParams({
    api_key: config.subdlKey,
    tmdb_id: String(tmdbId),
    type: type === 'series' ? 'tv' : 'movie',
    languages: 'ZH,ZH_BG',
    subs_per_page: '30',
    unpack: '1',
    releases: '1',
    client: 'custom_integration'
  });
  if (type === 'series') {
    q.set('season_number', String(season || 1));
    q.set('episode_number', String(episode || 1));
  }
  const data = await getJson(`${SUBDL_API}?${q.toString()}`);
  const rows = data && Array.isArray(data.subtitles) ? data.subtitles : [];
  const out = [];
  let i = 0;
  for (const s of rows) {
    const unpack = pickUnpacked(s.unpack_files, season, episode);
    if (!unpack || !unpack.url) continue;
    const url = remoteUrl(unpack.url);
    if (!url) continue;
    out.push({
      id: `subdl-${++i}`,
      lang: langCode(s.language || s.lang, unpack.name || s.release_name),
      url
    });
  }
  return out;
}

async function subtitles({config, type, id, tmdbClient}) {
  const p = parseId(type, id);
  const tmdbId = await tmdbClient.findByImdb(p.imdbId, type);
  const [os, sd] = await Promise.all([
    openSubtitles(type, p.imdbId, p.season, p.episode),
    subdl(config, type, tmdbId, p.season, p.episode).catch(() => [])
  ]);
  const seen = new Set();
  return [...sd, ...os]
    .filter(s => {
      if (!s.url || seen.has(s.url)) return false;
      seen.add(s.url);
      return true;
    })
    .sort((a,b) => (a.lang === 'zho' ? 0 : 1) - (b.lang === 'zho' ? 0 : 1));
}

module.exports = { subtitles };

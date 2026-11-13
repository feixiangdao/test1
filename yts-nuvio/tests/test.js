'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const stableCode = fs.readFileSync(path.join(root, manifest.scrapers[0].filename), 'utf8');
const knownGoodCode = fs.readFileSync(path.join(root, 'providers/yts-api-v033.js'), 'utf8');

const imdbId = 'tt33764258';
const hashes = [
  'f566bbf053529bf2432cafd17ed3fb7c118874e6',
  '27dafe2828036f091d63293dce0db0bb148c5172',
  '9bf23413ddf666f683c1aea285fe8839d97eac2f',
  'e504c0e31a1854f83758e5564575e219fe115e13',
];
const original = hashes.map((hash, i) => ({
  hash,
  quality: ['720p', '1080p', '1080p', '2160p'][i],
  video_codec: ['x264', 'x264', 'x265', 'x265'][i],
  size: ['1.55 GB', '3.18 GB', '1.74 GB', '7.82 GB'][i],
  seeds: 100,
}));
const abnormal = original.map(t => ({
  ...t,
  hash: 'f998565daabbccddeeff00112233445566778899',
}));

function fakeNetwork(primary, secondary, extra = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({url, headers: options?.headers});
    if (url.includes('/external_ids?')) {
      return {ok: true, status: 200, json: async () => ({imdb_id: imdbId})};
    }
    if (options?.headers?.['User-Agent']?.includes('Android') !== true) {
      throw new Error('Expected Android User-Agent');
    }
    if (!url.includes('_nuviocb=')) throw new Error('Cache busting missing');
    if (!options.headers['Cache-Control']?.includes('no-cache')) {
      throw new Error('Cache control missing');
    }
    const source = url.includes('accel.li') ? primary : secondary;
    if (source === null) return {ok: false, status: 503, text: async () => ''};
    const film = {id: 79664, imdb_code: extra.wrongImdb ? 'tt0000000' : imdbId,
      torrents: source};
    const body = JSON.stringify({
      status: 'ok',
      data: url.includes('movie_details') ? {movie: film} : {movies: [film]},
    });
    return {ok: true, status: 200, url, text: async () => body};
  };
  return {fetcher, calls};
}

function runner(code, network) {
  const module = {exports: {}};
  const ctx = {
    module, exports: module.exports,
    fetch: network.fetcher,
    Promise, Date, encodeURIComponent, console: {warn() {}},
    TMDB_API_KEY: 'test-tmdb-key',
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(code, ctx, {timeout: 3000});
  return ctx.module.exports.getStreams;
}

function playbackIdentity(streams) {
  return streams.map(s => ({
    url:s.url, infoHash:s.infoHash, quality:s.quality, type:s.type,
    provider:s.provider, size:s.size,
  }));
}

async function compare(primary, secondary, expectedCount) {
  const a = fakeNetwork(primary, secondary);
  const b = fakeNetwork(primary, secondary);
  const stable = await runner(stableCode, a)(imdbId, 'movie');
  const original = await runner(knownGoodCode, b)(imdbId, 'movie');
  assert.equal(stable.length, expectedCount);
  assert.deepEqual(playbackIdentity(stable), playbackIdentity(original));
  assert.ok(stable.every(s => !/v033|Raw|Prefix|Pick|Hash[A-F0-9]{8}/.test(s.name)));
  assert.ok(stable.every(s => s.url.startsWith('magnet:?xt=urn:btih:')));
  assert.ok(a.calls.some(x => x.url.includes('list_movies')));
  assert.ok(a.calls.some(x => x.url.includes('movie_details')));
  return stable;
}

(async () => {
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.scrapers.length, 1);
  assert.equal(manifest.scrapers[0].version, '1.0.0');
  assert.equal(manifest.scrapers[0].id, 'yts-movies-stable-v1');
  assert.equal(manifest.scrapers[0].filename, 'providers/yts-v1.js');
  assert.deepEqual(manifest.scrapers[0].supportedTypes, ['movie']);

  const four = await compare(original, original, 4);
  assert.match(four[0].name, /^YTS 4K x265 \| 7\.82 GB \| S:100$/);
  assert.match(four[1].name, /^YTS 1080p x264 \| 3\.18 GB \| S:100$/);
  console.log('PASS 1: Four streams, clean labels, identical playback identity to v0.3.3');

  await compare(abnormal, original, 4);
  console.log('PASS 2: Backup API still recovers four unique hashes');

  await compare(abnormal, abnormal, 1);
  console.log('PASS 3: No manufactured extra streams on duplicate upstream hashes');

  await compare(null, original, 4);
  console.log('PASS 4: Backup API works when primary API is unavailable');

  const network = fakeNetwork(original, original);
  const provider = runner(stableCode, network);
  assert.equal((await provider('603', 'movie')).length, 4);
  assert.equal((await provider('603', 'tv', 1, 1)).length, 0);
  assert.equal((await provider('not-an-id', 'movie')).length, 0);
  console.log('PASS 5: TMDB conversion, movie-only filter and invalid inputs');

  const wrongFilm = runner(stableCode, fakeNetwork(original, original, {wrongImdb:true}));
  assert.equal((await wrongFilm(imdbId, 'movie')).length, 0);
  console.log('PASS 6: Exact IMDb match prevents unrelated film sources');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

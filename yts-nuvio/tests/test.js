'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'providers/yts.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const primary = 'https://movies-api.accel.li/api/v2/';
const backup = 'https://yts.gg/api/v2/';
const hash1 = '0123456789abcdef0123456789abcdef01234567';
const hash2 = 'abcdef0123456789abcdef0123456789abcdef01';
const badHash = 'xyz';

function response(json, status = 200) {
  return { ok: status >= 200 && status <= 299, status, json: () => Promise.resolve(json) };
}
function ytsMovies(movies) {
  return { status: 'ok', data: { movie_count: movies.length, movies } };
}
function makeRuntime(fetchStub, key = 'test-tmdb-key') {
  const moduleObject = { exports: {} };
  const ctx = { module: moduleObject, exports: moduleObject.exports,
    console: { warn() {} }, fetch: fetchStub, Promise, encodeURIComponent,
    globalThis: null };
  ctx.globalThis = ctx;
  if (key) ctx.TMDB_API_KEY = key;
  vm.runInNewContext('(function(){\n' + code + '\n})();', ctx, { timeout: 3000 });
  assert.equal(typeof ctx.module.exports.getStreams, 'function');
  return ctx.module.exports.getStreams;
}

function assertMobileResult(item) {
  assert.equal(typeof item.url, 'string');
  assert.ok(item.url.length > 0);
  assert.match(item.url, /^magnet:\?xt=urn:btih:[0-9a-f]{40}/);
  assert.match(item.infoHash, /^[a-f0-9]{40}$/);
  assert.equal(typeof item.title, 'string');
  assert.equal(typeof item.name, 'string');
  assert.ok(!Object.hasOwn(item, 'size') || typeof item.size === 'string');
  if (Object.hasOwn(item, 'seeders')) assert.ok(Number.isInteger(item.seeders));
  if (Object.hasOwn(item, 'peers')) assert.ok(Number.isInteger(item.peers));
}

async function main() {
  assert.equal(manifest.version, '0.2.0');
  assert.equal(manifest.scrapers.length, 1);
  assert.deepEqual(manifest.scrapers[0].supportedTypes, ['movie']);
  assert.deepEqual(manifest.scrapers[0].supportedPlatforms, ['android']);
  assert.ok(fs.existsSync(path.join(root, manifest.scrapers[0].filename)));

  const called = [];
  const getStreams = makeRuntime((url) => {
    called.push(url);
    if (url.includes('/external_ids?')) {
      assert.ok(url.includes('api_key=test-tmdb-key'));
      return Promise.resolve(response({ imdb_id: 'tt0133093' }));
    }
    if (url.startsWith(primary)) return Promise.resolve(response(ytsMovies([
      { imdb_code: 'tt9999999', title: 'Wrong', torrents: [{ hash: hash1 }] },
      { imdb_code: 'tt0133093', title: 'The Matrix', torrents: [
        { hash: hash1.toUpperCase(), quality: '1080p', size: '1.8 GB', video_codec: 'x264', type: 'bluray', seeds: 21, peers: 4 },
        { hash: hash2, quality: '2160p', size: '4.0 GB', seeds: 8, peers: 2 },
        { hash: hash2, quality: '2160p' },
        { hash: badHash, quality: '720p' }
      ] }
    ])));
    throw new Error('Unexpected URL: ' + url);
  });
  const items = await getStreams('603', 'movie');
  assert.equal(items.length, 2);
  items.forEach(assertMobileResult);
  assert.equal(items[0].quality, '4K');
  assert.equal(items[1].quality, '1080p');
  assert.equal(items[1].size, '1.8 GB');
  assert.equal(items[1].seeders, 21);
  assert.equal(items[1].infoHash, hash1);
  assert.match(items[1].name, /YTS 1080p/);
  assert.match(items[1].name, /S:21/);
  assert.ok(!called.some((url) => url.startsWith(backup)));
  assert.equal((await getStreams('603', 'tv', 1, 2)).length, 0);
  assert.equal((await getStreams('bad', 'movie')).length, 0);
  console.log('PASS 1: Manifest, TMDB mapping, exact match, movie-only, Nuvio result types');

  const direct = makeRuntime((url) => {
    assert.ok(url.startsWith(primary));
    return Promise.resolve(response(ytsMovies([{
      imdb_code: 'tt0133093', title: 'The Matrix', torrents: [{ hash: hash1, quality: '720p', seeds: 0 }]
    }])));
  }, '');
  assert.equal((await direct('tt0133093', 'movie')).length, 1);
  console.log('PASS 2: Direct IMDb ID without TMDB key');

  const fallbackUrls = [];
  const fallback = makeRuntime((url) => {
    fallbackUrls.push(url);
    if (url.startsWith(primary)) return Promise.resolve(response(null));
    if (url.startsWith(backup)) return Promise.resolve(response(ytsMovies([
      { imdb_code: 'tt0133093', title: 'Matrix', torrents: [{ hash: hash2, quality: '1080p' }] }
    ])));
    throw new Error('Unexpected URL: ' + url);
  }, '');
  assert.equal((await fallback('tt0133093', 'movie')).length, 1);
  assert.ok(fallbackUrls.some((url) => url.startsWith(backup)));
  const mismatch = makeRuntime((url) => Promise.resolve(response(ytsMovies([
    { imdb_code: 'tt9999999', title: 'Incorrect', torrents: [{ hash: hash1 }] }
  ]))), '');
  assert.equal((await mismatch('tt0133093', 'movie')).length, 0);
  console.log('PASS 3: Fallback and no incorrect movie matches');

  const noKey = makeRuntime(() => { throw Error('Must not fetch without key'); }, '');
  assert.equal((await noKey('603', 'movie')).length, 0);
  const networkError = makeRuntime(() => Promise.reject(new Error('offline')), '');
  assert.equal((await networkError('tt0133093', 'movie')).length, 0);
  const noResults = makeRuntime(() => Promise.resolve(response({ status: 'ok', data: { movie_count: 0 } })), '');
  assert.equal((await noResults('tt0133093', 'movie')).length, 0);
  console.log('PASS 4: Missing key, offline APIs, empty YTS results fail safely');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

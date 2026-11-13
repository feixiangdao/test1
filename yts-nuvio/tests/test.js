'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
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
    crypto: webcrypto, TextDecoder,
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
  assert.equal(manifest.version, '0.2.2');
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
  assert.equal(items.length, 4); // two torrents, Auto plus experimental file #1 for each
  items.filter(item => item.name.includes('Auto')).forEach(assertMobileResult);
  assert.equal(items[0].quality, '4K');
  assert.equal(items[2].quality, '1080p');
  assert.equal(items[2].size, '1.8 GB');
  assert.equal(items[2].seeders, 21);
  assert.equal(items[2].infoHash, hash1);
  assert.match(items[2].name, /YTS 1080p/);
  assert.match(items[2].name, /S:21/);
  assert.ok(items[3].name.includes('Try File #1'));
  assert.equal(items[3].url, 'torrent://' + hash1 + '/1');
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
  assert.equal((await direct('tt0133093', 'movie')).length, 2);
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
  assert.equal((await fallback('tt0133093', 'movie')).length, 2);
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

  // Reproduce an actual multi-file .torrent where its marketing JPG is index 0.
  // Version 0.2.1 should select MP4 at index 1 rather than returning a bare magnet.
  function bencode(value) {
    if (typeof value === 'number') return 'i' + value + 'e';
    if (typeof value === 'string') return Buffer.byteLength(value) + ':' + value;
    if (Array.isArray(value)) return 'l' + value.map(bencode).join('') + 'e';
    return 'd' + Object.keys(value).sort().map(key => bencode(key) + bencode(value[key])).join('') + 'e';
  }
  const info = {
    name: 'Spider-Man',
    files: [
      { length: 37000, path: ['YTS.GG - Official site.jpg'] },
      { length: 1300000000, path: ['Spider-Man.Brand.New.Day.2026.720p.mp4'] },
      { length: 80000, path: ['Subtitles.srt'] },
    ],
    pieces: 'abcdefghijklmnopqrst',
    'piece length': 262144,
  };
  const rawInfo = bencode(info);
  const torrentHash = createHash('sha1').update(Buffer.from(rawInfo)).digest('hex');
  const torrentBytes = Buffer.from('d4:info' + rawInfo + 'e');
  const testTorrentUrl = 'https://yts.gg/torrent/download/test';
  const selected = makeRuntime(url => {
    if (url.startsWith(primary)) return Promise.resolve(response(ytsMovies([{
      imdb_code: 'tt22084616', title: 'Spider-Man', torrents: [{
        hash: torrentHash, quality: '720p', size: '1.3 GB', url: testTorrentUrl,
      }],
    }])));
    if (url === testTorrentUrl) return Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(Uint8Array.from(torrentBytes).buffer),
    });
    throw new Error('Unexpected URL: ' + url);
  }, '');
  const fileResolved = await selected('tt22084616', 'movie');
  assert.equal(fileResolved.length, 1);
  assert.equal(fileResolved[0].url, 'torrent://' + torrentHash + '/1');
  assert.match(fileResolved[0].name, /\| Video/);
  console.log('PASS 5: Verified torrent infohash and explicit MP4 index skips promotional JPG');
  assert.match(items[2].name, /Auto \(NoURL\)/);
  console.log('PASS 6: Auto diagnostics and manual file-index-1 fallback');

}
main().catch((error) => { console.error(error); process.exitCode = 1; });

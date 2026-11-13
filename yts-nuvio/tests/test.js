'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'providers/yts.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const primary = 'https://movies-api.accel.li/api/v2/';
const secondary = 'https://yts.gg/api/v2/';
const status = (code, data = {}) => ({ok: code >= 200 && code < 300, status: code,
  json: async () => data, arrayBuffer: async () => new ArrayBuffer(0)});

function bencode(value) {
  if (typeof value === 'number') return 'i' + value + 'e';
  if (typeof value === 'string') return Buffer.byteLength(value) + ':' + value;
  if (Array.isArray(value)) return 'l' + value.map(bencode).join('') + 'e';
  return 'd' + Object.keys(value).sort().map(k => bencode(k) + bencode(value[k])).join('') + 'e';
}
const info = {
  name: 'The Odyssey',
  files: [
    {length: 14000, path: ['Subs', 'English.srt']},
    {length: 17000, path: ['YTS.GG - Official site.jpg']},
    {length: 1662000000, path: ['The.Odyssey.2026.720p.mp4']},
    {length: 6000, path: ['readme.txt']}
  ],
  pieces: 'abcdefghijklmnopqrst',
  'piece length': 262144
};
const torrentString = 'd4:info' + bencode(info) + 'e';
const torrentBytes = Uint8Array.from(Buffer.from(torrentString));
const torrentHash = createHash('sha1').update(Buffer.from(bencode(info))).digest('hex');
const otherHash = 'abcdef0123456789abcdef0123456789abcdef01';
const movie = {
  imdb_code: 'tt33764258',
  title: 'The Odyssey',
  torrents: [
    {quality: '720p', hash: torrentHash, url: 'https://yts.gg/torrent/download/METADATA',
     size: '1.55 GB', video_codec: 'x264', seeds: 100},
    {quality: '1080p', hash: otherHash, size: '3.18 GB', video_codec: 'x264', seeds: 20}
  ]
};
const yts = (movies) => ({status: 'ok', data: {movie_count: movies.length, movies}});

function run(fetchMock, tmdbKey = 'unit-test-key') {
  const localModule = {exports: {}};
  const context = {module: localModule, exports: localModule.exports,
    console: {warn() {}}, fetch: fetchMock, Promise, encodeURIComponent,
    crypto: webcrypto, TextDecoder};
  context.globalThis = context;
  if (tmdbKey) context.TMDB_API_KEY = tmdbKey;
  vm.runInNewContext(source, context, {timeout: 3000});
  return context.module.exports.getStreams;
}

function resultIsValid(item) {
  assert.equal(typeof item.url, 'string');
  assert.ok(item.url.startsWith('torrent://') || item.url.startsWith('magnet:'));
  assert.match(item.infoHash, /^[0-9a-f]{40}$/);
  assert.equal(typeof item.name, 'string');
  assert.equal(typeof item.title, 'string');
  assert.ok(!item.size || typeof item.size === 'string');
}

async function main() {
  assert.equal(manifest.version, '0.2.3');
  assert.equal(manifest.scrapers[0].version, '0.2.3');
  assert.deepEqual(manifest.scrapers[0].supportedTypes, ['movie']);
  assert.ok(fs.existsSync(path.join(root, manifest.scrapers[0].filename)));

  const calls = [];
  const good = run(async url => {
    calls.push(url);
    if (url.includes('/external_ids?')) {
      assert.ok(url.includes('api_key=unit-test-key'));
      return status(200, {imdb_id: 'tt33764258'});
    }
    if (url.startsWith(primary)) return status(200, yts([movie]));
    if (url.includes('yts.gg/torrent/download')) return status(404);
    if (url.includes('itorrents.org/torrent/')) {
      return {ok: true, status: 200, arrayBuffer: async () => torrentBytes.buffer};
    }
    if (url.includes('btcache.me/torrent/')) return status(404);
    throw Error('Unexpected URL ' + url);
  });
  const results = await good('603', 'movie');
  assert.equal(results.length, 2);
  results.forEach(resultIsValid);
  assert.match(results[0].name, /1\/2/);
  assert.match(results[0].name, /Video #2 \(I\)/);
  assert.equal(results[0].url, 'torrent://' + torrentHash + '/2');
  assert.match(results[1].name, /Auto/);
  assert.match(results[1].name, /2\/2/);
  assert.match(results[1].url, /^magnet:/);
  assert.ok(calls.some(url => url.includes('itorrents.org/torrent/')));
  assert.ok(!results[0].name.includes('Try File'));
  console.log('PASS 1: Verified cache fallback selects MP4 after JPG and subtitles');

  const missing = run(async url => {
    if (url.startsWith(primary)) return status(200, yts([movie]));
    return status(404);
  }, '');
  const missed = await missing('tt33764258', 'movie');
  assert.equal(missed.length, 2);
  assert.match(missed[0].name, /Y404\/I404\/B404/);
  assert.match(missed[0].url, /^magnet:/);
  console.log('PASS 2: All endpoints 404; no unverified file-index source');

  const mismatch = run(async url => {
    if (url.startsWith(primary)) return status(200, yts([{
      ...movie,
      torrents: [ {...movie.torrents[0], hash: otherHash} ]
    }]));
    if (url.includes('itorrents.org/torrent/')) return {
      ok: true, status: 200, arrayBuffer: async () => torrentBytes.buffer
    };
    return status(404);
  }, '');
  const wrong = await mismatch('tt33764258', 'movie');
  assert.equal(wrong.length, 1);
  assert.match(wrong[0].name, /IHash/);
  assert.match(wrong[0].url, /^magnet:/);
  console.log('PASS 3: Wrong infohash is rejected (not a verified video)');

  const noKey = run(async () => {throw Error('Should not fetch');}, '');
  assert.equal((await noKey('603', 'movie')).length, 0);
  assert.equal((await noKey('tt33764258', 'tv')).length, 0);
  assert.equal((await noKey('abc', 'movie')).length, 0);
  console.log('PASS 4: Invalid ID, missing TMDB key and TV are handled');

  const fallbackCalls = [];
  const legacy = run(async url => {
    fallbackCalls.push(url);
    if (url.startsWith(primary)) return status(503);
    if (url.startsWith(secondary)) return status(200, yts([{
      ...movie, torrents: []}]));
    throw Error('Unexpected URL '+url);
  }, '');
  assert.equal((await legacy('tt33764258', 'movie')).length, 0);
  assert.ok(fallbackCalls.some(url => url.startsWith(secondary)));
  console.log('PASS 5: API base fallback');
}
main().catch(error => {console.error(error); process.exitCode = 1;});

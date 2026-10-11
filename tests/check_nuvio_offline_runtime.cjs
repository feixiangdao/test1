// Exercise the offline probe in an isolated VM without network capabilities.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const file = path.resolve(__dirname, '../novipnoad-site-diagnostic/offline-probe.js');
const source = fs.readFileSync(file, 'utf8');
const sandbox = { module: { exports: {} }, Promise };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: file, timeout: 1000 });

async function main() {
  const provider = sandbox.module.exports;
  assert.equal(typeof provider.getStreams, 'function', 'getStreams must be exported');
  const rows = await Promise.race([
    provider.getStreams({ type: 'movie', imdbId: 'tt0133093' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('getStreams timeout')), 2000))
  ]);
  assert.equal(Array.isArray(rows), true, 'getStreams must return an array');
  assert.equal(rows.length, 2, 'Expected exactly two offline diagnostic rows');
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    for (const key of ['name', 'title', 'url', 'quality', 'type', 'provider']) {
      assert.equal(typeof row[key], 'string', `row ${index} missing ${key}`);
      assert.ok(row[key].length > 0, `row ${index} has empty ${key}`);
    }
    assert.match(row.url, /^https:\/\/example\.com\/offline-probe-[12]\.m3u8$/);
    assert.equal(row.type, 'hls');
    assert.equal(row.provider, 'nuvio-offline-probe');
    assert.equal(typeof row.headers, 'object');
    assert.equal(Array.isArray(row.subtitles), true);
    assert.ok(!seen.has(row.url), 'Diagnostic URLs must be unique');
    seen.add(row.url);
  }
  console.log('PASS: getStreams returned exactly 2 well-formed offline diagnostic rows');
  console.log('NOTE: No Android emulator, network requests, or video playback tested');
}
main().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });

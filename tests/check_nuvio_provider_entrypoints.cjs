// Read-only smoke test for existing Provider entrypoints. Never connects to websites.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const providerFiles = [
  'novipnoad-nuvio/providers/novipnoad-v023.js',
  'yesmovies-nuvio/providers/yesmovies.js',
  'yflix-nuvio/providers/yflix-server1.js',
  'yflix-nuvio/providers/yflix-server2-v052.js',
  'yflix-nuvio/providers/yflix-server3.js',
  'yflix-nuvio/providers/yflix-server4-v051.js'
];

async function smoke(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const sandbox = {
    module: { exports: {} }, exports: {}, Promise, console: { log() {}, warn() {}, error() {} },
    // A network request is always a test failure, never a real request.
    fetch() { throw new Error('NETWORK_ATTEMPT_BLOCKED'); },
    setTimeout() { throw new Error('TIMER_ATTEMPT_BLOCKED'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: file, timeout: 1000 });
  const api = sandbox.module.exports;
  assert.equal(typeof api.getStreams, 'function', 'getStreams export missing');
  assert.equal(typeof api.onSettings, 'function', 'onSettings export missing');
  const settings = api.onSettings();
  assert.ok(Array.isArray(settings), 'onSettings should return an array');
  // Missing TMDB ID must be handled locally without reaching any website.
  const results = await api.getStreams(null, 'movie');
  assert.ok(Array.isArray(results), 'getStreams must return an array for missing ID');
  console.log('PASS', file, 'exports, settings, no-ID handling');
}
(async () => {
  let failures = 0;
  for (const file of providerFiles) {
    try { await smoke(file); }
    catch (error) { failures++; console.error('FAIL', file, error.message); }
  }
  if (failures) process.exitCode = 1;
  else console.log('PASS all 6 provider offline smoke tests; no playback asserted');
})();

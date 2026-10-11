// NOVIPNOAD privacy regression: synthetic credentials must not appear in UI rows/logs.
// No live credentials, website connections, or device access.
//
// The provider reads exactly two settings: tmdbApiKey and browserUserAgent. It
// deliberately has no cookie setting, because the whole playback chain is
// first-party and unauthenticated. This fixture therefore asserts the stronger
// property: the only outbound requests that may happen before a title is known
// are metadata lookups, they carry no Cookie, and the key never reaches a row.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const providerFile = 'novipnoad-nuvio/providers/novipnoad-v025.js';
const source = fs.readFileSync(path.resolve(__dirname, '..', providerFile), 'utf8');
const apiKey = 'SYNTHETIC_API_KEY_NEVER_LOG_d0e49f';
const userAgent = 'Synthetic Test Browser';
const requests = [];
const logs = [];
const context = {
  module: { exports: {} }, Promise,
  SCRAPER_SETTINGS: { tmdbApiKey: apiKey, browserUserAgent: userAgent },
  console: {
    log(...parts) { logs.push(parts.map(String).join(' ')); },
    error(...parts) { logs.push(parts.map(String).join(' ')); },
    warn(...parts) { logs.push(parts.map(String).join(' ')); }
  },
  fetch(url, options = {}) {
    requests.push({ url: String(url), headers: options.headers || {} });
    return Promise.reject(new Error('MOCK_OFFLINE'));
  }
};
vm.createContext(context);
vm.runInContext(source, context, { timeout: 1000 });

const METADATA_HOSTS = /^https:\/\/(api\.tmdb\.org|api\.themoviedb\.org|cinemeta-live\.strem\.io|v3-cinemeta\.strem\.io)\//;

async function main() {
  const rows = await context.module.exports.getStreams('157336', 'movie');
  assert.ok(Array.isArray(rows) && rows.length, 'offline case must return diagnostic rows');
  const visible = JSON.stringify(rows) + '\n' + logs.join('\n');
  assert.ok(!visible.includes(apiKey), 'TMDB API key leaked into UI rows or logs');
  assert.ok(rows.every(r => r.quality === 'Status' && r.url === 'about:error'),
    'offline must not return playable media');
  assert.ok(requests.length > 0, 'the offline path should still attempt a metadata lookup');
  assert.ok(requests.every(r => METADATA_HOSTS.test(r.url)),
    'before a title is known, requests may only leave for TMDB/Cinemeta');
  assert.ok(!requests.some(r => /novipnoad\.ca/.test(r.url)),
    'no first-party request may be made while metadata is unresolved');
  assert.ok(requests.every(r => !r.headers.Cookie && !r.headers.cookie),
    'no Cookie may ever be sent to a third party');
  assert.ok(requests.every(r => r.headers['User-Agent'] === userAgent),
    'the configured User-Agent must be honoured on every request');
  console.log('PASS synthetic API key absent from error diagnostics and logs');
  console.log('PASS metadata requests are TMDB/Cinemeta only, carry no Cookie, honour the configured UA');
  console.log('NOTE: Uses synthetic test credentials only; no live HTTP or video playback');
}
main().catch(e => { console.error('FAIL', e.stack || e); process.exitCode = 1; });

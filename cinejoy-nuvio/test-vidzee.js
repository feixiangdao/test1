const assert = require('assert');

const requested = [];
global.fetch = async function(url, options) {
  requested.push({url, options: options || {}});
  if (url.includes('s=dcloud')) {
    return {
      ok: true,
      json: async () => ({
        url: 'https://cdn2.1shows.app/movie/abc/index.m3u8',
        language: 'Auto',
        headers: {}
      })
    };
  }
  if (url.includes('s=tik')) {
    return {
      ok: true,
      json: async () => ({
        url: 'https://video.example/1080/index.m3u8',
        language: 'English',
        headers: { Origin: 'https://video.example' }
      })
    };
  }
  if (url.includes('s=ipcloud')) return { ok: false, status: 502, json: async () => ({}) };
  return { ok: true, json: async () => ({ c: 'encrypted-not-requested' }) };
};

const p = require('./providers/vidzee.js');

(async () => {
  assert.equal(
    p.buildStreamUrl(550, 'movie', null, null, 'dcloud'),
    'https://core.vidzee.wtf/streams/movie/550?s=dcloud&e=0'
  );
  assert.equal(
    p.buildStreamUrl(1399, 'tv', 1, 1, 'v6:Hindi'),
    'https://core.vidzee.wtf/streams/tv/1399/1/1?s=v6%3AHindi&e=0'
  );

  const rows = await p.getStreams(550, 'movie');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].headers.Referer, 'https://player.vidzee.wtf/');
  assert.equal(rows[1].headers.Origin, 'https://video.example');
  assert.equal(rows[1].quality, '1080p');
  assert(requested.every(x => x.url.includes('&e=0')));
  assert(requested.every(x => x.options.headers.Referer === 'https://player.vidzee.wtf/'));

  requested.length = 0;
  await p.getStreams(1399, 'tv', 1, 1);
  assert(requested.some(x => x.url.includes('/streams/tv/1399/1/1?')));

  assert.equal(p.normalizePayload({url:'javascript:alert(1)'}, 'dcloud'), null);
  assert.equal(p.normalizePayload({c:'blob'}, 'dcloud'), null);

  console.log('VidZee Direct tests passed');
})().catch(e => {
  console.error(e);
  process.exit(1);
});

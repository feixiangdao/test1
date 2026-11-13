'use strict';
/* Run locally with Node 18+ on the same network as the Android phone.
 * Note: This reaches external APIs. It does not play or download anything. */
const { getStreams } = require('../providers/yts.js');
(async () => {
  const streams = await getStreams('tt0133093', 'movie');
  console.log('YTS sources for tt0133093:', streams.length);
  streams.forEach((s) => console.log(s.quality, s.size || '?', 'seeders', s.seeders ?? '?'));
  if (streams.length === 0) {
    console.error('No sources: API may be unavailable, empty or blocked from this network.');
    process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

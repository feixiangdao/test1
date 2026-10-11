// Read-only reachability probe. No cookies, storage, credentials, or video extraction.
function diagnosticRows(count) {
  var result = [];
  for (var i = 0; i < count; i++) {
    result.push({name: 'SITE PROBE CODE ' + count, title: 'SITE PROBE CODE ' + count,
      url: 'https://example.com/site-probe-' + (i + 1) + '.m3u8',
      quality: 'Diagnostic', type: 'hls', provider: 'novipnoad-site-probe', headers: {}, subtitles: []});
  }
  return result;
}
async function getStreams() {
  try {
    var response = await fetch('https://www.novipnoad.ca/wp-json/wp/v2/posts?search=The%20Matrix&per_page=2', {
      method: 'GET', headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://www.novipnoad.ca/'
      }
    });
    if (!response || !response.ok) return diagnosticRows(1);
    var body = await response.text();
    if (/Just a moment|challenge-platform|Access denied/i.test(body)) return diagnosticRows(1);
    var data;
    try { data = JSON.parse(body); } catch (_) { return diagnosticRows(2); }
    if (!Array.isArray(data)) return diagnosticRows(2);
    return diagnosticRows(data.length ? 4 : 3);
  } catch (_) {
    return diagnosticRows(1);
  }
}
module.exports = {getStreams: getStreams};

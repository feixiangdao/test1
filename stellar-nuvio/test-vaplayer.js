const assert=require('assert');
const p=require('./providers/vaplayer.js');
const sample='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=640x360\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000,RESOLUTION=1920x1080\nb.m3u8';
assert.equal(p.maxHlsQuality(sample),'1080p');
assert.equal(p.apiUrl('tt0137523','movie'),'https://streamdata.vaplayer.ru/api.php?imdb=tt0137523&type=movie');
assert.equal(p.apiUrl('tt0944947','tv',1,2),'https://streamdata.vaplayer.ru/api.php?imdb=tt0944947&type=tv&season=1&episode=2');
console.log('VAPlayer helper tests passed');

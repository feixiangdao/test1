const assert=require('assert');const p=require('./providers/castletv.js');
const rows=[{id:'a',title:'Fight Club',publishTime:1702634400000},{id:'b',title:'Fight Club',publishTime:939981600000}];
assert.equal(p.chooseMatch(rows,{title:'Fight Club',originalTitle:'Fight Club',year:1999}).id,'b');
assert.equal(p.qualityFromUrl('https://x/hls/a/720/index.m3u8','1080p'),'720p');
console.log('CastleTV helper tests passed');
const assert=require('assert');
const m=require('./providers/movix.js');
assert.equal(m.endpoint('550','movie'),'https://api.movix.cash/api/purstream/movie/550/stream');
assert.equal(m.endpoint('1399','tv',1,2),'https://api.movix.cash/api/purstream/tv/1399/stream?season=1&episode=2');
const rows=m.collect({streams:[
  {url:'https://a.example/master.m3u8'},
  {url:'https://a.example/master.m3u8'},
  {link:'https://b.example/master.m3u8'}
]});
assert.equal(rows.length,2);
console.log('Movix helper tests passed');
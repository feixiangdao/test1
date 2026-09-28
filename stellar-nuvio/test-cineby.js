const assert=require('assert');
const c=require('./providers/cineby.js');

const seed='test-seed-123';
const tmdb=550;
const obj={sources:[{url:'https://cdn.test/a.m3u8',quality:'1080p'}],playlist:null};
const encoded=c.encryptForTest(JSON.stringify(obj),seed,tmdb);
assert.deepEqual(JSON.parse(c.decryptPayload(encoded,seed,tmdb)),obj);
assert(c.qRank('2160p')>c.qRank('1080p'));
assert(c.qRank('4K')===2160);
console.log('Cineby crypto/helper tests passed');

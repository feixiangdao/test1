const assert=require('assert');
const path=require('path');
const m=require('./providers/moviebox.js');

const prefix='https://sbcdn2.hakunaymatata.com/dash/abc123/';
const b64=Buffer.from(prefix).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const cookie='Edge-Cache-Cookie=urlprefix='+b64+':t=9999999999:foo=bar; CloudFront-Signature=abc; CloudFront-Key-Pair-Id=K1';
assert.equal(m.resolveManifest(cookie),'https://sbcdn2.hakunaymatata.com/dash/abc123/index.mpd');

const h=m.buildSignedHeaders('GET','https://api6.aoneroom.com/wefeed-mobile-bff/subject-api/play-info/v2?subjectId=123',null,'tok');
assert(h['x-client-token']);
assert(h['x-tr-signature']);
assert.equal(h.Authorization,'Bearer tok');

console.log('MovieBox mobile helper tests passed');

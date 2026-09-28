const assert=require('assert');
const m=require('./providers/moviebox.js');

const prefix='https://sbcdn2.hakunaymatata.com/dash/abc123/';
const b64=Buffer.from(prefix).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const edge='Edge-Cache-Cookie=urlprefix='+b64+':sign=abc:t=9999999999';
assert.equal(m.resolveManifest(edge),'https://sbcdn2.hakunaymatata.com/dash/abc123/index.mpd');

const policy=Buffer.from(JSON.stringify({Statement:[{Resource:'https://sacdn2.hakunaymatata.com/dash/xyz/*'}]}))
  .toString('base64').replace(/\+/g,'-').replace(/\//g,'~').replace(/=/g,'_');
const cf='CloudFront-Policy='+policy+';CloudFront-Signature=abc;CloudFront-Key-Pair-Id=K';
assert.equal(m.resolveManifest(cf),'https://sacdn2.hakunaymatata.com/dash/xyz/index.mpd');

const h=m.buildSignedHeaders(
  'GET',
  '/wefeed-mobile-bff/subject-api/play-info',
  {subjectId:'123',host:'apig.inmoviebox.com'},
  null,
  'tok',
  1790000000000
);
assert(h['X-M-Version']==='4.0.02');
assert(h['x-tr-signature']);
assert(h['X-Client-Token']);
assert(h.Authorization==='Bearer tok');

const picked=m.chooseSubject(
  {items:[
    {subjectId:'1',subjectType:1,title:'Fight Club [Hindi]',releaseDate:'1999-10-15'},
    {subjectId:'2',subjectType:1,title:'Fight Club',releaseDate:'1999-10-15'}
  ]},
  {title:'Fight Club',originalTitle:'Fight Club',year:'1999',mediaType:'movie'}
);
assert(picked&&picked.subjectId==='2');

console.log('MovieBox v4 helper tests passed');

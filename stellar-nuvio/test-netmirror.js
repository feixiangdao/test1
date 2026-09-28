const assert=require('assert');
const p=require('./providers/netmirror.js');

assert.equal(p.qualityOf('Full HD'),'1080p');
assert.equal(p.qualityOf('Mid HD'),'720p');
assert.equal(p.qualityOf('Low HD'),'480p');
assert.equal(p.qualityOf('Auto'),'Auto');

const ep=p.findEpisode([
  {id:'a',s:'S1',ep:'E1'},
  {id:'b',s:'S1',ep:'E2'}
],1,2,1);
assert(ep&&ep.id==='b');

const rows=p.normalizePlaylist([{
  sources:[
    {file:'/mobile/hls/1.m3u8?q=1080p',label:'Full HD'},
    {file:'/mobile/hls/1.m3u8?q=720p',label:'Mid HD'}
  ],
  tracks:[
    {kind:'captions',file:'//subscdn.top/a.srt',label:'English'}
  ]
}],{name:'Netflix'},'Test');
assert.equal(rows.length,2);
assert.equal(rows[0].quality,'1080p');
assert.equal(rows[0].subtitles.length,1);
assert(rows[0].headers.Cookie==='hd=on');
console.log('NetMirror helper tests passed');

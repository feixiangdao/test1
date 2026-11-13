'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const code=fs.readFileSync(path.join(base,manifest.scrapers[0].filename),'utf8');
const hashList=[
'f566bbf053529bf2432cafd17ed3fb7c118874e6',
'27dafe2828036f091d63293dce0db0bb148c5172',
'9bf23413ddf666f683c1aea285fe8839d97eac2f',
'e504c0e31a1854f83758e5564575e219fe115e13'
];
const healthy=hashList.map((hash,i)=>({hash,quality:['720p','1080p','1080p','2160p'][i],seeds:100}));
const polluted=healthy.map(t=>({...t,hash:'f998565daabbccddeeff00112233445566778899'}));
function data(torrents,isDetail){
  const movie={id:79664,imdb_code:'tt33764258',torrents};
  return {status:'ok',data:isDetail?{movie}:{movies:[movie]}};
}
function makeFetch(primary,backup){
  return async function(url){
    const rows=url.includes('accel.li')?primary:backup;
    const isDetail=url.includes('movie_details');
    return {ok:true,json:async()=>data(rows,isDetail)};
  };
}
function run(fetcher,tmdbKey){
  const m={exports:{}};
  const scope={module:m,exports:m.exports,Promise,fetch:fetcher,encodeURIComponent,
    console:{warn(){}},TMDB_API_KEY:tmdbKey||''};
  scope.globalThis=scope;
  vm.runInNewContext(code,scope,{timeout:3000});
  return scope.module.exports.getStreams;
}
(async()=>{
  assert.equal(manifest.version,'0.3.2');
  assert.equal(manifest.scrapers.length,1);
  assert.equal(manifest.scrapers[0].id,'yts-dual-api-032');
  assert.equal(manifest.scrapers[0].filename,'providers/yts-api-v032.js');
  const cross=await run(makeFetch(polluted,healthy))('tt33764258','movie');
  assert.equal(cross.length,4);
  assert.ok(cross.every(s=>s.name.includes('L1/4 D1/4 R4 PickD1 !DIFF')));
  assert.ok(cross.some(s=>s.name.includes('F566BBF0')));
  assert.ok(cross.every(s=>s.url.startsWith('magnet:?xt=urn:btih:')));
  console.log('PASS 1: backup wins when primary hashes repeat');

  const bothBad=await run(makeFetch(polluted,polluted))('tt33764258','movie');
  assert.equal(bothBad.length,1);
  assert.ok(bothBad[0].name.includes('L1/1 D1/1 R1 PickD0'));
  console.log('PASS 2: both sources contain one hash');

  const bothGood=await run(makeFetch(healthy,healthy))('tt33764258','movie');
  assert.equal(bothGood.length,4);
  assert.ok(bothGood.every(s=>s.name.includes('L4/4 D4/4 R4 PickD0')));
  console.log('PASS 3: equally healthy sources choose primary');

  const badImdb=run(async()=>({ok:true,json:async()=>({
    status:'ok',data:{movies:[{id:79664,imdb_code:'tt0000000',torrents:healthy}]}
  })}));
  assert.equal((await badImdb('tt33764258','movie')).length,0);
  assert.equal((await badImdb('tt33764258','tv')).length,0);
  console.log('PASS 4: reject wrong movie and TV');
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
const js=fs.readFileSync(path.join(base,manifest.scrapers[0].filename),'utf8');
const hashes=['f566bbf053529bf2432cafd17ed3fb7c118874e6',
  '27dafe2828036f091d63293dce0db0bb148c5172',
  '9bf23413ddf666f683c1aea285fe8839d97eac2f',
  'e504c0e31a1854f83758e5564575e219fe115e13'];
const torrents=hashes.map((hash,index)=>({
  hash,quality:['720p','1080p','1080p','2160p'][index],
  video_codec:'x264',size:index+' GB',seeds:100
}));
const response=(data,status=200)=>({
  ok:status>=200&&status<300,status,json:async()=>data
});
function run(fetcher,key='') {
  const m={exports:{}};
  const context={module:m,exports:m.exports,Promise,fetch:fetcher,encodeURIComponent,
    console:{warn(){}},TMDB_API_KEY:key};
  context.globalThis=context;
  vm.runInNewContext(js,context,{timeout:3000});
  return context.module.exports.getStreams;
}
function listFilm(ts=torrents.slice(0,1),imdb='tt33764258'){
  return {status:'ok',data:{movies:[{id:79664,imdb_code:imdb,title:'The Odyssey',torrents:ts}]}};
}
function detailFilm(ts=torrents){
  return {status:'ok',data:{movie:{id:79664,imdb_code:'tt33764258',torrents:ts}}};
}
async function main(){
  assert.equal(manifest.version,'0.3.1');
  assert.equal(manifest.scrapers[0].id,'yts-api-integrity-031');
  assert.equal(manifest.scrapers[0].filename,'providers/yts-api-v031.js');
  assert.deepEqual(manifest.scrapers[0].supportedTypes,['movie']);

  const calls=[];
  const success=run(async url=>{
    calls.push(url);
    if(url.includes('list_movies'))return response(listFilm());
    if(url.includes('movie_details'))return response(detailFilm());
    throw Error('Unexpected '+url);
  });
  const full=await success('tt33764258','movie');
  assert.equal(full.length,4);
  assert.match(full[0].name,/YTS 4K/);
  assert.ok(full.every(x=>x.name.includes('v031 tt33764258 M79664 L1 D4 V4 U4 R4 A0')));
  assert.ok(full.every(x=>x.url.startsWith('magnet:?xt=urn:btih:')));
  assert.ok(calls.some(x=>x.includes('movie_details')));
  assert.equal((new Set(full.map(x=>x.infoHash))).size,4);
  console.log('PASS 1: list(1) plus details(4) -> 4 unique streams');

  const noDetail=run(async url=>{
    if(url.includes('list_movies'))return response(listFilm());
    return response({},404);
  });
  const partial=await noDetail('tt33764258','movie');
  assert.equal(partial.length,1);
  assert.match(partial[0].name,/v031 tt33764258 M79664 L1 DERR/);
  console.log('PASS 2: detail API fails; label shows DERR and preserves list');

  const invalidMovie=run(async url=>{
    if(url.includes('list_movies'))return response(listFilm(torrents,'tt9999999'));
    return response({},404);
  });
  assert.equal((await invalidMovie('tt33764258','movie')).length,0);
  console.log('PASS 3: IMDb identity protection');

  const tmdb=run(async url=>{
    if(url.includes('/external_ids'))return response({imdb_id:'tt33764258'});
    if(url.includes('list_movies'))return response(listFilm());
    if(url.includes('movie_details'))return response(detailFilm());
    throw Error('Unexpected '+url);
  },'test-key');
  assert.equal((await tmdb('603','movie')).length,4);
  assert.equal((await tmdb('603','tv',1,1)).length,0);
  console.log('PASS 4: TMDB->IMDb conversion and movie-only filter');

  const dedup=run(async url=>{
    if(url.includes('list_movies'))return response(listFilm([torrents[0],torrents[0]]));
    if(url.includes('movie_details'))return response(detailFilm([torrents[0],torrents[1],torrents[1]]));
    return response({},404);
  });
  assert.equal((await dedup('tt33764258','movie')).length,2);
  console.log('PASS 5: duplicates removed by full infoHash');

  const malformed=run(async url=>{
    if(url.includes('list_movies'))return response(listFilm([torrents[0]]));
    if(url.includes('movie_details'))return response(detailFilm([
      torrents[0],
      {hash:'not-a-hash',quality:'1080p'},
      {hash:null,quality:'2160p'},
      {hash:123,quality:'1080p'}
    ]));
    return response({},404);
  });
  const one=await malformed('tt33764258','movie');
  assert.equal(one.length,1);
  assert.match(one[0].name,/L1 D4 V1 U1 R1/);
  console.log('PASS 6: Raw D4 with one valid hash yields one stream');

}
main().catch(error=>{console.error(error);process.exitCode=1;});

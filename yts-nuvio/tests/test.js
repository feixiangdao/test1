'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.resolve(__dirname,'..');
const manifest = JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const code = fs.readFileSync(path.join(dir,manifest.scrapers[0].filename),'utf8');
const cleanHashes=[
'f566bbf053529bf2432cafd17ed3fb7c118874e6',
'27dafe2828036f091d63293dce0db0bb148c5172',
'9bf23413ddf666f683c1aea285fe8839d97eac2f',
'e504c0e31a1854f83758e5564575e219fe115e13'
];
const clean=cleanHashes.map((hash,index)=>({hash,quality:['720p','1080p','1080p','2160p'][index]}));
const corrupted=clean.map(x=>({...x,hash:'f998565daabbccddeeff00112233445566778899'}));
function mockFetch(primary,backup){
 return async function(url,opts){
  if(!opts||!opts.headers||!opts.headers['User-Agent'].includes('Android'))throw Error('Mobile UA missing');
  if(!url.includes('_nuviocb='))throw Error('Cache bypass parameter missing');
  if(!opts.headers['Cache-Control'].includes('no-cache'))throw Error('No-cache headers missing');
  const rows=url.includes('accel.li')?primary:backup;
  const movie={id:79664,imdb_code:'tt33764258',torrents:rows};
  const text=JSON.stringify({status:'ok',data:url.includes('movie_details')?{movie}:{movies:[movie]}});
  return {ok:true,status:200,url,text:async()=>text};
 };
}
function execute(fetcher){
 const module={exports:{}};
 const context={module,exports:module.exports,fetch:fetcher,Promise,encodeURIComponent,Date};
 context.globalThis=context;
 vm.runInNewContext(code,context,{timeout:3000});
 return context.module.exports.getStreams;
}
(async()=>{
 assert.equal(manifest.version,'0.3.3');
 assert.equal(manifest.scrapers[0].id,'yts-http-integrity-v033');
 assert.equal(manifest.scrapers[0].filename,'providers/yts-api-v033.js');
 const recovered=await execute(mockFetch(corrupted,clean))('tt33764258','movie');
 assert.equal(recovered.length,4);
 assert.ok(recovered.every(x=>x.name.includes('L1/4 D1/4 Raw4/1|4/4 PrefixF998565D/F566BBF0 R4 PickD1')));
 assert.ok(recovered.every(x=>x.url.startsWith('magnet:?xt=urn:btih:')));
 console.log('PASS 1: Alternate host selected when raw/parsed hashes vary across hosts');
 const broken=await execute(mockFetch(corrupted,corrupted))('tt33764258','movie');
 assert.equal(broken.length,1);
 assert.ok(broken[0].name.includes('D1/1 Raw4/1|4/1 R1'));
 console.log('PASS 2: Both hosts duplicate a hash; flag source data');
 const healthy=await execute(mockFetch(clean,clean))('tt33764258','movie');
 assert.equal(healthy.length,4);
 assert.ok(healthy.every(x=>x.name.includes('L4/4 D4/4 Raw4/4|4/4')));
 console.log('PASS 3: Four distinct hashes survive both API requests');
 const wrongMovie=execute(async()=>({ok:true,status:200,text:async()=>JSON.stringify({
   status:'ok',data:{movies:[{id:1,imdb_code:'tt0000000',torrents:clean}]}
 })}));
 assert.equal((await wrongMovie('tt33764258','movie')).length,0);
 assert.equal((await wrongMovie('tt33764258','tv')).length,0);
 console.log('PASS 4: IMDb identity and movie-only filtering');
})().catch(e=>{console.error(e);process.exitCode=1;});

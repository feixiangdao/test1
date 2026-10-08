const assert=require('node:assert/strict');
const {getStreams}=require('./providers/vidplay.js');
globalThis.SCRAPER_SETTINGS={};
let seen=[];
function mock(responder){seen=[];globalThis.fetch=async (url,opt)=>{seen.push(String(url));let x=responder(String(url),opt||{});return {ok:x.status>=200&&x.status<300,status:x.status,text:async()=>x.body};};}
(async()=>{
 mock(u=>{
  if(u.includes('/ajax/tv_vplay.php'))return{status:200,body:'<iframe src="https://embed.example/watch/123"></iframe>'};
  if(u.includes('https://embed.example/'))return{status:200,body:'var config={file:"https://cdn.example/test/master.m3u8?token=abc"}'};
  return{status:403,body:'<title>Just a moment...</title>'};
 });
 const tv=await getStreams(125935,'tv',1,1);
 assert.equal(tv.length,1);
 assert.equal(tv[0].url,'https://cdn.example/test/master.m3u8?token=abc');
 assert.equal(tv[0].name,'VidPlay · V1');
 assert(seen.some(u=>u.endsWith('/ajax/tv_vplay.php?embed=125935&season=1&episode=1')));
 assert(seen.some(u=>u.endsWith('/ajax/tv_vplay3.php?embed=125935&season=1&episode=1')));
 console.log('PASS TV V1 nested HLS; V2/V3 403 ignored',tv.length);
 mock(u=>u.includes('mov_vplay3.php')?{status:200,body:'{"file":"https://cdn.example/life.mp4"}'}:{status:403,body:'blocked'});
 const movie=await getStreams(395992,'movie');
 assert.equal(movie.length,1);assert.equal(movie[0].type,'mp4');
 assert.equal(seen.filter(u=>u.includes('mov_vplay')).length,1);
 console.log('PASS movie V3 TMDB route and direct mp4',movie.length);
 mock(u=>({status:403,body:'<title>Just a moment...</title>'}));
 const blocked=await getStreams(125935,'tv',1,1);assert.deepEqual(blocked,[]);
 console.log('PASS all 403 responses fail closed');
 mock(u=>({status:200,body:'<html><body>...</body></html>'}));
 const missing=await getStreams(125935,'tv',1,1);assert.deepEqual(missing,[]);
 console.log('PASS non-media AJAX pages cannot become fake streams');
 assert.deepEqual(await getStreams('invalid','movie'),[]);
 assert.deepEqual(await getStreams(125935,'tv',0,1),[]);
 console.log('PASS invalid IDs/episodes skipped');

 mock(u=>u.includes('tv_vplay.php')?{status:200,body:'<script>const docs="https://ads.example/test.mp4";var player={file:"https://cdn.example/real/master.m3u8?sig=123"};</script>'}:{status:403,body:'blocked'});
 const strict=await getStreams(125935,'tv',1,1);
 assert.equal(strict.length,1);
 assert.equal(strict[0].url,'https://cdn.example/real/master.m3u8?sig=123');
 console.log('PASS unlabelled ad/sample media links ignored');

 mock(u=>u.includes('tv_vplay.php')?{status:200,body:'var player={file:"http://127.0.0.1/private.mp4",url:"http://192.168.1.9/private.m3u8",source:"https://public.example/file.mp4"};'}:{status:403,body:'blocked'});
 const safe=await getStreams(125935,'tv',1,1);
 assert.equal(safe.length,1);
 assert.equal(safe[0].url,'https://public.example/file.mp4');
 console.log('PASS local network and loopback URLs filtered');

 globalThis.TMDB_API_KEY='dummy-test-key';
 mock(u=>{
   if(u.includes('api.themoviedb.org'))return{status:200,body:'{"imdb_id":"tt5442430"}'};
   if(u.includes('mov_vplay.php'))return{status:200,body:'{"file":"https://media.example/v1/video.mp4"}'};
   if(u.includes('mov_vplay2.php'))return{status:200,body:'<html>...</html>'};
   return{status:403,body:'blocked'};
 });
 const keyRoutes=await getStreams(395992,'movie');
 assert.equal(keyRoutes.length,1);
 assert(seen.some(u=>u.includes('api.themoviedb.org/3/movie/395992/external_ids?api_key=dummy-test-key')));
 assert(seen.some(u=>u.endsWith('mov_vplay.php?embed=tt5442430')));
 assert.equal(keyRoutes[0].name,'VidPlay · V1');
 delete globalThis.TMDB_API_KEY;
 console.log('PASS movie IMDb lookup via shared TMDB key');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
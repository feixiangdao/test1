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
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
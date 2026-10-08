const assert = require("node:assert/strict");
const {getStreams,onSettings}=require("./providers/flixer-local.js");
async function main(){
 const requests=[];
 global.fetch=async(url)=>{requests.push(url);return {ok:true,text:async()=>'prefix https://media.example/test/master.m3u8 suffix'};};
 const movie=await getStreams("9502","movie");
 assert.equal(requests[0],"https://flixer.su/watch/movie/9502");
 assert.equal(movie.length,1);
 assert.equal(movie[0].type,"hls");
 assert.equal(movie[0].quality,"Auto");
 const tv=await getStreams(1399,"tv",1,1);
 assert.equal(requests[1],"https://flixer.su/watch/tv/1399/1/1");
 assert.equal(tv.length,1);
 assert.deepEqual(await getStreams("foo","movie"),[]);
 assert.deepEqual(await getStreams(9502,"tv",1,0),[]);
 let called=0;
 global.fetch=async()=>{called++;return {ok:true,text:async()=>'<html>encrypted API /assets/wasm/img_data_bg.wasm</html>'}};
 const encrypted=await getStreams(9502,"movie");
 assert.deepEqual(encrypted,[],"must not fabricate playable media when encrypted");
 assert.equal(called,1);
 assert(onSettings().some(x=>x.type==="info"));
 console.log("LOCAL_PROVIDER_UNIT_TESTS_PASS movie-route, tv-route, direct-HLS, malformed-id, encrypted-no-false-positive");
}
main().catch(e=>{console.error(e);process.exit(1)});

const assert=require("node:assert/strict");
const {getStreams}=require("./providers/vidplay.js");
const lifePage="https://vidplay.top/movie/51381-watch-life-2017-online";
const lifeSearch='<figure><a href="/movie/51381-watch-life-2017-online"></a><div class="title">Life</div><div class="year">2017</div></figure>';
const md='{"title":"Life","release_date":"2017-03-23","external_ids":{"imdb_id":"tt5442430"}}';
const landing="https://stellarconductornexus.com/embed/movie/tt5442430?vs=temporary";
const player="https://stellarconductornexus.com/embed/player/movie/tt5442430?vs=temporary";
const apiBase="https://data.vidsrc.sh/api.php?type=movie&imdb=tt5442430&stream_urls";
const token="one-use-unit-test-only";
const api=apiBase+"&api_token="+encodeURIComponent(token);
const hlsURL="https://media.example/master.m3u8";
const master='#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=640x360\nhttps://media.example/360p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3500000,RESOLUTION=1280x720\nhttps://media.example/720p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5800000,RESOLUTION=1920x1080\nhttps://media.example/1080p.m3u8\n';
const bodyJSON={status_code:"200",data:{stream_urls:[hlsURL]}};
function assertDiagnostics(rows,label){
  assert.equal(rows.length,1,label+" should preserve a visible diagnostic row");
  assert.equal(rows[0].quality,"Status");
  assert.match(rows[0].name,/VidPlay · V1 · 诊断（不可播放）/);
  assert.match(rows[0].url,/^data:application\/vnd\.apple\.mpegurl;base64,/);
  assert.notEqual(rows[0].type,"mp4");
}
let called=[];
function mock(responder){
  called=[];
  globalThis.fetch=async (url,options)=>{
    called.push({url:String(url),headers:options&&options.headers||{}});
    let out=responder(String(url),options||{});
    if(!out)throw new Error("Unexpected URL "+url);
    let body=typeof out.body==="string"?out.body:JSON.stringify(out.body||{});
    return {ok:out.status>=200&&out.status<300,status:out.status,
      headers:{get:(name)=>out.contentType||"application/json"},
      text:async()=>body,arrayBuffer:async()=>new TextEncoder().encode(body).buffer
    };
  };
}
function common(u,opts){
  if(u.includes("api.themoviedb.org"))return{status:200,body:md};
  if(u.includes("/index.php?menu=search"))return{status:200,body:lifeSearch};
  if(u==="https://ythd.org/embed/tt5442430")return{status:200,body:"<html>YTHD outer embed</html>"};
  if(u==="https://ythd.org/vs_src.php?type=movie&id=tt5442430")return{status:200,body:{src:landing}};
  if(u===landing)return{status:200,body:'<script>window.CFG = {"playerUrl":"/embed/player/movie/tt5442430?vs=temporary"};</script>'};
  if(u===player)return{status:200,body:'<script>window.CONFIG = {"mediaType":"movie","imdb":"tt5442430","api":"'+apiBase+'","apiToken":"'+token+'","turnstile":false};</script>'};
  if(u===api)return{status:200,body:bodyJSON};
  if(u==="https://media.example/generate.php")return{status:404,body:"not found"};
  if(u===hlsURL)return{status:200,body:master};
  if(u.includes("/ajax/mov_vplay.php"))return{status:403,body:"Just a moment..."};
  return null;
}
(async()=>{
  globalThis.SCRAPER_SETTINGS={tmdbApiKey:"test-tmdb-key"};
  mock(common);
  const streams=await getStreams(395992,"movie");
  assert.equal(streams.length,3);
  assert.deepEqual(streams.map(x=>x.quality),["360p","720p","1080p"]);
  assert(streams.every(x=>x.name.startsWith("VidPlay · V1")));
  assert(streams.every(x=>x.type==="hls"));
  assert(called.some(x=>x.url===api));
  assert(!called.some(x=>/mov_vplay2|mov_vplay3|tv_vplay2|tv_vplay3/.test(x.url)));
  assert(called.some(x=>x.url===player));
  console.log("PASS: V1 signed player API -> independently verified HLS 360p/720p/1080p");

  mock((u,o)=>{
    if(u===player)return{status:200,body:'<script>window.CONFIG = {"mediaType":"movie","imdb":"tt5442430","api":"'+apiBase+'","turnstile":true};</script>'};
    return common(u,o);
  });
  assertDiagnostics(await getStreams(395992,"movie"),"V1 player blocked");
  assert(!called.some(x=>x.url.startsWith(apiBase)));
  console.log("PASS: browser verification shows one explicitly nonplayable diagnostic; no fake media");

  mock((u,o)=>{
    if(u===player)return{status:200,body:'<script>window.CONFIG = {"mediaType":"movie","imdb":"tt5442430","api":"'+apiBase+'","turnstile":false};</script>'};
    return common(u,o);
  });
  assertDiagnostics(await getStreams(395992,"movie"),"V1 player blocked");
  assert(!called.some(x=>x.url.startsWith(apiBase)));
  console.log("PASS: absent signed API token shows diagnostic, never playable media");

  mock((u,o)=>{
    if(u===api)return{status:403,body:{status_code:"403",error:"invalid api token"}};
    return common(u,o);
  });
  assertDiagnostics(await getStreams(395992,"movie"),"V1 player blocked");
  console.log("PASS: invalid signed token 403 shows diagnostic");

  mock((u,o)=>{
    if(u.startsWith("https://ythd.org/"))return{status:403,body:"blocked"};
    if(u.includes("mov_vplay.php"))return{status:200,body:'<iframe src="https://embed.example/player/life"></iframe>'};
    if(u==="https://embed.example/player/life")return{status:200,body:'var player={file:"https://media.example/master.m3u8"}'};
    return common(u,o);
  });
  const fallback=await getStreams(395992,"movie");
  assert.equal(fallback.length,3);
  assert(called.some(x=>x.url.includes("mov_vplay.php?embed=tt5442430")));
  assert(!called.some(x=>x.url.includes("mov_vplay2")||x.url.includes("mov_vplay3")));
  console.log("PASS: movie V1-only AJAX fallback when YTHD unreachable");

  const tvPage="https://vidplay.top/watchseries/abbott-elementary-online-free/season/1/episode/1";
  mock((u,o)=>{
    if(u.includes("api.themoviedb.org"))return{status:200,body:{name:"Abbott Elementary",first_air_date:"2021-12-07"}};
    if(u.includes("/index.php?menu=search"))return{status:200,body:'<figure><a href="/watchseries/abbott-elementary-online-free"></a><div class="title">Abbott Elementary</div><div class="year">2021</div></figure>'};
    if(u.includes("/ajax/tv_vplay.php")){assert.equal(o.headers.Referer,tvPage);return{status:200,body:'var media={file:"https://media.example/master.m3u8"}'};}
    if(u==="https://media.example/generate.php")return{status:404,body:""};
    if(u===hlsURL)return{status:200,body:master};
    return{status:403,body:"blocked"};
  });
  const tv=await getStreams(125935,"tv",1,1);
  assert.equal(tv.length,3);
  assert(!called.some(x=>/tv_vplay2|tv_vplay3/.test(x.url)));
  console.log("PASS: TV V1 first-party AJAX fallback only");

  mock((u,o)=>{
    if(u===api)return{status:200,body:{status_code:"200",data:{stream_urls:["http://127.0.0.1/private.m3u8","https://media.example/master.m3u8"]}}};
    return common(u,o);
  });
  const safety=await getStreams(395992,"movie");
  assert.equal(safety.length,3);
  assert(!called.some(x=>x.url.includes("127.0.0.1")));
  console.log("PASS: private IP media rejected");


  // Crucial no-key route: the public metadata endpoint maps TMDB 395992
  // directly to the IMDb ID used by the real VidPlay V1 YTHD embed.
  globalThis.SCRAPER_SETTINGS={};
  delete globalThis.TMDB_API_KEY;
  mock((u,o)=>{
    if(u==="https://data.vidsrc.sh/api.php?type=movie&tmdb=395992")
      return{status:200,body:{status_code:"200",data:{title:"Life 2017",imdb_id:"tt5442430"}}};
    return common(u,o);
  });
  const keyless=await getStreams(395992,"movie");
  assert.equal(keyless.length,3);
  assert(called.some(x=>x.url==="https://data.vidsrc.sh/api.php?type=movie&tmdb=395992"));
  assert(!called.some(x=>x.url.includes("api.themoviedb.org")));
  console.log("PASS: keyless TMDB-to-IMDb mapping for VidPlay V1");

  assertDiagnostics(await getStreams("wrong","movie"),"Invalid movie ID");
  assertDiagnostics(await getStreams(125935,"tv",1,0),"Missing TV episode");
  console.log("PASS: invalid identifiers rejected");
  // Delayed network failure: the 7s watchdog keeps a status row visible.
  mock(()=>{throw new Error("Network unavailable");});
  assertDiagnostics(await getStreams(395992,"movie"),"Network errors");
  console.log("PASS: network errors keep explicit nonplayable status, not empty provider");

})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

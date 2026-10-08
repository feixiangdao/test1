const assert=require("node:assert/strict");
const {parseHlsMaster,resolveHlsUrl,hlsQuality}=require("./hls.js");
const url="https://cdn.example.net/a/b/hls/master.m3u8?auth=abc";
const master=[
 "#EXTM3U",
 "#EXT-X-VERSION:3",
 "#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x272",
 "360/index.m3u8",
 "#EXT-X-STREAM-INF:BANDWIDTH=2200000,RESOLUTION=1280x544",
 "720/index.m3u8",
 "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x816",
 "../1080/index.m3u8?token=123",
].join("\n");
const sources=parseHlsMaster(master,url);
assert.equal(sources.length,3);
assert.deepEqual(sources.map(s=>s.quality),["1080p","720p","SD"]);
assert.equal(sources[0].url,"https://cdn.example.net/a/b/1080/index.m3u8?token=123");
assert.equal(sources[1].url,"https://cdn.example.net/a/b/hls/720/index.m3u8");
assert.equal(sources[0].title,"1080p · 1920×816");
assert.equal(parseHlsMaster("#EXTM3U\n#EXTINF:9\nfile.ts",url).length,0);
assert.deepEqual(parseHlsMaster("invalid",url),[]);
assert.equal(resolveHlsUrl(url,"/video/stream.m3u8"),"https://cdn.example.net/video/stream.m3u8");
assert.equal(resolveHlsUrl(url,"//edge.example.com/video.m3u8"),"https://edge.example.com/video.m3u8");
assert.equal(resolveHlsUrl(url,"javascript:alert(1)"),"");
assert.equal(hlsQuality(3840,2160),"4K");
console.log("LOCAL_HLS_TESTS_PASS master-variants, resolution-labels, relative-uri, sorting, invalid-playlist");

const assert=require("node:assert/strict");
const crypto=require("node:crypto");
globalThis.get_img_key=function(){return "0123456789abcdef".repeat(4);};
globalThis.process_img_data=function(raw,key){return JSON.stringify({sources:[{server:"alpha",url:"https://media.example.org/playlist/master.m3u8"}]});};
const requests=[];
globalThis.fetch=async function(url,opt){
 requests.push({url,headers:opt?.headers||{}});
 if(url.includes("/api/time"))return {ok:true,json:async()=>({timestamp:Math.floor(Date.now()/1000)})};
 if(url.endsWith("/images"))return{ok:true,text:async()=>"example-cipher"};
 throw Error("Unexpected url: "+url);
};
const provider=require("./local-protocol.js");
const u=globalThis.__flixerLocalProtocolTest;
for(const [key,msg] of [
 ["key","The quick brown fox jumps over the lazy dog"],
 ["0123456789abcdef".repeat(4),"0123456789abcdef".repeat(4)+":1728415191:abc:/api/tmdb/movie/9502/images"],
 ["key",""],
]){
 const actual=u.hmac(key,msg),expected=crypto.createHmac("sha256",key).update(msg).digest("base64");
 assert.equal(actual,expected,"SHA256 HMAC differs");
}
assert.equal(u.apiPath("9502","movie"),"/api/tmdb/movie/9502/images");
assert.equal(u.apiPath("1399","tv",1,1),"/api/tmdb/tv/1399/season/1/episode/1/images");
assert.equal(u.apiPath("a","movie"),"");
assert.equal(u.apiPath("1399","tv",1,0),""); // Reject episode zero.
(async()=>{
 const movie=await provider.getStreams("9502","movie");
 assert.equal(movie.length,1);
 assert.equal(movie[0].url,"https://media.example.org/playlist/master.m3u8");
 assert.equal(movie[0].type,"hls");
 const request=requests.find(x=>x.headers["X-Server"]==="alpha");
 assert(request,"No Alpha media request was issued");
 const h=request.headers,path="/api/tmdb/movie/9502/images";
 assert.equal(h["X-Only-Sources"],"1");
 assert.equal(h["X-Fingerprint-Lite"],"e9136c41504646444");
 assert.equal(h["X-Api-Key"],globalThis.get_img_key());
 const expected=crypto.createHmac("sha256",h["X-Api-Key"]).update(h["X-Api-Key"]+":"+h["X-Request-Timestamp"]+":"+h["X-Request-Nonce"]+":"+path).digest("base64");
 assert.equal(h["X-Request-Signature"],expected);
 const tv=await provider.getStreams("1399","tv",1,1);
 assert.equal(tv.length,1);
 assert(requests.some(x=>x.url.endsWith("/api/tmdb/tv/1399/season/1/episode/1/images")));
 console.log("FLIXER_LOCAL_PROTOCOL_TESTS_PASS HMAC-SHA256 x3, TMDB routes, signed Alpha request, TV, media output");
})().catch(e=>{console.error(e);process.exitCode=1});

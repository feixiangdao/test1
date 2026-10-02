// NoctraTV · Nesterov — Moscow / Novo / Omsk direct resolver.
// Current public reverse-engineered contract:
//   GET https://stream.hls.lol/helios?tmdbId=<id>&type=movie|tv[&seasonId=&episodeId=]
//   -> { sources: { Moscow:{url}, Novo:{url}, Omsk:{url} } }
// Current upstream has used both "ns_<hex>" and "hl_<hex>" envelopes.
// Both use AES-256-GCM: 12-byte IV || ciphertext || 16-byte tag.
// This implementation uses WebCrypto so it runs in Nuvio Mobile; no Node crypto,
// WebAssembly, iframe, or external web-player fallback.

var BASE="https://stream.hls.lol";
var ORIGIN="https://atlantic.st";
var KEY_HEX="e4b8a1d6f2c9037b5a8e4d1c6f9b2085a7c3e9f6d1b4a8c2e5f7a0d3b6c9e2f5";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var ORDER=["Moscow","Novo","Omsk"];

function clean(v){return v==null?"":String(v).trim()}
function hdr(){
  return {
    "User-Agent":UA,
    "Origin":ORIGIN,
    "Referer":ORIGIN+"/",
    "Accept":"*/*",
    "Accept-Language":"en-US,en;q=0.9",
    "Sec-Fetch-Dest":"empty",
    "Sec-Fetch-Mode":"cors",
    "Sec-Fetch-Site":"cross-site"
  };
}
function hasTimers(){
  try{return typeof setTimeout==="function"&&typeof clearTimeout==="function"}catch(_){return false}
}
function timeout(p,ms,label){
  if(!hasTimers())return p;
  return new Promise(function(resolve,reject){
    var done=false;
    var t=setTimeout(function(){if(done)return;done=true;reject(new Error(label+" timeout"))},ms);
    Promise.resolve(p).then(function(v){if(done)return;done=true;clearTimeout(t);resolve(v)},function(e){if(done)return;done=true;clearTimeout(t);reject(e)});
  });
}
function hexBytes(s){
  s=clean(s);
  if(!s||s.length%2)return new Uint8Array(0);
  var out=new Uint8Array(s.length/2);
  for(var i=0;i<out.length;i++){
    var n=parseInt(s.slice(i*2,i*2+2),16);
    if(!isFinite(n))return new Uint8Array(0);
    out[i]=n;
  }
  return out;
}
function decodeUtf8(bytes){
  if(typeof TextDecoder!=="undefined")return new TextDecoder("utf-8").decode(bytes);
  var s="";for(var i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);
  try{return decodeURIComponent(escape(s))}catch(_){return s}
}
function subtle(){
  try{
    if(globalThis.crypto&&globalThis.crypto.subtle)return globalThis.crypto.subtle;
  }catch(_){}
  return null;
}
async function decryptNs(raw){
  raw=clean(raw);
  var prefix=raw.slice(0,3);
  if(prefix!=="ns_"&&prefix!=="hl_")return raw;
  var blob=hexBytes(raw.slice(3));
  if(blob.length<29)throw new Error("nesterov payload too short");
  var keyBytes=hexBytes(KEY_HEX);
  var c=subtle();
  if(!c)throw new Error("WebCrypto unavailable");
  var key=await c.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]);
  // WebCrypto expects ciphertext and the 16-byte auth tag concatenated.
  var iv=blob.slice(0,12);
  var cipherAndTag=blob.slice(12);
  var plain=await c.decrypt({name:"AES-GCM",iv:iv,tagLength:128},key,cipherAndTag);
  return decodeUtf8(new Uint8Array(plain));
}
function qualityFromMaster(body){
  var max=0,m,re=/RESOLUTION=\d+x(\d+)/ig;
  while((m=re.exec(body||"")))max=Math.max(max,Number(m[1])||0);
  return max?max+"p":"Auto";
}
async function verifyHls(url){
  if(!/^https?:\/\//i.test(url))return null;
  try{
    var r=await timeout(fetch(url,{headers:hdr()}),7000,"master");
    if(!r.ok)return null;
    var body=await r.text();
    if(!/^#EXTM3U/m.test(body||""))return null;
    return {url:url,quality:qualityFromMaster(body)};
  }catch(_){return null}
}
async function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return[];
  if(mediaType==="tv"&&(!season||!episode))return[];
  var q="tmdbId="+encodeURIComponent(String(tmdbId))+"&type="+encodeURIComponent(mediaType);
  if(mediaType==="tv"){
    q+="&seasonId="+encodeURIComponent(String(season))+"&episodeId="+encodeURIComponent(String(episode));
  }
  var api=BASE+"/helios?"+q;
  try{
    var r=await timeout(fetch(api,{headers:hdr()}),8000,"helios");
    if(!r.ok){console.log("[NoctraTV/Nesterov] API HTTP "+r.status);return[]}
    var j=await r.json();
    var sources=j&&j.sources&&typeof j.sources==="object"?j.sources:{};
    var jobs=ORDER.map(async function(name){
      var row=sources[name];
      var raw=row&&typeof row.url==="string"?row.url:"";
      if(!raw)return null;
      var u;
      try{u=await decryptNs(raw)}catch(e){console.log("[NoctraTV/Nesterov] "+name+" decrypt "+(e&&e.message?e.message:e));return null}
      if(!/^https?:\/\//i.test(u))return null;
      try{if(new URL(u).hostname==="atlantic.st")return null}catch(_){return null}
      var v=await verifyHls(u);
      if(!v)return null;
      var title="NoctraTV · Nesterov · "+name+" · "+v.quality;
      return {
        name:title,
        title:title,
        url:v.url,
        quality:v.quality,
        type:"hls",
        provider:"noctra-nesterov",
        headers:hdr()
      };
    });
    var rows=await Promise.all(jobs),out=[],seen={};
    rows.forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x)}});
    console.log("[NoctraTV/Nesterov] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }catch(e){
    console.log("[NoctraTV/Nesterov] "+(e&&e.message?e.message:e));
    return[];
  }
}
module.exports={getStreams:getStreams};

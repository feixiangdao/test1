// NoctraTV · Nxsha — direct-source resolver for current Nxsha API.
// Maps noctratv.com entries:
//   Nxsha · Nitro    -> provider nitro
//   Nxsha · Citadel  -> provider rive-citadel
//   Nxsha · AwsPly   -> provider awsind
//   Nxsha · CastVid  -> provider castle
//
// Nxsha wraps request/response JSON in OpenSSL-compatible AES-256-CBC
// (EVP_BytesToKey/MD5, "Salted__"). We reproduce that locally with WebCrypto,
// and intentionally discard isEmbed/embed sources.

var BASES=["https://web.nxsha.app","https://nxsha.space"];
var PASS="S8x!Jk4ZP1uG8$my";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var TARGETS=[
  {provider:"nitro",label:"Nitro"},
  {provider:"rive-citadel",label:"Citadel"},
  {provider:"awsind",label:"AwsPly"},
  {provider:"castle",label:"CastVid"}
];

function clean(v){return v==null?"":String(v).trim()}
function getSubtle(){
  try{if(globalThis.crypto&&globalThis.crypto.subtle)return globalThis.crypto.subtle}catch(_){}
  return null;
}
function utf8Bytes(s){
  var x=unescape(encodeURIComponent(String(s||""))),a=new Uint8Array(x.length),i;
  for(i=0;i<x.length;i++)a[i]=x.charCodeAt(i)&255;
  return a;
}
function bytesUtf8(a){
  var s="",i,chunk=8192;
  for(i=0;i<a.length;i+=chunk)s+=String.fromCharCode.apply(null,Array.prototype.slice.call(a,i,i+chunk));
  try{return decodeURIComponent(escape(s))}catch(_){return s}
}
function concatBytes(){
  var total=0,i,j,pos=0,args=arguments;
  for(i=0;i<args.length;i++)total+=args[i].length;
  var out=new Uint8Array(total);
  for(i=0;i<args.length;i++){for(j=0;j<args[i].length;j++)out[pos++]=args[i][j]}
  return out;
}
function b64(bytes){
  var s="",i,chunk=8192;
  for(i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode.apply(null,Array.prototype.slice.call(bytes,i,i+chunk));
  return btoa(s);
}
function b64url(bytes){return b64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function fromB64url(s){
  var x=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  while(x.length%4)x+="=";
  var bin=atob(x),a=new Uint8Array(bin.length),i;
  for(i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i)&255;
  return a;
}

// Compact MD5 used only by OpenSSL EVP_BytesToKey.
function md5HexBytes(bytes){
  var n=bytes.length,words=[],i,j;
  for(i=0;i<n;i++)words[i>>2]=(words[i>>2]||0)|(bytes[i]<<((i%4)<<3));
  words[n>>2]=(words[n>>2]||0)|(0x80<<((n%4)<<3));
  var wl=(((n+8)>>6)+1)<<4;
  for(i=0;i<wl;i++)words[i]=words[i]||0;
  words[wl-2]=n<<3;
  var S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  function rl(v,c){return(v<<c)|(v>>>(32-c))}
  var a=1732584193,b=-271733879,c=-1732584194,d=271733878;
  for(i=0;i<wl;i+=16){
    var M=words.slice(i,i+16),oa=a,ob=b,oc=c,od=d;
    for(j=0;j<64;j++){
      var f,g;
      if(j<16){f=(b&c)|(~b&d);g=j}
      else if(j<32){f=(d&b)|(~d&c);g=(5*j+1)%16}
      else if(j<48){f=b^c^d;g=(3*j+5)%16}
      else{f=c^(b|~d);g=(7*j)%16}
      var tmp=d;d=c;c=b;
      var K=Math.floor(Math.abs(Math.sin(j+1))*4294967296);
      b=(b+rl((a+f+K+M[g])|0,S[j]))|0;
      a=tmp;
    }
    a=(a+oa)|0;b=(b+ob)|0;c=(c+oc)|0;d=(d+od)|0;
  }
  function wordBytes(w){return[(w)&255,(w>>>8)&255,(w>>>16)&255,(w>>>24)&255]}
  return new Uint8Array([].concat(wordBytes(a),wordBytes(b),wordBytes(c),wordBytes(d)));
}
function evp(pass,salt){
  var passB=utf8Bytes(pass),d=[],prev=new Uint8Array(0);
  while(d.length<48){
    var input=concatBytes(prev,passB,salt);
    prev=md5HexBytes(input);
    for(var i=0;i<prev.length;i++)d.push(prev[i]);
  }
  return{key:new Uint8Array(d.slice(0,32)),iv:new Uint8Array(d.slice(32,48))};
}
function randomBytes(n){
  var a=new Uint8Array(n),i;
  try{if(globalThis.crypto&&globalThis.crypto.getRandomValues)return globalThis.crypto.getRandomValues(a)}catch(_){}
  for(i=0;i<n;i++)a[i]=Math.floor(Math.random()*256);
  return a;
}
function encodePayload(obj){
  var sub=getSubtle();if(!sub)return Promise.reject(new Error("WebCrypto unavailable"));
  var salt=randomBytes(8);
  var payload={};
  Object.keys(obj||{}).forEach(function(k){payload[k]=obj[k]});
  payload._req_ts=Date.now();
  payload._req_salt=Math.random().toString(36).slice(2,12);
  var der=evp(PASS,salt),plain=utf8Bytes(JSON.stringify(payload));
  return sub.importKey("raw",der.key,{name:"AES-CBC"},false,["encrypt"])
    .then(function(key){return sub.encrypt({name:"AES-CBC",iv:der.iv},key,plain)})
    .then(function(ab){
      var head=new Uint8Array([83,97,108,116,101,100,95,95]);
      return b64url(concatBytes(head,salt,new Uint8Array(ab)));
    });
}
function decodeHash(hash){
  var sub=getSubtle();if(!sub)return Promise.reject(new Error("WebCrypto unavailable"));
  var all=fromB64url(hash);
  if(all.length<32)return Promise.reject(new Error("short encrypted response"));
  var sig=String.fromCharCode.apply(null,Array.prototype.slice.call(all,0,8));
  if(sig!=="Salted__")return Promise.reject(new Error("bad encrypted response"));
  var salt=all.slice(8,16),ct=all.slice(16),der=evp(PASS,salt);
  return sub.importKey("raw",der.key,{name:"AES-CBC"},false,["decrypt"])
    .then(function(key){return sub.decrypt({name:"AES-CBC",iv:der.iv},key,ct)})
    .then(function(ab){
      var o=JSON.parse(bytesUtf8(new Uint8Array(ab)));
      delete o._req_ts;delete o._req_salt;return o;
    });
}
function api(base,path,payload){
  return encodePayload(payload).then(function(q){
    var u=base+path+"?q="+encodeURIComponent(q);
    return fetch(u,{headers:{"User-Agent":UA,"Accept":"application/json,*/*","Referer":base+"/"}});
  }).then(function(r){if(!r.ok)throw new Error(path+" HTTP "+r.status);return r.json()})
    .then(function(j){if(!j||!j._hash)throw new Error(path+" hash missing");return decodeHash(j._hash)});
}
function qLabel(s){
  var q=clean(s&&(s.quality||s.label));
  if(/4k|2160/i.test(q))return"4K";
  var m=q.match(/(1440|1080|720|480|360)/);return m?m[1]+"p":(q||"Auto");
}
function normalizeHeaders(base,h){
  var o={"User-Agent":UA,"Referer":base+"/"};
  if(h&&typeof h==="object")Object.keys(h).forEach(function(k){o[k]=String(h[k])});
  return o;
}
function queryTarget(base,target,tmdbId,mediaType,season,episode){
  var p={
    ex_lang:false,provider:target.provider,tmdbId:String(tmdbId),imdb_id:"",
    type:mediaType==="tv"?"tv":"movie",
    season:mediaType==="tv"?Number(season||1):0,
    episode:mediaType==="tv"?Number(episode||1):0,
    method:"stream"
  };
  return api(base,"/api/sources",p).then(function(j){
    var a=j&&Array.isArray(j.sources)?j.sources:[];
    return a.map(function(s){
      var u=clean(s&&(s.url||s.file)),typ=clean(s&&s.type).toLowerCase();
      if(!/^https?:\/\//i.test(u))return null;
      if(s.isEmbed===true||typ==="embed")return null;
      if(!(typ==="m3u8"||typ==="hls"||typ==="mp4"||/\.m3u8(?:[?#]|$)|\.mp4(?:[?#]|$)/i.test(u)))return null;
      var q=qLabel(s),name="NoctraTV · Nxsha · "+target.label+" · "+q;
      return{name:name,title:name,url:u,quality:q,type:/m3u8|hls/i.test(typ+" "+u)?"hls":"mp4",
        provider:"noctra-nxsha",headers:normalizeHeaders(base,s.headers),subtitles:[]};
    }).filter(Boolean);
  }).catch(function(e){console.log("[NoctraTV/Nxsha] "+target.label+" "+base+" "+(e&&e.message?e.message:e));return[]});
}
function runBase(base,tmdbId,mediaType,season,episode){
  return Promise.all(TARGETS.map(function(t){return queryTarget(base,t,tmdbId,mediaType,season,episode)}))
    .then(function(gs){var out=[],seen={};gs.forEach(function(g){g.forEach(function(x){if(x&&!seen[x.url]){seen[x.url]=1;out.push(x)}})});return out});
}
function tryBase(i,tmdbId,mediaType,season,episode){
  if(i>=BASES.length)return Promise.resolve([]);
  return runBase(BASES[i],tmdbId,mediaType,season,episode).then(function(out){
    return out.length?out:tryBase(i+1,tmdbId,mediaType,season,episode);
  }).catch(function(){return tryBase(i+1,tmdbId,mediaType,season,episode)});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tryBase(0,tmdbId,mediaType,season,episode).then(function(out){
    console.log("[NoctraTV/Nxsha] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){console.error("[NoctraTV/Nxsha] "+(e&&e.message?e.message:e));return[]});
}
module.exports={getStreams:getStreams,encodePayload:encodePayload,decodeHash:decodeHash};

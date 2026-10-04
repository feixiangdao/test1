// NoctraTV · CinemaOS — direct providerv4 family resolver.
// TMDB -> IMDb -> double HMAC secret -> encrypted providerv4 -> PBKDF2-SHA256 -> AES-256-GCM.
// Returns every direct source reported by CinemaOS; no iframe fallback.

var BASE="https://cinemaos.live";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="54e00466a09676df57ba51c4ca30b1a6";
var HMAC1="a7f3b9c2e8d4f1a6b5c9e2d7f4a8b3c6e1d9f7a4b2c8e5d3f9a6b4c1e7d2f8a5";
var HMAC2="d3f8a5b2c9e6d1f7a4b8c5e2d9f3a6b1c7e4d8f2a9b5c3e7d4f1a8b6c2e9d5f3";
var PASSWORD="a1b2c3d4e4f6477658455678901477567890abcdef1234567890abcdef123456";
var GT="6775dc8e702c08643385273df088c14952c590ddda02d14f";
var UA="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function subtle(){try{return globalThis.crypto&&globalThis.crypto.subtle?globalThis.crypto.subtle:null}catch(_){return null}}
function enc(s){if(typeof TextEncoder!=="undefined")return new TextEncoder().encode(String(s));var x=unescape(encodeURIComponent(String(s))),a=new Uint8Array(x.length);for(var i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a}
function dec(b){if(typeof TextDecoder!=="undefined")return new TextDecoder("utf-8").decode(b);var s="";for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);try{return decodeURIComponent(escape(s))}catch(_){return s}}
function hexBytes(s){s=clean(s);var a=new Uint8Array(Math.floor(s.length/2));for(var i=0;i<a.length;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);return a}
function hex(buf){var a=new Uint8Array(buf),s="";for(var i=0;i<a.length;i++)s+=a[i].toString(16).padStart(2,"0");return s}
function concat(a,b){var o=new Uint8Array(a.length+b.length);o.set(a,0);o.set(b,a.length);return o}
function headers(){return{"Origin":BASE,"Referer":BASE+"/","User-Agent":UA,"Accept":"application/json, text/plain, */*"}}

function hmacHex(key,msg){
  var c=subtle();if(!c)return Promise.reject(new Error("WebCrypto unavailable"));
  return c.importKey("raw",enc(key),{name:"HMAC",hash:"SHA-256"},false,["sign"])
    .then(function(k){return c.sign("HMAC",k,enc(msg));}).then(hex);
}
function tmdbInfo(id,type){
  var t=type==="tv"?"tv":"movie";
  var u=TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(TMDB_KEY)+"&append_to_response=external_ids";
  return fetch(u,{headers:{"User-Agent":UA,"Accept":"application/json"}}).then(function(r){
    if(!r.ok)throw new Error("TMDB HTTP "+r.status);return r.json();
  }).then(function(d){
    var imdb=clean(d&&((d.external_ids&&d.external_ids.imdb_id)||d.imdb_id));
    if(!imdb)throw new Error("IMDb missing");
    return{imdb:imdb,type:t};
  });
}
function secret(id,imdb,type,s,e){
  var msg="tmdbId:"+id+"|imdbId:"+imdb;
  if(type==="tv")msg+="|seasonId:"+(s||1)+"|episodeId:"+(e||1);
  return hmacHex(HMAC1,msg).then(function(p){return hmacHex(HMAC2,p);});
}
function decryptPayload(data){
  var c=subtle();if(!c)return Promise.reject(new Error("WebCrypto unavailable"));
  if(!data)throw new Error("encrypted data missing");
  var ciphertext=hexBytes(data.encrypted),iv=hexBytes(data.cin),tag=hexBytes(data.mao),salt=hexBytes(data.salt);
  if(!ciphertext.length||!iv.length||!tag.length||!salt.length)throw new Error("bad encryption fields");
  return c.importKey("raw",enc(PASSWORD),{name:"PBKDF2"},false,["deriveKey"]).then(function(baseKey){
    return c.deriveKey({name:"PBKDF2",salt:salt,iterations:100000,hash:"SHA-256"},baseKey,{name:"AES-GCM",length:256},false,["decrypt"]);
  }).then(function(key){
    return c.decrypt({name:"AES-GCM",iv:iv,tagLength:128},key,concat(ciphertext,tag));
  }).then(function(buf){return JSON.parse(dec(new Uint8Array(buf)));});
}
function api(id,m,s,e,sec){
  var q=[
    "type="+encodeURIComponent(m.type),
    "tmdbId="+encodeURIComponent(String(id)),
    "imdbId="+encodeURIComponent(m.imdb)
  ];
  if(m.type==="tv"){
    q.push("seasonId="+encodeURIComponent(String(s||1)));
    q.push("episodeId="+encodeURIComponent(String(e||1)));
  }else{
    q.push("seasonId=");
    q.push("episodeId=");
  }
  q.push("t=");q.push("ry=");
  q.push("secret="+encodeURIComponent(sec));
  q.push("_gt="+encodeURIComponent(GT));
  return BASE+"/api/providerv4?"+q.join("&");
}
function qlabel(row,url){
  var q=clean(row&&(row.quality||row.resolution||row.label||row.name)),s=q+" "+url;
  if(/2160|4k/i.test(s))return"4K";var m=s.match(/(1440|1080|720|480|360)p?/i);return m?m[1]+"p":"Auto";
}
function getStreams(tmdbId,mediaType,season,episode){
  var meta;
  return tmdbInfo(tmdbId,mediaType).then(function(m){meta=m;return secret(tmdbId,m.imdb,m.type,season,episode);})
    .then(function(sec){return fetch(api(tmdbId,meta,season,episode,sec),{headers:headers()});})
    .then(function(r){if(!r.ok)throw new Error("providerv4 HTTP "+r.status);return r.json();})
    .then(function(j){return decryptPayload(j&&j.data);})
    .then(function(d){
      var src=d&&d.sources&&typeof d.sources==="object"?d.sources:{},out=[],seen={};
      Object.keys(src).forEach(function(k){
        var row=src[k];if(!row||typeof row!=="object")return;
        var u=clean(row.url||row.file||row.src);if(!/^https?:\/\//i.test(u)||seen[u])return;seen[u]=1;
        var label=clean(row.name||row.server||row.provider||k)||k,q=qlabel(row,u);
        var h={"User-Agent":UA,"Referer":BASE+"/","Origin":BASE};
        if(row.headers&&typeof row.headers==="object")Object.keys(row.headers).forEach(function(x){if(clean(row.headers[x]))h[x]=clean(row.headers[x]);});
        out.push({name:"NoctraTV · CinemaOS · "+label,title:"CinemaOS · "+label+" · "+q,url:u,quality:q,provider:"noctra-cinemaos-family",headers:h,subtitles:[],type:/\.mpd(?:\?|$)/i.test(u)?"dash":/\.mp4(?:\?|$)/i.test(u)?"mp4":"hls"});
      });
      console.log("[Noctra/CinemaOS] "+mediaType+" "+tmdbId+" streams="+out.length+" labels="+out.map(function(x){return x.name.replace("NoctraTV · CinemaOS · ","")}).join(","));
      return out;
    }).catch(function(e){console.log("[Noctra/CinemaOS] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

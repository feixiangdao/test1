// NoctraTV · Screenscape · showbox — direct encrypted API resolver.
// Current public ScreenScape web-player protocol:
// 1) POST dynamic auth route with x-screenscape-bootstrap
// 2) decrypt {d,s} envelope -> responseKey + apiToken
// 3) GET dynamic server route for each backend
// 4) decrypt streams[] and return only direct HLS/MP4/DASH URLs.
//
// No iframe fallback. CryptoJS is provided by Nuvio Mobile; Node CI uses require("crypto-js").

var BASE="https://screenscape.me";
var F="a6nG5GbtiQwFgLqRnNRvE0ZMCsHUmfm0-hQflAxzInXvfV8TI4UmIjDYZoTBSQOa";
var C0="sVFL-6633ARp-tqnK61b0OE2rwSmZYzP8df5hC7PGxOUk4TTvXd0sUWRrPZRAlOn";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var SERVERS=["showbox"];
var AUTH=null;

function cryptoJs(){
  try{if(globalThis.CryptoJS)return globalThis.CryptoJS}catch(_){}
  try{if(typeof require==="function")return require("crypto-js")}catch(_){}
  return null;
}
function clean(v){return v==null?"":String(v).trim()}
function hmacHex(msg,key){
  var C=cryptoJs(); if(!C)throw new Error("CryptoJS unavailable");
  return C.HmacSHA256(String(msg),String(key)).toString(C.enc.Hex);
}
function sha256Hex(s){
  var C=cryptoJs(); if(!C)throw new Error("CryptoJS unavailable");
  return C.SHA256(String(s)).toString(C.enc.Hex);
}
function b64urlUtf8(s){
  var C=cryptoJs(); if(!C)throw new Error("CryptoJS unavailable");
  return C.enc.Base64.stringify(C.enc.Utf8.parse(String(s)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64ToUtf8(s){
  var C=cryptoJs(); if(!C)throw new Error("CryptoJS unavailable");
  return C.enc.Base64.parse(String(s)).toString(C.enc.Utf8);
}
function xorStr(s,k){
  var out="";
  for(var i=0;i<s.length;i++)out+=String.fromCharCode(s.charCodeAt(i)^k.charCodeAt(i%k.length));
  return out;
}
function nonce(){
  var out="";
  for(var i=0;i<18;i++)out+="0123456789abcdef".charAt(Math.floor(Math.random()*16));
  return out;
}
function tokenRoute(bootstrap){
  var x="token."+Date.now().toString(36)+"."+nonce();
  return b64urlUtf8(x)+"."+hmacHex(x,bootstrap).slice(0,24);
}
function serverRoute(responseKey){
  var x=JSON.stringify({k:"route",v:"server",t:Date.now(),n:nonce()});
  return b64urlUtf8(x)+"."+hmacHex(x,responseKey).slice(0,24);
}
function serverReq(server,responseKey){
  var x=server+"."+Date.now().toString(36)+"."+nonce();
  return b64urlUtf8(x)+"."+hmacHex(x,responseKey).slice(0,24);
}
function tmdbReq(tmdbId,season,episode,responseKey){
  var o={k:"tmdb",t:Date.now(),n:nonce(),tmdbId:String(tmdbId),season:season,episode:episode};
  var x=JSON.stringify(o);
  return b64urlUtf8(x)+"."+hmacHex(x,responseKey).slice(0,24);
}
function contextFor(url,method){
  try{
    var u=new URL(url), pairs=[];
    u.searchParams.forEach(function(v,k){pairs.push([k,v])});
    pairs.sort(function(a,b){return a[0]===b[0]?(a[1]<b[1]?-1:a[1]>b[1]?1:0):(a[0]<b[0]?-1:1)});
    var q=pairs.map(function(p){return encodeURIComponent(p[0])+"="+encodeURIComponent(p[1])}).join("&");
    return method+":"+u.pathname+"?"+q;
  }catch(_){
    var qidx=url.indexOf("?"), path=url.replace(/^https?:\/\/[^/]+/i,"");
    var pathOnly=qidx>=0?path.slice(0,path.indexOf("?")):path;
    var qs=qidx>=0?url.slice(qidx+1):"";
    return method+":"+pathOnly+"?"+qs;
  }
}
function decryptEnvelope(env,key,context){
  var C=cryptoJs(); if(!C)throw new Error("CryptoJS unavailable");
  if(!env||!env.d||!env.s)return null;
  var a=sha256Hex(String(key)+"|"+String(context)+"|"+F);
  if(hmacHex(env.d,a)!==String(env.s))return null;
  var first=b64ToUtf8(env.d), idx=first.indexOf(":");
  if(idx<0)return null;
  var h=first.slice(0,idx), l=first.slice(idx+1);
  var u=a.slice(0,18);
  var p=sha256Hex(C0+":"+h+":"+a).slice(0,14);
  var v=xorStr(l,p);
  var w=xorStr(v.split("").reverse().join(""),u);
  var opensslB64=b64ToUtf8(w);
  var plain=C.AES.decrypt(opensslB64,a).toString(C.enc.Utf8);
  if(!plain)return null;
  return JSON.parse(plain);
}
function apiHeaders(extra){
  var h={
    "User-Agent":UA,
    "Accept":"*/*",
    "Origin":BASE,
    "Referer":BASE+"/",
    "x-screenscape-client":"web-player",
    "sec-fetch-site":"same-origin",
    "sec-fetch-mode":"cors",
    "sec-fetch-dest":"empty",
    "content-type":"text/plain;charset=UTF-8"
  };
  if(extra)Object.keys(extra).forEach(function(k){h[k]=extra[k]});
  return h;
}
function ensureAuth(){
  if(AUTH&&AUTH.exp>Date.now()+60000)return Promise.resolve(AUTH);
  var bootstrap="";
  for(var i=0;i<48;i++)bootstrap+="0123456789abcdef".charAt(Math.floor(Math.random()*16));
  var route=tokenRoute(bootstrap);
  var url=BASE+"/api/"+route;
  return fetch(url,{method:"POST",headers:apiHeaders({"x-screenscape-bootstrap":bootstrap}),body:""})
    .then(function(r){if(!r.ok)throw new Error("auth HTTP "+r.status);return r.json()})
    .then(function(j){
      var pt=decryptEnvelope(j,bootstrap,"POST:/api/"+route+"?");
      if(!pt||!pt.responseKey||!pt.apiToken)throw new Error("auth decrypt failed");
      AUTH={responseKey:pt.responseKey,apiToken:pt.apiToken,exp:Date.now()+27*60*1000};
      return AUTH;
    });
}
function fetchServer(auth,server,tmdbId,season,episode){
  var key=auth.responseKey;
  var l=serverRoute(key), n=serverReq(server,key), q=tmdbReq(tmdbId,season,episode,key);
  var url=BASE+"/api/"+l+"/"+n+"?q="+encodeURIComponent(q);
  return fetch(url,{headers:apiHeaders({"x-api-token":auth.apiToken})})
    .then(function(r){if(!r.ok)throw new Error(server+" HTTP "+r.status);return r.json()})
    .then(function(j){
      var pt=decryptEnvelope(j,key,contextFor(url,"GET"));
      var streams=pt&&Array.isArray(pt.streams)?pt.streams:[];
      return streams.map(function(s){
        if(!s||s.downloadOnly===true)return null;
        var u=clean(s.url||s.file), typ=clean(s.type).toLowerCase();
        if(!/^https?:\/\//i.test(u)||typ==="embed"||s.isEmbed===true)return null;
        var isHls=typ==="hls"||typ==="m3u8"||/\.m3u8(?:[?#]|$)/i.test(u);
        var isDash=typ==="dash"||typ==="mpd"||/\.mpd(?:[?#]|$)/i.test(u);
        var isMp4=typ==="mp4"||/\.mp4(?:[?#]|$)/i.test(u);
        if(!isHls&&!isDash&&!isMp4)return null;
        var ql=clean(s.quality||s.label||s.name||"Auto");
        var name="NoctraTV · Screenscape · "+server+" · "+ql;
        var headers={"User-Agent":UA,"Referer":BASE+"/"};
        if(s.headers&&typeof s.headers==="object")Object.keys(s.headers).forEach(function(k){headers[k]=String(s.headers[k])});
        return {name:name,title:name,url:u,quality:ql,type:isHls?"hls":isDash?"dash":"mp4",provider:"noctra-screenscape-showbox",headers:headers,subtitles:[]};
      }).filter(Boolean);
    }).catch(function(e){
      console.log("[NoctraTV/Screenscape/showbox] "+server+" "+(e&&e.message?e.message:e));
      return[];
    });
}
function dedupe(groups){
  var out=[],seen={};
  groups.forEach(function(g){(g||[]).forEach(function(x){if(x&&!seen[x.url]){seen[x.url]=1;out.push(x)}})});
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var s=mediaType==="tv"?Number(season):null;
  var e=mediaType==="tv"?Number(episode):null;
  return ensureAuth().then(function(auth){
    return Promise.all(SERVERS.map(function(server){return fetchServer(auth,server,tmdbId,s,e)}));
  }).then(function(groups){
    var out=dedupe(groups);
    console.log("[NoctraTV/Screenscape/showbox] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.error("[NoctraTV/Screenscape/showbox] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams,decryptEnvelope:decryptEnvelope};

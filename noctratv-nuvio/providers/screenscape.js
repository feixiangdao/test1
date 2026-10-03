// NoctraTV · ScreenScape — direct encrypted-API resolver.
// Source family seen in noctratv.com MPlayer. No iframe is returned.
//
// Current ScreenScape API flow:
// 1) POST /api/<signed token route> with x-screenscape-bootstrap
// 2) decrypt auth envelope -> responseKey + apiToken
// 3) GET /api/<signed route>/<signed server>?q=<signed TMDB request>
// 4) decrypt streams[] and return only direct HTTP media URLs.
//
// CryptoJS-compatible primitives are provided by Nuvio Mobile.

var BASE="https://screenscape.me";
var F="a6nG5GbtiQwFgLqRnNRvE0ZMCsHUmfm0-hQflAxzInXvfV8TI4UmIjDYZoTBSQOa";
var CONST_C="sVFL-6633ARp-tqnK61b0OE2rwSmZYzP8df5hC7PGxOUk4TTvXd0sUWRrPZRAlOn";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var SERVERS=["streamflix","castel","hdhub","moviebox","nitro","fun","blast","awsind","vaplayer","kdh"];
var AUTH=null;

function cryptoJs(){
  try{if(globalThis.CryptoJS)return globalThis.CryptoJS}catch(_){}
  try{if(typeof require==="function")return require("crypto-js")}catch(_){}
  return null;
}
function hexNonce(n){
  var s="",h="0123456789abcdef";
  for(var i=0;i<n;i++)s+=h.charAt(Math.floor(Math.random()*16));
  return s;
}
function b64urlUtf8(s){
  var C=cryptoJs();
  if(!C)throw new Error("CryptoJS unavailable");
  return C.enc.Base64.stringify(C.enc.Utf8.parse(String(s)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function sha256Hex(s){
  var C=cryptoJs();
  if(!C)throw new Error("CryptoJS unavailable");
  return C.SHA256(String(s)).toString(C.enc.Hex);
}
function hmacHex(msg,key){
  var C=cryptoJs();
  if(!C)throw new Error("CryptoJS unavailable");
  return C.HmacSHA256(String(msg),String(key)).toString(C.enc.Hex);
}
function xorStr(s,k){
  var out="";
  for(var i=0;i<s.length;i++)out+=String.fromCharCode(s.charCodeAt(i)^k.charCodeAt(i%k.length));
  return out;
}
function base36(n){return Math.floor(n).toString(36)}
function tokenRoute(bootstrap){
  var x="token."+base36(Date.now())+"."+hexNonce(18);
  return b64urlUtf8(x)+"."+hmacHex(x,bootstrap).slice(0,24);
}
function serverRoute(key){
  var x=JSON.stringify({k:"route",v:"server",t:Date.now(),n:hexNonce(18)});
  return b64urlUtf8(x)+"."+hmacHex(x,key).slice(0,24);
}
function serverReq(server,key){
  var x=server+"."+base36(Date.now())+"."+hexNonce(18);
  return b64urlUtf8(x)+"."+hmacHex(x,key).slice(0,24);
}
function tmdbReq(tmdbId,season,episode,key){
  var x=JSON.stringify({
    k:"tmdb",t:Date.now(),n:hexNonce(18),tmdbId:String(tmdbId),
    season:season==null?null:Number(season),
    episode:episode==null?null:Number(episode)
  });
  return b64urlUtf8(x)+"."+hmacHex(x,key).slice(0,24);
}
function wordArraySlice(wa,startBytes,endBytes){
  var C=cryptoJs();
  var hex=wa.toString(C.enc.Hex);
  var a=startBytes*2;
  var b=endBytes==null?hex.length:endBytes*2;
  return C.enc.Hex.parse(hex.slice(a,b));
}
function concatWA(){
  var C=cryptoJs();
  var out=C.lib.WordArray.create();
  for(var i=0;i<arguments.length;i++)out.concat(arguments[i]);
  return out;
}
function evpBytesToKey(password,salt){
  var C=cryptoJs();
  var pass=C.enc.Utf8.parse(String(password));
  var out=C.lib.WordArray.create();
  var prev=null;
  while(out.sigBytes<48){
    var input=C.lib.WordArray.create();
    if(prev)input.concat(prev);
    input.concat(pass);
    input.concat(salt);
    prev=C.MD5(input);
    out.concat(prev);
  }
  return {
    key:wordArraySlice(out,0,32),
    iv:wordArraySlice(out,32,48)
  };
}
function decryptEnvelope(env,key,context){
  var C=cryptoJs();
  if(!C)throw new Error("CryptoJS unavailable");
  if(!env||!env.d||!env.s)return null;
  var a=sha256Hex(String(key)+"|"+String(context)+"|"+F);
  if(hmacHex(String(env.d),a)!==String(env.s))return null;

  var packed=C.enc.Utf8.stringify(C.enc.Base64.parse(String(env.d)));
  var pos=packed.indexOf(":");
  if(pos<0)return null;
  var h=packed.slice(0,pos),l=packed.slice(pos+1);
  var u=a.slice(0,18);
  var p=sha256Hex(CONST_C+":"+h+":"+a).slice(0,14);
  var v=xorStr(l,p);
  var w=xorStr(v.split("").reverse().join(""),u);

  var opensslB64=C.enc.Utf8.stringify(C.enc.Base64.parse(w));
  var bin=C.enc.Base64.parse(opensslB64);
  if(bin.sigBytes<17)return null;
  var prefix=wordArraySlice(bin,0,8).toString(C.enc.Utf8);
  if(prefix!=="Salted__")return null;
  var salt=wordArraySlice(bin,8,16);
  var ct=wordArraySlice(bin,16,null);
  var kiv=evpBytesToKey(a,salt);
  var pt=C.AES.decrypt(
    C.lib.CipherParams.create({ciphertext:ct}),
    kiv.key,
    {iv:kiv.iv,mode:C.mode.CBC,padding:C.pad.Pkcs7}
  );
  var json=C.enc.Utf8.stringify(pt);
  return json?JSON.parse(json):null;
}
function headers(extra){
  var h={
    "User-Agent":UA,
    "Accept":"*/*",
    "Accept-Language":"en-US,en;q=0.9",
    "x-screenscape-client":"web-player",
    "Referer":BASE+"/",
    "Origin":BASE,
    "sec-fetch-site":"same-origin",
    "sec-fetch-mode":"cors",
    "sec-fetch-dest":"empty",
    "content-type":"text/plain;charset=UTF-8"
  };
  Object.keys(extra||{}).forEach(function(k){h[k]=extra[k]});
  return h;
}
function withTimeout(p,ms){
  if(typeof setTimeout!=="function")return p;
  return Promise.race([
    p,
    new Promise(function(_,rej){setTimeout(function(){rej(new Error("timeout"))},ms)})
  ]);
}
function ensureAuth(){
  if(AUTH&&AUTH.exp>Date.now()+60000)return Promise.resolve(AUTH);
  var bootstrap=hexNonce(48);
  var route=tokenRoute(bootstrap);
  var url=BASE+"/api/"+route;
  return withTimeout(fetch(url,{
    method:"POST",
    headers:headers({"x-screenscape-bootstrap":bootstrap}),
    body:""
  }),12000).then(function(r){
    if(!r.ok)throw new Error("auth HTTP "+r.status);
    return r.json();
  }).then(function(env){
    var pt=decryptEnvelope(env,bootstrap,"POST:/api/"+route+"?");
    if(!pt||!pt.responseKey||!pt.apiToken)throw new Error("auth decrypt failed");
    AUTH={responseKey:pt.responseKey,apiToken:pt.apiToken,exp:Date.now()+25*60*1000};
    return AUTH;
  });
}
function fetchServer(auth,server,tmdbId,season,episode){
  var key=auth.responseKey;
  var route=serverRoute(key);
  var sreq=serverReq(server,key);
  var q=tmdbReq(tmdbId,season,episode,key);
  var url=BASE+"/api/"+route+"/"+sreq+"?q="+encodeURIComponent(q);
  var context="GET:/api/"+route+"/"+sreq+"?q="+encodeURIComponent(q);
  return withTimeout(fetch(url,{
    headers:headers({"x-api-token":auth.apiToken})
  }),10000).then(function(r){
    if(!r.ok)return [];
    return r.json();
  }).then(function(env){
    if(!env)return [];
    var pt=decryptEnvelope(env,key,context);
    var rows=pt&&pt.streams;
    return Array.isArray(rows)?rows:[];
  }).catch(function(e){
    console.log("[NoctraTV/ScreenScape] "+server+" "+(e&&e.message?e.message:e));
    return [];
  });
}
function qualityFrom(raw){
  var s=String(raw||"");
  var m=s.match(/(2160|1440|1080|720|480|360)\s*p?/i);
  if(m)return m[1]+"p";
  if(/4k/i.test(s))return "2160p";
  return "Auto";
}
function mapStreams(server,rows){
  var out=[];
  (rows||[]).forEach(function(st){
    if(!st||st.downloadOnly)return;
    var url=st.url||"";
    if(!/^https?:\/\//i.test(url))return;
    var hs=st.headers||{};
    if(!hs.Referer&&!hs.referer)hs.Referer=BASE+"/";
    if(!hs["User-Agent"])hs["User-Agent"]=UA;
    var label=st.name||st.title||server;
    out.push({
      name:"NoctraTV · ScreenScape",
      title:"ScreenScape · "+server+" · "+label,
      url:url,
      quality:qualityFrom(label+" "+url),
      provider:"noctra-screenscape",
      headers:hs,
      subtitles:Array.isArray(st.subtitles)?st.subtitles:[]
    });
  });
  return out;
}
function dedupe(rows){
  var seen={},out=[];
  (rows||[]).forEach(function(x){
    if(!x||!x.url||seen[x.url])return;
    seen[x.url]=1;out.push(x);
  });
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  var isTv=mediaType==="tv";
  var s=isTv?(season==null?1:Number(season)):null;
  var e=isTv?(episode==null?1:Number(episode)):null;
  console.log("[NoctraTV/ScreenScape] "+mediaType+" "+tmdbId);
  return ensureAuth().then(function(auth){
    return Promise.all(SERVERS.map(function(server){
      return fetchServer(auth,server,tmdbId,s,e).then(function(rows){
        return mapStreams(server,rows);
      });
    }));
  }).then(function(groups){
    var all=[];
    groups.forEach(function(g){all=all.concat(g||[])});
    all=dedupe(all);
    console.log("[NoctraTV/ScreenScape] streams="+all.length);
    return all;
  }).catch(function(e){
    console.error("[NoctraTV/ScreenScape] "+(e&&e.message?e.message:e));
    return [];
  });
}

module.exports={getStreams:getStreams};

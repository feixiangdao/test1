// NoctraTV · ZStream · Aphrodite
// Signed direct HLS resolver derived from the current public ZStream/Atlantic Aphrodite protocol.
// Nuvio Local uses its native WebCrypto bridge: SHA-256 + HMAC-SHA256 + AES-256-GCM.
// No iframe and no unsigned fallback: if the gate rotates/fails, return 0 rather than a decoy/wrong title.

var CDN="https://cdn.hls.lol";
var ORIGIN="https://atlantic.st";
var REFERER=ORIGIN+"/";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
var VERSION="aphrodite.a.v1";
var SEED_HEX="452c1208202e241c084e870ad3dffbe033c45f0e398befa3681862c84da6af19";
var BOOTSTRAP=CDN+"/content/index";
var session=null;
var sessionInflight=null;

function clean(v){return v==null?"":String(v).trim();}
function bytesToHex(a){
  a=a instanceof Uint8Array?a:new Uint8Array(a||0);
  var s="";
  for(var i=0;i<a.length;i++)s+=a[i].toString(16).padStart(2,"0");
  return s;
}
function hexToBytes(s){
  s=clean(s).replace(/\s+/g,"");
  if(s.length%2)throw new Error("bad hex");
  var a=new Uint8Array(s.length/2);
  for(var i=0;i<a.length;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);
  return a;
}
function utf8(s){return new TextEncoder().encode(String(s));}
function concat(a,b){
  a=a instanceof Uint8Array?a:new Uint8Array(a);
  b=b instanceof Uint8Array?b:new Uint8Array(b);
  var o=new Uint8Array(a.length+b.length);o.set(a,0);o.set(b,a.length);return o;
}
function baseHeaders(extra){
  var h={
    "User-Agent":UA,
    "Origin":ORIGIN,
    "Referer":REFERER,
    "Accept":"*/*",
    "Accept-Language":"en-US,en;q=0.9",
    "Sec-Fetch-Dest":"empty",
    "Sec-Fetch-Mode":"cors",
    "Sec-Fetch-Site":"cross-site"
  };
  if(extra)Object.keys(extra).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function digestSha256(bytes){
  return globalThis.crypto.subtle.digest("SHA-256",bytes).then(function(x){return new Uint8Array(x);});
}
function importHmac(raw){
  return globalThis.crypto.subtle.importKey(
    "raw",raw,{name:"HMAC",hash:{name:"SHA-256"}},false,["sign"]
  );
}
function hmacHex(raw,msg){
  return importHmac(raw).then(function(k){
    return globalThis.crypto.subtle.sign("HMAC",k,utf8(msg));
  }).then(function(sig){return bytesToHex(new Uint8Array(sig));});
}
function aesGcmDecrypt(rawKey,blob){
  if(blob.length<29)return Promise.reject(new Error("gate payload too short"));
  var iv=blob.subarray(0,12);
  var ctTag=blob.subarray(12);
  return globalThis.crypto.subtle.importKey("raw",rawKey,{name:"AES-GCM"},false,["decrypt"])
    .then(function(k){
      return globalThis.crypto.subtle.decrypt({name:"AES-GCM",iv:iv,tagLength:128},k,ctTag);
    }).then(function(x){return new Uint8Array(x);});
}
function randomHex(n){
  var a=new Uint8Array(n);globalThis.crypto.getRandomValues(a);return bytesToHex(a);
}
function masterKey(){
  return digestSha256(concat(utf8(VERSION),hexToBytes(SEED_HEX)));
}
function bootstrap(){
  var ts=Math.floor(Date.now()/1000),nonce=randomHex(8);
  return masterKey().then(function(mk){
    return hmacHex(mk,"a|"+ts+"|"+nonce).then(function(sig){
      return fetch(BOOTSTRAP,{
        method:"POST",
        headers:baseHeaders({"Content-Type":"application/json"}),
        body:JSON.stringify({c:"a",ts:ts,n:nonce,s:sig})
      }).then(function(r){
        if(!r.ok)throw new Error("bootstrap HTTP "+r.status);
        return r.json();
      }).then(function(j){
        if(!j||!j.d)throw new Error("bootstrap payload missing");
        return aesGcmDecrypt(mk,hexToBytes(j.d));
      }).then(function(plain){
        var obj=JSON.parse(new TextDecoder("utf-8").decode(plain));
        if(!obj||!obj.sid||!obj.skey)throw new Error("session fields missing");
        var sk=hexToBytes(obj.skey);
        if(sk.length!==32)throw new Error("bad session key");
        return{sid:String(obj.sid),skey:sk,exp:Number(obj.exp)||0};
      });
    });
  });
}
function getSession(){
  var now=Math.floor(Date.now()/1000);
  if(session&&session.skey&&session.exp-now>60)return Promise.resolve(session);
  if(sessionInflight)return sessionInflight;
  sessionInflight=bootstrap().then(function(s){session=s;return s;})
    .finally(function(){sessionInflight=null;});
  return sessionInflight;
}
function signedHeaders(sess,path){
  var ts=Math.floor(Date.now()/1000),nonce=randomHex(8);
  return hmacHex(sess.skey,sess.sid+"|"+path+"|"+ts+"|"+nonce).then(function(sig){
    return baseHeaders({
      "X-A-Sid":sess.sid,
      "X-A-Ts":String(ts),
      "X-A-Nonce":nonce,
      "X-A-Sig":sig
    });
  });
}
function signedGet(path,attempt){
  attempt=attempt||0;
  return getSession().then(function(sess){
    return signedHeaders(sess,path).then(function(h){
      return fetch(CDN+path,{headers:h});
    });
  }).then(function(r){
    if((r.status===401||r.status===403)&&attempt<1){
      session=null;
      return signedGet(path,attempt+1);
    }
    if(!r.ok)throw new Error("content HTTP "+r.status);
    return r.json();
  }).then(function(j){
    if(j&&j.renew===true&&attempt<1){
      session=null;
      return signedGet(path,attempt+1);
    }
    return j;
  });
}
function maxQuality(text){
  var m,max=0,re=/RESOLUTION=\d+x(\d+)/ig,s=String(text||"");
  while((m=re.exec(s))!==null){var h=parseInt(m[1],10)||0;if(h>max)max=h;}
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}
function verifyHls(url){
  if(!/^https?:\/\//i.test(clean(url)))return Promise.resolve(null);
  return fetch(url,{headers:baseHeaders()}).then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    var q=maxQuality(body);
    return{url:url,quality:q};
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var path=mediaType==="tv"
    ?"/content/tv/"+encodeURIComponent(String(tmdbId))+"/"+Number(season||1)+"/"+Number(episode||1)
    :"/content/movie/"+encodeURIComponent(String(tmdbId));
  return signedGet(path,0).then(function(j){
    if(!j||j.found!==true)return[];
    var u=clean(j.hls||j.url);
    if(!/^https?:\/\//i.test(u))return[];
    return verifyHls(u).then(function(v){
      if(!v)return[];
      var name="NoctraTV · ZStream · Aphrodite · "+v.quality;
      return [{
        name:name,
        title:name,
        url:v.url,
        quality:v.quality,
        type:"hls",
        provider:"noctra-zstream-aphrodite",
        headers:baseHeaders(),
        subtitles:[]
      }];
    });
  }).then(function(out){
    console.log("[Noctra/ZStream/Aphrodite] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/ZStream/Aphrodite] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

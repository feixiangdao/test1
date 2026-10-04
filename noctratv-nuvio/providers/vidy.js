// NoctraTV · Vidy
// Current stellar.gdn direct resolver: PoW challenge -> AES-256-GCM request -> direct HLS.
// Uses Nuvio Mobile's native WebCrypto bridge. No iframe/WebAssembly fallback.

var SITE="https://stellar.gdn";
var API="https://api.stellar.gdn";
var SEED="iwTL6oi-9LLc3M4a1jcQV6jciugKj1_z6dYhdSbbtlg:";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function utf8(s){return new TextEncoder().encode(String(s));}
function bytesToHex(a){
  a=a instanceof Uint8Array?a:new Uint8Array(a||0);
  var s="";for(var i=0;i<a.length;i++)s+=a[i].toString(16).padStart(2,"0");return s;
}
function bytesToB64(a){
  a=a instanceof Uint8Array?a:new Uint8Array(a||0);
  var s="";for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s);
}
function headers(extra){
  var h={"User-Agent":UA,"Origin":SITE,"Referer":SITE+"/","Accept":"application/json,text/plain,*/*"};
  if(extra)Object.keys(extra).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function sha256Bytes(data){
  return globalThis.crypto.subtle.digest("SHA-256",data).then(function(x){return new Uint8Array(x);});
}
function sha256HexString(s){
  return sha256Bytes(utf8(s)).then(bytesToHex);
}
function cryptoJs(){
  try{if(globalThis.CryptoJS)return globalThis.CryptoJS;}catch(_){}
  try{if(typeof require==="function")return require("crypto-js");}catch(_){}
  return null;
}
function solvePoW(challenge,difficulty){
  var target="";
  for(var i=0;i<Number(difficulty||0);i++)target+="0";
  var C=cryptoJs(),limit=5000000;
  if(C&&C.SHA256&&C.enc&&C.enc.Hex){
    for(var n=0;n<=limit;n++){
      var h=C.SHA256(challenge+String(n)).toString(C.enc.Hex);
      if(h.indexOf(target)===0)return Promise.resolve(String(n));
    }
    return Promise.reject(new Error("PoW timed out"));
  }
  var x=0;
  function batch(){
    var end=Math.min(x+256,limit+1),jobs=[];
    for(;x<end;x++){
      (function(v){jobs.push(sha256HexString(challenge+String(v)).then(function(h){return h.indexOf(target)===0?String(v):null;}));})(x);
    }
    return Promise.all(jobs).then(function(rows){
      for(var j=0;j<rows.length;j++)if(rows[j]!=null)return rows[j];
      if(x>limit)throw new Error("PoW timed out");
      return batch();
    });
  }
  return batch();
}
function todayUtc(){return new Date().toISOString().slice(0,10);}
function encryptPayload(data){
  var d=todayUtc();
  return sha256Bytes(utf8(SEED+d)).then(function(keyRaw){
    var iv=new Uint8Array(12);globalThis.crypto.getRandomValues(iv);
    return globalThis.crypto.subtle.importKey("raw",keyRaw,{name:"AES-GCM"},false,["encrypt"]).then(function(key){
      return globalThis.crypto.subtle.encrypt({name:"AES-GCM",iv:iv,tagLength:128},key,utf8(JSON.stringify(data))).then(function(buf){
        var all=new Uint8Array(buf);
        if(all.length<17)throw new Error("AES-GCM output too short");
        var ct=all.subarray(0,all.length-16),tag=all.subarray(all.length-16);
        return{q:bytesToB64(ct),s:bytesToB64(iv),t:bytesToB64(tag),d:d};
      });
    });
  });
}
function challenge(){
  return fetch(API+"/api/challenge",{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error("Challenge HTTP "+r.status);
    return r.json();
  });
}
function resolveOne(mediaType,id,season,episode,source){
  return challenge().then(function(ch){
    if(!ch||!ch.challenge)throw new Error("challenge missing");
    return solvePoW(String(ch.challenge),Number(ch.difficulty||4)).then(function(nonce){
      var p={mediaType:mediaType,id:Number(id),challenge:String(ch.challenge),nonce:nonce};
      if(mediaType==="tv"){p.season=Number(season||1);p.episode=Number(episode||1);}
      if(source)p.source=source;
      return encryptPayload(p);
    });
  }).then(function(enc){
    return fetch(API+"/api/resolve",{
      method:"POST",
      headers:headers({"Content-Type":"application/json"}),
      body:JSON.stringify(enc)
    });
  }).then(function(r){
    if(!r.ok)throw new Error("Resolve HTTP "+r.status);
    return r.json();
  });
}
function quality(text){
  var s=String(text||""),m,max=0,re=/RESOLUTION=\d+x(\d+)/ig;
  while((m=re.exec(s))!==null){var h=parseInt(m[1],10)||0;if(h>max)max=h;}
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}
function verify(url,source){
  if(!/^https?:\/\//i.test(clean(url)))return Promise.resolve(null);
  var h=headers();
  return fetch(url,{headers:h}).then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    var q=quality(body);
    var label=clean(source)||"Default";
    var name="NoctraTV · Vidy · "+label+" · "+q;
    return{name:name,title:name,url:url,quality:q,type:"hls",provider:"noctra-vidy",headers:h,subtitles:[]};
  });
}
function verifyResolved(r){
  if(!r||!r.url)return Promise.resolve(null);
  return verify(r.url,r.source).catch(function(e){
    console.log("[Noctra/Vidy] "+(r.source||"default")+" "+(e&&e.message?e.message:e));
    return null;
  });
}
var VIDY_SOURCES=["Miami","Boise","Orlando","Atlanta","Tampa","Portland"];
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var mt=mediaType==="tv"?"tv":"movie";
  return resolveOne(mt,tmdbId,season,episode,null).then(function(first){
    var avail=first&&Array.isArray(first.availableSources)?first.availableSources.slice():[];
    if(first&&first.source&&avail.indexOf(first.source)<0)avail.unshift(first.source);
    var allowed=VIDY_SOURCES.filter(function(s){return avail.indexOf(s)>=0;});
    var out=[],i=0;
    function next(){
      if(i>=allowed.length)return Promise.resolve(out);
      var src=allowed[i++];
      return resolveOne(mt,tmdbId,season,episode,src).then(verifyResolved).then(function(v){
        if(v)out.push(v);
        return next();
      }).catch(function(e){
        console.log("[Noctra/Vidy] "+src+" "+(e&&e.message?e.message:e));
        return next();
      });
    }
    return next();
  }).then(function(out){
    console.log("[Noctra/Vidy] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/Vidy] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

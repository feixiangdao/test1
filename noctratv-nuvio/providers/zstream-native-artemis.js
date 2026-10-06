// NoctraTV research · ZStream Native · Artemis
// Reconstructed from current ZStreamNativeSources ArtemisKeylessNative.
// Research-only until NoctraTV Apollo/Vienna/Chase alias mapping is proven.
// Direct protocol: signed /android query -> AES-GCM encrypted response -> HLS variants.

var HOST="https://artemis.fontaine.lol";
var ORIGIN="https://zstream.mov";
var REFERER="https://zstream.mov/";
var UA="ZStreamAndroid/1.7.1 (Android 14; Pixel 8)";

var KEY_PS="34871e7b1342c323ef4476ac595e3d28fd679caa7701faaf53302604531eaa9b";
var KEY_PK="3bb5f202110c75f770d20a121382cb8a987084b164d556b4392609b9452185dc";
var KEY_Z ="7ec93a466bca3abcd064e332b853eba5ff09848e5c432b2ee3fae76ed4d81a4e";
var KEY_AR="645eb11e3d82c9fc0b700ca3a32c2531d67a919f48f3f37374789ff33e41a63c";
var KEY_RESP="b9f74f0d4cb6e19e4101a132f3b09a468d680119bb4bf7b4781d3b9aad09f59b";

function clean(v){return v==null?"":String(v).trim();}
function hexToBytes(s){
  s=clean(s);if(s.length%2)throw new Error("bad hex");
  var a=new Uint8Array(s.length/2);
  for(var i=0;i<a.length;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);
  return a;
}
function bytesToHex(a){
  a=a instanceof Uint8Array?a:new Uint8Array(a||0);
  var s="";for(var i=0;i<a.length;i++)s+=a[i].toString(16).padStart(2,"0");return s;
}
function utf8(s){return new TextEncoder().encode(String(s));}
function concat(a,b){
  a=a instanceof Uint8Array?a:new Uint8Array(a);
  b=b instanceof Uint8Array?b:new Uint8Array(b);
  var o=new Uint8Array(a.length+b.length);o.set(a,0);o.set(b,a.length);return o;
}
function randomBytes(n){
  var a=new Uint8Array(n);globalThis.crypto.getRandomValues(a);return a;
}
function hmacHex(keyHex,msg){
  return globalThis.crypto.subtle.importKey(
    "raw",hexToBytes(keyHex),{name:"HMAC",hash:{name:"SHA-256"}},false,["sign"]
  ).then(function(k){
    return globalThis.crypto.subtle.sign("HMAC",k,utf8(msg));
  }).then(function(sig){return bytesToHex(new Uint8Array(sig));});
}
function aesGcmEncryptHex(keyHex,plain){
  var iv=randomBytes(12);
  return globalThis.crypto.subtle.importKey(
    "raw",hexToBytes(keyHex),{name:"AES-GCM"},false,["encrypt"]
  ).then(function(k){
    return globalThis.crypto.subtle.encrypt(
      {name:"AES-GCM",iv:iv,tagLength:128},k,utf8(plain)
    );
  }).then(function(buf){
    return bytesToHex(concat(iv,new Uint8Array(buf)));
  });
}
function aesGcmDecryptHex(keyHex,hex){
  var blob=hexToBytes(hex);
  if(blob.length<29)throw new Error("encrypted response too short");
  var iv=blob.slice(0,12),ctTag=blob.slice(12);
  return globalThis.crypto.subtle.importKey(
    "raw",hexToBytes(keyHex),{name:"AES-GCM"},false,["decrypt"]
  ).then(function(k){
    return globalThis.crypto.subtle.decrypt(
      {name:"AES-GCM",iv:iv,tagLength:128},k,ctTag
    );
  }).then(function(buf){return new TextDecoder("utf-8").decode(new Uint8Array(buf));});
}
function pct(s){return encodeURIComponent(String(s)).replace(/[!'()*]/g,function(c){return"%"+c.charCodeAt(0).toString(16).toUpperCase();});}
function canonical(params){
  return Object.keys(params).sort().map(function(k){return pct(k)+"="+pct(params[k]);}).join("&");
}
function timeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false,t=setTimeout(function(){if(done)return;done=true;reject(new Error(label+" timeout"));},ms);
    Promise.resolve(p).then(function(v){if(done)return;done=true;clearTimeout(t);resolve(v);},function(e){if(done)return;done=true;clearTimeout(t);reject(e);});
  });
}
function headers(ps,ar){
  return{
    "User-Agent":UA,
    "Origin":ORIGIN,
    "Referer":REFERER,
    "Accept":"application/json,text/plain,*/*",
    "X-PS-Sig":ps,
    "X-AR-Sig":ar
  };
}
function makeRequest(tmdbId,mediaType,season,episode){
  var t=Math.floor(Date.now()/1000);
  var bucket=Math.floor(t/90);
  var sid=mediaType==="tv"?String(season||1):"";
  var eid=mediaType==="tv"?String(episode||1):"";
  var psMsg=String(tmdbId)+"|"+sid+"|"+eid+"|"+bucket;
  var nonce=bytesToHex(randomBytes(16));
  var pkPlain=JSON.stringify({t:String(tmdbId),x:t,n:nonce});
  return Promise.all([
    hmacHex(KEY_PS,psMsg),
    aesGcmEncryptHex(KEY_PK,pkPlain),
    hmacHex(KEY_Z,String(tmdbId)+":"+bucket)
  ]).then(function(v){
    var params={tmdbId:String(tmdbId),_pk:v[1],z:v[2].slice(0,10)};
    if(mediaType==="tv"){params.seasonId=sid;params.episodeId=eid;}
    var qs=canonical(params);
    return hmacHex(KEY_AR,qs).then(function(ar){
      return{url:HOST+"/android?"+qs,headers:headers(v[0],ar)};
    });
  });
}
function parseVariants(obj){
  var rows=[];
  var variants=Array.isArray(obj&&obj.variants)?obj.variants:[];
  variants.forEach(function(v){
    if(!v)return;
    var u=clean(v.url||v.file||v.src);
    if(!/^https?:\/\//i.test(u))return;
    rows.push({
      url:u,
      quality:clean(v.quality_t||v.quality||v.name||v.tag)||"Auto",
      codec:clean(v.codec),
      tag:clean(v.tag)
    });
  });
  if(!rows.length&&obj){
    var u=clean(obj.url||obj.file||obj.source);
    if(/^https?:\/\//i.test(u))rows.push({url:u,quality:clean(obj.quality)||"Auto",codec:"",tag:""});
  }
  return rows;
}
function normQuality(s){
  s=String(s||"").toLowerCase();
  if(/2160|4k/.test(s))return"4K";
  if(/1440/.test(s))return"1440p";
  if(/1080/.test(s))return"1080p";
  if(/720/.test(s))return"720p";
  if(/480/.test(s))return"480p";
  if(/360/.test(s))return"360p";
  return clean(s)&&s!=="auto"?String(s):"Auto";
}
function verifyHls(row){
  return timeout(fetch(row.url,{headers:{"User-Agent":UA,"Origin":ORIGIN,"Referer":REFERER}}),12000,"HLS").then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    var m,max=0,re=/RESOLUTION=\d+x(\d+)/ig;
    while((m=re.exec(body))!==null){var h=parseInt(m[1],10)||0;if(h>max)max=h;}
    if(max)row.quality=normQuality(String(max));
    else row.quality=normQuality(row.quality);
    return row;
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return makeRequest(tmdbId,mediaType,season,episode).then(function(req){
    return timeout(fetch(req.url,{headers:req.headers}),12000,"Artemis request");
  }).then(function(r){
    return r.text().then(function(t){
      if(!r.ok)throw new Error("Artemis HTTP "+r.status+" "+String(t||"").slice(0,120));
      var j;try{j=JSON.parse(t);}catch(_){throw new Error("Artemis invalid JSON");}
      if(j&&j.error)throw new Error(String(j.error));
      var d=clean(j&&j.d);
      if(!d)throw new Error("response d missing");
      return aesGcmDecryptHex(KEY_RESP,d);
    });
  }).then(function(plain){
    var obj;try{obj=JSON.parse(plain);}catch(e){throw new Error("decrypted JSON invalid: "+plain.slice(0,120));}
    var rows=parseVariants(obj),out=[],i=0;
    function next(){
      if(i>=rows.length||out.length>=6)return Promise.resolve(out);
      var row=rows[i++];
      return verifyHls(row).then(function(v){
        var q=normQuality(v.quality);
        var suffix=v.codec?" · "+v.codec:"";
        var name="NoctraTV · ZStream Native · Artemis · "+q+suffix;
        out.push({name:name,title:name,url:v.url,quality:q,type:"hls",provider:"noctra-zstream-native-artemis",headers:{"User-Agent":UA,"Origin":ORIGIN,"Referer":REFERER},subtitles:[]});
        return next();
      }).catch(function(e){
        console.log("[Noctra/ZStream/Artemis] verify "+(e&&e.message?e.message:e));
        return next();
      });
    }
    return next();
  }).then(function(out){
    console.log("[Noctra/ZStream/Artemis] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/ZStream/Artemis] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

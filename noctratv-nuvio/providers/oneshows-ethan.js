// NoctraTV · 1Shows · Ethan
// Current MZone compatibility resolver. Root media URL receives mz_lease; child/segment requests inherit X-MZone-Playback-Lease.
// Direct HLS only; no iframe fallback.

var BASE="https://api.m-zone.org";
var ORIGIN="https://noctratv.com";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
var SIGN_PKCS8_B64="MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgIplYleE/mv91CSI8wJp6Hn4LtP+o6n/YMBYtH81LO4OhRANCAAQyV0or3KiQJO7qleShBraA6vr8uDyXN/lTKhbdWzyehg23qETv4Qgaq7rL72/ik2fB6TE0ddoPGlQd0G92qkK4";
var SIGN_PUBLIC_JWK={"kty":"EC","crv":"P-256","x":"MldKK9yokCTu6pXkoQa2gOr6_Lg8lzf5UyoW3Vs8noY","y":"DbeoRO_hCBqrusvvb-KTZ8HpMTR12g8aVB3Qb3aqQrg","ext":true,"key_ops":["verify"]};
var SESSION=null;
var SESSION_PROMISE=null;

var SOURCES=[
  {id:"site-oneshows-ethan",label:"Ethan",movie:true,tv:false}
];

function clean(v){return v==null?"":String(v).trim();}
function b64url(bytes){
  var a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0),s="";
  for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fingerprint(){
  return{
    webdriver:false,
    languages:["en-US","en"],
    plugins:5,
    hardwareConcurrency:8,
    deviceMemory:8,
    maxTouchPoints:5,
    platform:"Android",
    brands:[
      {brand:"Chromium",version:"140"},
      {brand:"Google Chrome",version:"140"}
    ],
    mobile:true,
    timezone:"Asia/Shanghai",
    screen:{width:1080,height:2400,colorDepth:24,pixelRatio:2.75},
    visibilityState:"visible"
  };
}

function b64bytes(s){
  s=String(s||"").replace(/\s+/g,"");
  var bin=atob(s),out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
function derToRawEcdsa(sig){
  var a=sig instanceof Uint8Array?sig:new Uint8Array(sig||0);
  if(a.length===64)return a;
  if(a.length<8||a[0]!==0x30)throw new Error("unexpected ECDSA signature format");
  var p=1,len=a[p++];
  if(len&0x80){
    var n=len&0x7f;len=0;
    for(var z=0;z<n;z++)len=(len<<8)|a[p++];
  }
  if(a[p++]!==0x02)throw new Error("bad ECDSA r");
  var rl=a[p++],r=a.slice(p,p+rl);p+=rl;
  if(a[p++]!==0x02)throw new Error("bad ECDSA s");
  var sl=a[p++],s=a.slice(p,p+sl);
  while(r.length>32&&r[0]===0)r=r.slice(1);
  while(s.length>32&&s[0]===0)s=s.slice(1);
  if(r.length>32||s.length>32)throw new Error("ECDSA component too long");
  var out=new Uint8Array(64);
  out.set(r,32-r.length);out.set(s,64-s.length);
  return out;
}
function signChallengeText(text){
  return globalThis.crypto.subtle.importKey(
    "pkcs8",
    b64bytes(SIGN_PKCS8_B64),
    {name:"ECDSA",namedCurve:"P-256"},
    false,
    ["sign"]
  ).then(function(key){
    return globalThis.crypto.subtle.sign(
      {name:"ECDSA",hash:"SHA-256"},
      key,
      new TextEncoder().encode(text)
    );
  }).then(function(sig){
    return b64url(derToRawEcdsa(new Uint8Array(sig)));
  });
}
function headers(extra){
  var h={
    "User-Agent":UA,
    "Origin":ORIGIN,
    "Referer":ORIGIN+"/",
    "Accept":"application/json,text/plain,*/*"
  };
  if(extra)Object.keys(extra).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function withTimeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false;
    var t=setTimeout(function(){
      if(done)return; done=true; reject(new Error(label+" timeout"));
    },ms);
    Promise.resolve(p).then(function(v){
      if(done)return; done=true; clearTimeout(t); resolve(v);
    },function(e){
      if(done)return; done=true; clearTimeout(t); reject(e);
    });
  });
}
function challenge(){
  return withTimeout(fetch(BASE+"/api/player/v2/challenge",{
    cache:"no-store",
    headers:headers()
  }),8000,"challenge").then(function(r){
    if(!r.ok)throw new Error("challenge HTTP "+r.status);
    var sc=clean(r.headers&&r.headers.get?r.headers.get("set-cookie"):"");
    var cookie=sc?sc.split(",").map(function(x){return x.split(";")[0].trim();}).filter(Boolean).join("; "):"";
    return r.json().then(function(j){
      if(j&&typeof j==="object")j.__cookie=cookie;
      return j;
    });
  });
}
function sessionValid(s){
  return !!(s&&s.token&&Number(s.expiresAt||0)>Date.now()+30000);
}
function createSession(){
  return challenge().then(function(ch){
    if(!ch||!ch.challengeId||!ch.nonce||!ch.issuedAt)throw new Error("invalid challenge");
    return signChallengeText(ch.challengeId+"."+ch.nonce+"."+ch.issuedAt).then(function(signature){
      return{
        ch:ch,
        publicKey:SIGN_PUBLIC_JWK,
        signature:signature
      };
    });
  }).then(function(x){
    var payload={
      challengeId:x.ch.challengeId,
      nonce:x.ch.nonce,
      publicKey:x.publicKey,
      signature:x.signature,
      fingerprint:fingerprint(),
      embedded:false,
      embedOrigin:"",
      sandboxed:false,
      turnstileToken:"",
      supportsEncryptedTransport:false,
      supportsEncryptedCapabilities:false,
      transportPublicKey:null,
      playerVersion:"mplayer-web-v2",
      playbackSessionVersion:2,
      capabilities:["hls","dash","codec-avc"]
    };
    return withTimeout(fetch(BASE+"/api/player/v2/session",{
      method:"POST",
      cache:"no-store",
      headers:headers(Object.assign({"Content-Type":"application/json"},x.ch.__cookie?{"Cookie":x.ch.__cookie}:{})),
      body:JSON.stringify(payload)
    }),10000,"session").then(function(r){
      return r.json().catch(function(){return{};}).then(function(j){
        if(r.status===428&&j&&j.challengeRequired){
          var e=new Error("Turnstile required");
          e.code="TURNSTILE_REQUIRED";
          throw e;
        }
        if(!r.ok||!j||j.success===false||!j.token||!j.sessionId||!j.expiresAt){
          throw new Error(clean(j&&j.error)||("session HTTP "+r.status));
        }
        var sc2=clean(r.headers&&r.headers.get?r.headers.get("set-cookie"):"");
        var cookie=x.ch.__cookie||"";
        if(sc2){
          var c2=sc2.split(",").map(function(v){return v.split(";")[0].trim();}).filter(Boolean).join("; ");
          if(c2)cookie=cookie?(cookie+"; "+c2):c2;
        }
        return{
          token:String(j.token),
          sessionId:String(j.sessionId),
          expiresAt:Number(j.expiresAt),
          cookie:cookie
        };
      });
    });
  });
}
function getSession(){
  if(sessionValid(SESSION))return Promise.resolve(SESSION);
  if(SESSION_PROMISE)return SESSION_PROMISE;
  SESSION_PROMISE=createSession().then(function(s){
    SESSION=s;
    return s;
  }).finally(function(){SESSION_PROMISE=null;});
  return SESSION_PROMISE;
}
function qualityFromManifest(text){
  var s=String(text||""),m,max=0,re=/RESOLUTION=\d+x(\d+)/ig;
  while((m=re.exec(s))!==null){var h=parseInt(m[1],10)||0;if(h>max)max=h;}
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}
function appendLease(u,token){
  try{
    var x=new URL(u);
    if(/(^|\.)m-zone\.org$/i.test(x.hostname)&&!x.searchParams.has("mz_lease")){
      x.searchParams.set("mz_lease",token);
      return x.toString();
    }
  }catch(_){}
  return u;
}
function validationHeaders(url,h){
  var out={};
  Object.keys(h||{}).forEach(function(k){out[k]=h[k];});
  try{
    var u=new URL(url);
    if(u.searchParams.has("mz_lease")){
      Object.keys(out).forEach(function(k){
        if(k.toLowerCase()==="x-mzone-playback-lease")delete out[k];
      });
    }
  }catch(_){}
  return out;
}
function validate(url,type,h){
  if(!/^https?:\/\//i.test(clean(url)))return Promise.resolve(null);
  var vh=validationHeaders(url,h);
  if(type==="mp4"||/\.mp4(?:[?#]|$)/i.test(url)){
    return withTimeout(fetch(url,{headers:vh}),10000,"MP4").then(function(r){
      if(!r.ok)throw new Error("MP4 HTTP "+r.status);
      var ct=(r.headers.get("content-type")||"").toLowerCase();
      if(ct.indexOf("text/html")>=0||ct.indexOf("application/json")>=0)throw new Error("not media");
      return{url:url,type:"mp4",quality:"Auto"};
    });
  }
  return withTimeout(fetch(url,{headers:vh}),10000,"HLS").then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    return{url:url,type:"hls",quality:qualityFromManifest(body)};
  });
}
function resolveOne(src,tmdbId,mediaType,season,episode,sess){
  var payload={
    codecCapabilities:{},
    type:mediaType==="tv"?"tv":"movie",
    tmdbId:String(tmdbId)
  };
  if(mediaType==="tv"){
    payload.season=String(season||1);
    payload.episode=String(episode||1);
  }
  var h=headers({
    "Content-Type":"application/json",
    "X-MZone-Playback-Lease":sess.token
  });
  if(sess.cookie)h["Cookie"]=sess.cookie;
  return withTimeout(fetch(BASE+"/mplayer/"+src.id+"/resolve",{
    method:"POST",
    cache:"no-store",
    headers:h,
    body:JSON.stringify(payload)
  }),16000,src.label+" resolve").then(function(r){
    return r.json().catch(function(){return{};}).then(function(j){
      if(!r.ok||j.success===false||!j.result)throw new Error(j.error||("HTTP "+r.status));
      var x=j.result||{};
      var u=clean(x.url||x.playlist||x.file);
      if(!u)throw new Error("no media");
      u=appendLease(u,sess.token);
      var typ=clean(x.type||x.format).toLowerCase();
      if(typ!=="mp4")typ="hls";
      var mediaHeaders={};
      if(x.headers&&typeof x.headers==="object")Object.keys(x.headers).forEach(function(k){mediaHeaders[k]=String(x.headers[k]);});
      if(/^https?:\/\/[^/]*m-zone\.org\//i.test(u)){
        mediaHeaders["User-Agent"]=UA;
        mediaHeaders["X-MZone-Playback-Lease"]=sess.token;
        if(sess.cookie)mediaHeaders["Cookie"]=sess.cookie;
      }
      return validate(u,typ,mediaHeaders).then(function(v){
        if(!v)return null;
        var mh=Number(x.maxHeight)||0;
        var rq=clean(x.quality||x.label);
        if(!/(?:2160|1440|1080|720|576|540|480|360|4k)/i.test(rq))rq="";
        var q=mh>0?(mh>=2160?"4K":String(mh)+"p"):(rq||v.quality||"Auto");
        var name="NoctraTV · 1Shows · Ethan · "+src.label+" · "+q;
        return{
          name:name,title:name,url:v.url,quality:q,type:v.type,
          provider:"noctra-oneshows-ethan",
          headers:mediaHeaders,
          subtitles:[]
        };
      });
    });
  }).catch(function(e){
    console.log("[Noctra/1Shows/Ethan] "+src.label+" "+(e&&e.message?e.message:e));
    return null;
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var list=SOURCES.filter(function(s){return mediaType==="tv"?s.tv:s.movie;});
  return getSession().then(function(sess){
    return Promise.all(list.map(function(s){return resolveOne(s,tmdbId,mediaType,season,episode,sess);}));
  }).then(function(rows){
    var out=[],seen={};
    (rows||[]).forEach(function(x){
      if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
    });
    console.log("[Noctra/1Shows/Ethan] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/1Shows/Ethan] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

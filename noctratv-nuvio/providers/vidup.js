// NoctraTV · VidUp / Orion — current MZone resolver
// Uses NoctraTV's current v2 challenge/session flow with a fresh ephemeral P-256 key.
// No fixed signing key is embedded. Returns only media that passes HLS/DASH/MP4 validation.

var BASE="https://api.m-zone.org";
var ORIGIN="https://noctratv.com";
var PROVIDER_ORIGIN="https://vidup.to/";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var SESSION=null;
var SESSION_PROMISE=null;

function clean(v){return v==null?"":String(v).trim();}

function b64url(bytes){
  var a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0),s="";
  for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
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
  var sl=a[p++],ss=a.slice(p,p+sl);
  while(r.length>32&&r[0]===0)r=r.slice(1);
  while(ss.length>32&&ss[0]===0)ss=ss.slice(1);
  if(r.length>32||ss.length>32)throw new Error("ECDSA component too long");
  var out=new Uint8Array(64);
  out.set(r,32-r.length);out.set(ss,64-ss.length);
  return out;
}

function headers(extra){
  var h={
    "User-Agent":UA,
    "Origin":ORIGIN,
    "Referer":ORIGIN+"/",
    "Accept":"application/json,text/plain,*/*"
  };
  Object.keys(extra||{}).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}

function withTimeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false;
    var t=setTimeout(function(){
      if(done)return;
      done=true;
      reject(new Error(label+" timeout"));
    },ms);
    Promise.resolve(p).then(function(v){
      if(done)return;
      done=true;clearTimeout(t);resolve(v);
    },function(e){
      if(done)return;
      done=true;clearTimeout(t);reject(e);
    });
  });
}

function cookieFromResponse(r){
  try{
    var raw=clean(r.headers&&r.headers.get?r.headers.get("set-cookie"):"");
    if(!raw)return"";
    return raw.split(/,(?=\s*[^;,\s]+=)/).map(function(x){
      return clean(x).split(";")[0];
    }).filter(Boolean).join("; ");
  }catch(_){return"";}
}

function fingerprint(){
  var nav=typeof navigator!=="undefined"?navigator:{};
  var scr=typeof screen!=="undefined"?screen:{};
  var tz="Asia/Shanghai";
  try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||tz;}catch(_){}
  return{
    webdriver:false,
    languages:Array.isArray(nav.languages)?nav.languages.slice(0,8):["en-US","en"],
    plugins:Math.min(100,nav.plugins&&nav.plugins.length?nav.plugins.length:5),
    hardwareConcurrency:Number(nav.hardwareConcurrency||8),
    deviceMemory:Number(nav.deviceMemory||8),
    maxTouchPoints:Number(nav.maxTouchPoints||5),
    platform:clean(nav.userAgentData&&nav.userAgentData.platform)||clean(nav.platform)||"Android",
    brands:nav.userAgentData&&Array.isArray(nav.userAgentData.brands)?nav.userAgentData.brands.slice(0,8):[
      {brand:"Chromium",version:"143"},{brand:"Google Chrome",version:"143"}
    ],
    mobile:nav.userAgentData?!!nav.userAgentData.mobile:true,
    timezone:tz,
    screen:{
      width:Number(scr.width||1080),
      height:Number(scr.height||2400),
      colorDepth:Number(scr.colorDepth||24),
      pixelRatio:Number(typeof devicePixelRatio!=="undefined"?devicePixelRatio:2.75)
    },
    visibilityState:typeof document!=="undefined"?clean(document.visibilityState)||"visible":"visible"
  };
}

function codecCapabilities(){
  return{
    version:1,
    video:{avc:true,hevc:false,vp9:true,av1:false},
    audio:{aac:true,heaac:true,opus:true,ac3:false,eac3:false,mp3:true}
  };
}

function sessionValid(s){
  return !!(s&&s.token&&s.sessionId&&Number(s.expiresAt||0)>Date.now()+30000);
}

function challenge(){
  return withTimeout(fetch(BASE+"/api/player/v2/challenge",{
    cache:"no-store",
    credentials:"include",
    headers:headers()
  }),8000,"challenge").then(function(r){
    if(!r.ok)throw new Error("challenge HTTP "+r.status);
    var cookie=cookieFromResponse(r);
    return r.json().then(function(j){
      if(!j||!j.challengeId||!j.nonce||!j.issuedAt)throw new Error("invalid challenge");
      j.__cookie=cookie;
      return j;
    });
  });
}

function createSession(){
  var keyPair=null;
  if(!globalThis.crypto||!globalThis.crypto.subtle) return Promise.reject(new Error("WebCrypto unavailable"));
  return challenge().then(function(ch){
    return globalThis.crypto.subtle.generateKey(
      {name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]
    ).then(function(kp){
      keyPair=kp;
      return Promise.all([
        globalThis.crypto.subtle.exportKey("jwk",kp.publicKey),
        globalThis.crypto.subtle.sign(
          {name:"ECDSA",hash:"SHA-256"},
          kp.privateKey,
          new TextEncoder().encode(ch.challengeId+"."+ch.nonce+"."+ch.issuedAt)
        )
      ]);
    }).then(function(parts){
      var publicKey=parts[0];
      var signature=b64url(derToRawEcdsa(new Uint8Array(parts[1])));
      var payload={
        challengeId:ch.challengeId,
        nonce:ch.nonce,
        publicKey:publicKey,
        signature:signature,
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
      var hh=headers({"Content-Type":"application/json"});
      if(ch.__cookie)hh["Cookie"]=ch.__cookie;
      return withTimeout(fetch(BASE+"/api/player/v2/session",{
        method:"POST",
        cache:"no-store",
        credentials:"include",
        headers:hh,
        body:JSON.stringify(payload)
      }),10000,"session").then(function(r){
        return r.json().catch(function(){return{};}).then(function(j){
          if(r.status===428&&j&&j.challengeRequired)throw new Error("Turnstile required");
          if(!r.ok||!j||j.success===false||!j.token||!j.sessionId||!j.expiresAt){
            throw new Error(clean(j&&j.error)||("session HTTP "+r.status));
          }
          var c2=cookieFromResponse(r),cookie=ch.__cookie||"";
          if(c2)cookie=cookie?cookie+"; "+c2:c2;
          return{
            token:String(j.token),
            sessionId:String(j.sessionId),
            expiresAt:Number(j.expiresAt),
            cookie:cookie
          };
        });
      });
    });
  });
}

function getSession(){
  if(sessionValid(SESSION))return Promise.resolve(SESSION);
  if(SESSION_PROMISE)return SESSION_PROMISE;
  SESSION_PROMISE=createSession().then(function(s){
    SESSION=s;return s;
  }).finally(function(){SESSION_PROMISE=null;});
  return SESSION_PROMISE;
}

function appendLease(raw,token){
  try{
    var u=new URL(raw,BASE);
    if(/(^|\.)m-zone\.org$/i.test(u.hostname)&&!u.searchParams.has("mz_lease")){
      u.searchParams.set("mz_lease",token);
    }
    return u.toString();
  }catch(_){return raw;}
}

function relayMedia(raw,format,slot,sess){
  var u=clean(raw);
  if(!u)return"";
  try{
    var parsed=new URL(u,BASE);
    if(/(^|\.)m-zone\.org$/i.test(parsed.hostname))return appendLease(parsed.toString(),sess.token);
  }catch(_){}
  if(format==="mp4")return u;
  var route=format==="dash"?"dash-proxy":"m3u8-proxy";
  var p=new URL(BASE+"/"+route);
  p.searchParams.set("url",u);
  if(route==="m3u8-proxy")p.searchParams.set("_px","originless-2");
  p.searchParams.set("headers",JSON.stringify({Referer:PROVIDER_ORIGIN}));
  if(Number.isInteger(Number(slot)))p.searchParams.set("_isp",String(Number(slot)));
  p.searchParams.set("mz_lease",sess.token);
  return p.toString();
}

function relaySubtitle(raw,slot,sess){
  var u=clean(raw);
  if(!/^https?:\/\//i.test(u))return"";
  try{
    var parsed=new URL(u);
    if(/(^|\.)m-zone\.org$/i.test(parsed.hostname))return appendLease(u,sess.token);
  }catch(_){}
  var p=new URL(BASE+"/subtitle-proxy");
  p.searchParams.set("url",u);
  p.searchParams.set("headers",JSON.stringify({Referer:PROVIDER_ORIGIN}));
  if(Number.isInteger(Number(slot)))p.searchParams.set("_isp",String(Number(slot)));
  p.searchParams.set("mz_lease",sess.token);
  return p.toString();
}

function subtitles(tracks,slot,sess){
  var out=[],seen={};
  (Array.isArray(tracks)?tracks:[]).forEach(function(t){
    var raw=clean(t&&(t.file||t.url));
    var kind=clean(t&&t.kind).toLowerCase();
    var typ=clean(t&&(t.type||t.format)).toLowerCase();
    if(!raw)return;
    if(kind&&kind!=="subtitles"&&kind!=="captions"&&!/srt|vtt/.test(typ)&&! /\.(?:srt|vtt)(?:[?#]|$)/i.test(raw))return;
    var u=relaySubtitle(raw,slot,sess);
    if(!u||seen[u])return;seen[u]=1;
    var lang=clean(t&&(t.code||t.label||t.language))||"Subtitle";
    out.push({url:u,language:lang,name:lang+" [VidUp]"});
  });
  return out.slice(0,24);
}

function qualityFromManifest(text){
  var s=String(text||""),m,max=0,re=/RESOLUTION=\d+x(\d+)/ig;
  while((m=re.exec(s))!==null)max=Math.max(max,parseInt(m[1],10)||0);
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}

function validate(url,format){
  if(!/^https?:\/\//i.test(clean(url)))return Promise.resolve(null);
  if(format==="dash"){
    return withTimeout(fetch(url,{cache:"no-store"}),12000,"DASH").then(function(r){
      if(!r.ok)throw new Error("DASH HTTP "+r.status);
      return r.text();
    }).then(function(body){
      if(!/<MPD(?:\s|>)/i.test(String(body||"")))throw new Error("not DASH");
      return{url:url,type:"dash",quality:"Auto"};
    }).catch(function(e){
      console.log("[Noctra/VidUp] DASH "+(e&&e.message?e.message:e));return null;
    });
  }
  if(format==="mp4"){
    return withTimeout(fetch(url,{cache:"no-store",headers:{"Range":"bytes=0-4095","Referer":PROVIDER_ORIGIN}}),12000,"MP4")
      .then(function(r){
        if(!(r.ok||r.status===206))throw new Error("MP4 HTTP "+r.status);
        var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
        if(ct.indexOf("text/html")>=0||ct.indexOf("application/json")>=0)throw new Error("not media");
        return{url:url,type:"mp4",quality:"Auto"};
      }).catch(function(e){
        console.log("[Noctra/VidUp] MP4 "+(e&&e.message?e.message:e));return null;
      });
  }
  return withTimeout(fetch(url,{cache:"no-store"}),12000,"HLS").then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(String(body||"").trim().indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    return{url:url,type:"hls",quality:qualityFromManifest(body)};
  }).catch(function(e){
    console.log("[Noctra/VidUp] HLS "+(e&&e.message?e.message:e));return null;
  });
}

function resolveVidUp(tmdbId,mediaType,season,episode,sess){
  var payload={
    codecCapabilities:codecCapabilities(),
    type:mediaType==="tv"?"tv":"movie",
    tmdbId:String(tmdbId)
  };
  if(mediaType==="tv"){
    payload.season=String(Number(season||1));
    payload.episode=String(Number(episode||1));
  }
  var hh=headers({
    "Content-Type":"application/json",
    "X-MZone-Playback-Lease":sess.token,
    "X-MZone-Relay-Affinity":"https://relay-a.m-zone.org"
  });
  if(sess.cookie)hh["Cookie"]=sess.cookie;
  return withTimeout(fetch(BASE+"/mplayer/vidup/resolve",{
    method:"POST",
    cache:"no-store",
    credentials:"include",
    headers:hh,
    body:JSON.stringify(payload)
  }),18000,"VidUp resolve").then(function(r){
    return r.json().catch(function(){return{};}).then(function(j){
      if(!r.ok||j.success===false||!j.result){
        throw new Error(clean(j.error||j.message)||("VidUp HTTP "+r.status));
      }
      var actual=clean(j.provider)||"vidup";
      if(actual!=="vidup")throw new Error("resolver switched provider to "+actual);
      var x=j.result||{};
      var raw=clean(x.url||x.playlist||x.file);
      if(!raw)throw new Error("VidUp returned no media URL");
      var fmt=clean(x.format||x.type).toLowerCase();
      if(fmt==="mpd")fmt="dash";
      if(fmt!=="dash"&&fmt!=="mp4")fmt="hls";
      var media=relayMedia(raw,fmt,j.residentialProxySlot,sess);
      var subs=subtitles(x.tracks,j.residentialProxySlot,sess);
      return validate(media,fmt).then(function(v){
        if(!v)return[];
        var mh=Number(x.maxHeight||0);
        var q=mh>=2160?"4K":mh>0?String(mh)+"p":v.quality||"Auto";
        var server=clean(j.server||x.server)||"primary";
        var name="NoctraTV · VidUp / Orion · "+server+" · "+q;
        return[{
          name:name,
          title:name,
          url:v.url,
          quality:q,
          type:v.type,
          provider:"noctra-vidup",
          headers:fmt==="mp4"?{"Referer":PROVIDER_ORIGIN,"User-Agent":UA}:{},
          subtitles:subs
        }];
      });
    });
  });
}

function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return getSession().then(function(sess){
    return resolveVidUp(tmdbId,mediaType,season,episode,sess);
  }).then(function(out){
    console.log("[Noctra/VidUp] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/VidUp] "+(e&&e.message?e.message:e));
    return[];
  });
}

module.exports={
  getStreams:getStreams,
  createSession:createSession,
  codecCapabilities:codecCapabilities
};

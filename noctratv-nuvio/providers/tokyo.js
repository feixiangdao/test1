// NoctraTV · Tokyo aliases — device-local MZone playback-session resolver
// Exact current noctratv.com aliases:
// Barcelona SUB/DUB -> corazon, Seville SUB -> kickassanime,
// Kyoto SUB/HSUB/DUB -> anikai.
// The Noctra backend owns those mappings. This provider obtains a playback
// lease locally, then calls the exact alias resolver endpoints.
// If the network is challenged with Turnstile (HTTP 428), return 0 honestly.

var BASE="https://api.m-zone.org";
var ORIGIN="https://noctratv.com";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
var SESSION=null;
var SESSION_PROMISE=null;
var ALIASES=[
  {id:"zstream-tokyo-barcelona-sub",label:"Barcelona SUB",lang:"sub"},
  {id:"zstream-tokyo-barcelona-dub",label:"Barcelona DUB",lang:"dub"},
  {id:"zstream-tokyo-seville-sub",label:"Seville SUB",lang:"sub"},
  {id:"zstream-tokyo-kyoto-sub",label:"Kyoto SUB",lang:"sub"},
  {id:"zstream-tokyo-kyoto-hsub",label:"Kyoto HSUB",lang:"hsub"},
  {id:"zstream-tokyo-kyoto-dub",label:"Kyoto DUB",lang:"dub"}
];

function clean(v){return v==null?"":String(v).trim();}
function b64url(bytes){
  var a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0),s="";
  for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function headers(extra){
  var h={
    "User-Agent":UA,
    "Accept":"application/json,text/plain,*/*",
    "Origin":ORIGIN,
    "Referer":ORIGIN+"/"
  };
  if(extra)Object.keys(extra).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function nowValid(s){return !!(s&&s.token&&Number(s.expiresAt)>Date.now()+30000);}
function realisticFingerprint(){
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
function createSession(){
  return fetch(BASE+"/api/player/v2/challenge",{
    cache:"no-store",
    headers:headers()
  }).then(function(r){
    if(!r.ok)throw new Error("challenge HTTP "+r.status);
    return r.json();
  }).then(function(ch){
    if(!ch||!ch.challengeId||!ch.nonce||!ch.issuedAt)throw new Error("challenge invalid");
    return globalThis.crypto.subtle.generateKey(
      {name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]
    ).then(function(signKey){
      return Promise.all([
        globalThis.crypto.subtle.exportKey("jwk",signKey.publicKey),
        globalThis.crypto.subtle.sign(
          {name:"ECDSA",hash:"SHA-256"},
          signKey.privateKey,
          new TextEncoder().encode(ch.challengeId+"."+ch.nonce+"."+ch.issuedAt)
        )
      ]).then(function(parts){
        return{
          ch:ch,
          publicKey:parts[0],
          signature:b64url(new Uint8Array(parts[1]))
        };
      });
    });
  }).then(function(x){
    var caps=["hls","dash","codec-avc"];
    var payload={
      challengeId:x.ch.challengeId,
      nonce:x.ch.nonce,
      publicKey:x.publicKey,
      signature:x.signature,
      fingerprint:realisticFingerprint(),
      embedded:false,
      embedOrigin:"",
      sandboxed:false,
      turnstileToken:"",
      supportsEncryptedTransport:false,
      supportsEncryptedCapabilities:false,
      transportPublicKey:null,
      playerVersion:"mplayer-web-v2",
      playbackSessionVersion:2,
      capabilities:caps
    };
    return fetch(BASE+"/api/player/v2/session",{
      method:"POST",
      cache:"no-store",
      headers:headers({"Content-Type":"application/json"}),
      body:JSON.stringify(payload)
    }).then(function(r){
      return r.json().catch(function(){return{};}).then(function(j){
        if(r.status===428&&j&&j.challengeRequired){
          var e=new Error("Turnstile required");
          e.code="TURNSTILE_REQUIRED";throw e;
        }
        if(!r.ok||!j||j.success===false||!j.token||!j.sessionId||!j.expiresAt){
          throw new Error(clean(j&&j.error)||("session HTTP "+r.status));
        }
        return{token:j.token,sessionId:j.sessionId,expiresAt:Number(j.expiresAt)};
      });
    });
  });
}
function getSession(){
  if(nowValid(SESSION))return Promise.resolve(SESSION);
  if(SESSION_PROMISE)return SESSION_PROMISE;
  SESSION_PROMISE=createSession().then(function(s){SESSION=s;return s;})
    .finally(function(){SESSION_PROMISE=null;});
  return SESSION_PROMISE;
}
function qualityFromText(s){
  s=String(s||"").toLowerCase();
  if(/2160|4k/.test(s))return"4K";
  if(/1440/.test(s))return"1440p";
  if(/1080/.test(s))return"1080p";
  if(/720/.test(s))return"720p";
  if(/480/.test(s))return"480p";
  return"Auto";
}
function mediaFromResult(j){
  var r=j&&j.result?j.result:{};
  var rows=[];
  function add(x){
    if(!x)return;
    var u=clean(x.url||x.playlist||x.file);
    if(/^https?:\/\//i.test(u))rows.push({
      url:u,
      type:clean(x.type||x.format),
      quality:clean(x.quality||x.label||(x.maxHeight?x.maxHeight+"p":"")),
      headers:x.headers&&typeof x.headers==="object"?x.headers:{},
      subtitles:Array.isArray(x.subtitles)?x.subtitles:[]
    });
  }
  add(r);
  if(Array.isArray(r.sources))r.sources.forEach(add);
  if(Array.isArray(r.streams))r.streams.forEach(add);
  if(Array.isArray(r.variants))r.variants.forEach(add);
  return rows;
}
function resolveAlias(alias,tmdbId,mediaType,season,episode,session){
  var body={
    codecCapabilities:{},
    type:mediaType==="tv"?"tv":"movie",
    tmdbId:String(tmdbId)
  };
  if(mediaType==="tv"){
    body.season=String(season||1);
    body.episode=String(episode||1);
  }
  return fetch(BASE+"/mplayer/"+alias.id+"/resolve",{
    method:"POST",
    cache:"no-store",
    headers:headers({
      "Content-Type":"application/json",
      "X-MZone-Playback-Lease":session.token
    }),
    body:JSON.stringify(body)
  }).then(function(r){
    return r.json().catch(function(){return{};}).then(function(j){
      if(r.status===401&&j&&j.code==="PLAYBACK_SESSION_REQUIRED"){
        SESSION=null;throw new Error("lease rejected");
      }
      if(!r.ok||!j||j.success===false||!j.result)return[];
      return mediaFromResult(j).map(function(x){
        var q=x.quality||qualityFromText(x.url);
        var name="NoctraTV · Tokyo · "+alias.label+" · "+q;
        return{
          name:name,title:name,url:x.url,quality:q,
          provider:"noctra-tokyo",
          headers:x.headers||{},
          subtitles:x.subtitles||[],
          language:alias.lang
        };
      });
    });
  }).catch(function(e){
    console.log("[Noctra/Tokyo] "+alias.label+" "+(e&&e.message?e.message:e));
    return[];
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return getSession().then(function(s){
    // Resolve sequentially to respect MZone's maxStreams/session limits.
    var out=[],i=0;
    function next(){
      if(i>=ALIASES.length)return Promise.resolve(out);
      var a=ALIASES[i++];
      return resolveAlias(a,tmdbId,mediaType,season,episode,s).then(function(rows){
        rows.forEach(function(x){out.push(x);});
        return next();
      });
    }
    return next();
  }).then(function(rows){
    var out=[],seen={};
    (rows||[]).forEach(function(x){
      if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
    });
    console.log("[Noctra/Tokyo] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/Tokyo] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

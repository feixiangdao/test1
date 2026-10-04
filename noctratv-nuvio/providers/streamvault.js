// NoctraTV · StreamVault
// Current NoctraTV StreamVault family uses MZone's selected-source resolver.
// This local implementation attempts the official compatibility playback session
// (no ECDH encrypted transport) and returns only live-validated direct media.
// If MZone requires interactive Turnstile on the current network, it returns [] honestly.

var BASE="https://api.m-zone.org";
var ORIGIN="https://noctratv.com";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
var SESSION=null;

var SOURCES=[
  {id:"site-streamvault-silver",label:"Silver",movie:true,tv:false},
  {id:"site-streamvault-zoisite",label:"Zoisite",movie:true,tv:true},
  {id:"site-streamvault-iron",label:"Iron",movie:true,tv:false},
  {id:"site-streamvault-sunstone",label:"Sunstone",movie:true,tv:false}
];

function clean(v){return v==null?"":String(v).trim();}
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
    return r.json();
  });
}
function sessionValid(s){
  return s&&s.token&&Number(s.expiresAt||0)>Date.now()+30000;
}
function createSession(){
  if(sessionValid(SESSION))return Promise.resolve(SESSION);
  return challenge().then(function(ch){
    if(!ch||!ch.challengeId||!ch.nonce||!ch.issuedAt)throw new Error("invalid challenge");
    var body={
      challengeId:ch.challengeId,
      nonce:ch.nonce,
      publicKey:null,
      signature:"",
      fingerprint:{
        webdriver:false,
        languages:["en-US","en"],
        plugins:0,
        hardwareConcurrency:8,
        deviceMemory:8,
        maxTouchPoints:5,
        platform:"Android",
        brands:[{brand:"Chromium",version:"131"},{brand:"Google Chrome",version:"131"}],
        mobile:true,
        timezone:"UTC",
        screen:{width:1080,height:2400,colorDepth:24,pixelRatio:2.75},
        visibilityState:"visible"
      },
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
      headers:headers({"Content-Type":"application/json"}),
      body:JSON.stringify(body)
    }),10000,"session").then(function(r){
      return r.json().catch(function(){return{};}).then(function(j){
        if(r.status===428||j.challengeRequired)throw new Error("interactive playback verification required");
        if(!r.ok||j.success===false||!j.token)throw new Error(j.error||("session HTTP "+r.status));
        SESSION={
          token:String(j.token),
          sessionId:clean(j.sessionId),
          expiresAt:Number(j.expiresAt)||0
        };
        return SESSION;
      });
    });
  });
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
    if(x.pathname.indexOf("/p/v4/")===0&&!x.searchParams.has("mz_lease")){
      x.searchParams.set("mz_lease",token);
      return x.toString();
    }
  }catch(_){}
  return u;
}
function validate(url,type,h){
  if(!/^https?:\/\//i.test(clean(url)))return Promise.resolve(null);
  if(type==="mp4"||/\.mp4(?:[?#]|$)/i.test(url)){
    return withTimeout(fetch(url,{headers:h}),10000,"MP4").then(function(r){
      if(!r.ok)throw new Error("MP4 HTTP "+r.status);
      var ct=(r.headers.get("content-type")||"").toLowerCase();
      if(ct.indexOf("text/html")>=0||ct.indexOf("application/json")>=0)throw new Error("not media");
      return{url:url,type:"mp4",quality:"Auto"};
    });
  }
  return withTimeout(fetch(url,{headers:h}),10000,"HLS").then(function(r){
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
      if(/^https?:\/\/[^/]*m-zone\.org\//i.test(u))mediaHeaders["X-MZone-Playback-Lease"]=sess.token;
      return validate(u,typ,mediaHeaders).then(function(v){
        if(!v)return null;
        var q=clean(x.maxHeight)?(Number(x.maxHeight)>=2160?"4K":String(x.maxHeight)+"p"):v.quality;
        var name="NoctraTV · StreamVault · "+src.label+" · "+q;
        return{
          name:name,title:name,url:v.url,quality:q,type:v.type,
          provider:"noctra-streamvault",
          headers:mediaHeaders,
          subtitles:[]
        };
      });
    });
  }).catch(function(e){
    console.log("[Noctra/StreamVault] "+src.label+" "+(e&&e.message?e.message:e));
    return null;
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var list=SOURCES.filter(function(s){return mediaType==="tv"?s.tv:s.movie;});
  return createSession().then(function(sess){
    return Promise.all(list.map(function(s){return resolveOne(s,tmdbId,mediaType,season,episode,sess);}));
  }).then(function(rows){
    var out=[],seen={};
    (rows||[]).forEach(function(x){
      if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
    });
    console.log("[Noctra/StreamVault] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/StreamVault] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

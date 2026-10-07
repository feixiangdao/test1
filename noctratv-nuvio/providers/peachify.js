// NoctraTV · Peachify / Phoenix — current top-level MZone resolver
// Generated from NoctraTV's current generic pStream resolver contract.
// Ephemeral P-256 playback session; no fixed signing key. Direct media only.

var PROVIDER="peachify";
var LABEL="Peachify / Phoenix";
var PLUGIN_ID="noctra-peachify";
var BASE="https://api.m-zone.org";
var ORIGIN="https://noctratv.com";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY=(typeof globalThis!=="undefined"&&globalThis.TMDB_API_KEY)?globalThis.TMDB_API_KEY:"68e094699525b18a70bab2f86b1fa706";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var SESSION=null,SESSION_PROMISE=null;

function clean(v){return v==null?"":String(v).trim();}
function b64url(bytes){
  var a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0),s="";
  for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function derToRaw(sig){
  var a=sig instanceof Uint8Array?sig:new Uint8Array(sig||0);
  if(a.length===64)return a;
  if(a.length<8||a[0]!==48)throw new Error("unexpected ECDSA signature");
  var p=1,len=a[p++];
  if(len&128){var n=len&127;len=0;for(var z=0;z<n;z++)len=(len<<8)|a[p++];}
  if(a[p++]!==2)throw new Error("bad ECDSA r");
  var rl=a[p++],r=a.slice(p,p+rl);p+=rl;
  if(a[p++]!==2)throw new Error("bad ECDSA s");
  var sl=a[p++],q=a.slice(p,p+sl);
  while(r.length>32&&r[0]===0)r=r.slice(1);
  while(q.length>32&&q[0]===0)q=q.slice(1);
  if(r.length>32||q.length>32)throw new Error("bad ECDSA length");
  var out=new Uint8Array(64);out.set(r,32-r.length);out.set(q,64-q.length);return out;
}
function baseHeaders(extra){
  var h={"User-Agent":UA,Origin:ORIGIN,Referer:ORIGIN+"/",Accept:"application/json,text/plain,*/*"};
  Object.keys(extra||{}).forEach(function(k){h[k]=String(extra[k]);});return h;
}
function timeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false,t=setTimeout(function(){if(!done){done=true;reject(new Error(label+" timeout"));}},ms);
    Promise.resolve(p).then(function(v){if(!done){done=true;clearTimeout(t);resolve(v);}},function(e){if(!done){done=true;clearTimeout(t);reject(e);}});
  });
}
function responseCookie(r){
  try{
    var x=clean(r.headers&&r.headers.get?r.headers.get("set-cookie"):"");
    if(!x)return"";
    return x.split(/,(?=\s*[^;,\s]+=)/).map(function(v){return clean(v).split(";")[0];}).filter(Boolean).join("; ");
  }catch(_){return"";}
}
function fp(){
  var nav=typeof navigator!=="undefined"?navigator:{},scr=typeof screen!=="undefined"?screen:{},tz="Asia/Shanghai";
  try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||tz;}catch(_){}
  return{
    webdriver:false,languages:Array.isArray(nav.languages)?nav.languages.slice(0,8):["en-US","en"],
    plugins:Math.min(100,nav.plugins&&nav.plugins.length?nav.plugins.length:5),
    hardwareConcurrency:Number(nav.hardwareConcurrency||8),deviceMemory:Number(nav.deviceMemory||8),
    maxTouchPoints:Number(nav.maxTouchPoints||5),
    platform:clean(nav.userAgentData&&nav.userAgentData.platform)||clean(nav.platform)||"Android",
    brands:nav.userAgentData&&Array.isArray(nav.userAgentData.brands)?nav.userAgentData.brands.slice(0,8):[{brand:"Chromium",version:"143"},{brand:"Google Chrome",version:"143"}],
    mobile:nav.userAgentData?!!nav.userAgentData.mobile:true,timezone:tz,
    screen:{width:Number(scr.width||1080),height:Number(scr.height||2400),colorDepth:Number(scr.colorDepth||24),pixelRatio:Number(typeof devicePixelRatio!=="undefined"?devicePixelRatio:2.75)},
    visibilityState:typeof document!=="undefined"?clean(document.visibilityState)||"visible":"visible"
  };
}
function caps(){return{version:1,video:{avc:true,hevc:false,vp9:true,av1:false},audio:{aac:true,heaac:true,opus:true,ac3:false,eac3:false,mp3:true}};}
function validSession(s){return!!(s&&s.token&&s.sessionId&&Number(s.expiresAt||0)>Date.now()+30000);}
function createSession(){
  if(!globalThis.crypto||!globalThis.crypto.subtle)return Promise.reject(new Error("WebCrypto unavailable"));
  var ch,keyPair;
  return timeout(fetch(BASE+"/api/player/v2/challenge",{cache:"no-store",credentials:"include",headers:baseHeaders()}),8000,"challenge")
    .then(function(r){if(!r.ok)throw new Error("challenge HTTP "+r.status);var c=responseCookie(r);return r.json().then(function(j){if(!j||!j.challengeId||!j.nonce||!j.issuedAt)throw new Error("invalid challenge");j.__cookie=c;return j;});})
    .then(function(j){ch=j;return globalThis.crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);})
    .then(function(kp){keyPair=kp;return Promise.all([globalThis.crypto.subtle.exportKey("jwk",kp.publicKey),globalThis.crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},kp.privateKey,new TextEncoder().encode(ch.challengeId+"."+ch.nonce+"."+ch.issuedAt))]);})
    .then(function(parts){
      var hh=baseHeaders({"Content-Type":"application/json"});if(ch.__cookie)hh.Cookie=ch.__cookie;
      var body={challengeId:ch.challengeId,nonce:ch.nonce,publicKey:parts[0],signature:b64url(derToRaw(new Uint8Array(parts[1]))),fingerprint:fp(),embedded:false,embedOrigin:"",sandboxed:false,turnstileToken:"",supportsEncryptedTransport:false,supportsEncryptedCapabilities:false,transportPublicKey:null,playerVersion:"mplayer-web-v2",playbackSessionVersion:2,capabilities:["hls","dash","codec-avc"]};
      return timeout(fetch(BASE+"/api/player/v2/session",{method:"POST",cache:"no-store",credentials:"include",headers:hh,body:JSON.stringify(body)}),10000,"session").then(function(r){
        return r.json().catch(function(){return{};}).then(function(j){
          if(r.status===428&&j&&j.challengeRequired)throw new Error("Turnstile required");
          if(!r.ok||!j||j.success===false||!j.token||!j.sessionId||!j.expiresAt)throw new Error(clean(j&&j.error)||("session HTTP "+r.status));
          var c=responseCookie(r),cookie=ch.__cookie||"";if(c)cookie=cookie?cookie+"; "+c:c;
          return{token:String(j.token),sessionId:String(j.sessionId),expiresAt:Number(j.expiresAt),cookie:cookie};
        });
      });
    });
}
function getSession(){
  if(validSession(SESSION))return Promise.resolve(SESSION);
  if(SESSION_PROMISE)return SESSION_PROMISE;
  SESSION_PROMISE=createSession().then(function(s){SESSION=s;return s;}).finally(function(){SESSION_PROMISE=null;});
  return SESSION_PROMISE;
}
function tmdbMeta(id,type){
  var t=type==="tv"?"tv":"movie";
  var u=TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(TMDB_KEY)+"&append_to_response=external_ids&language=en-US";
  return timeout(fetch(u,{headers:{"User-Agent":UA,Accept:"application/json"}}),8000,"TMDB").then(function(r){
    if(!r.ok)throw new Error("TMDB HTTP "+r.status);return r.json();
  }).then(function(j){
    var title=t==="tv"?(j.name||j.original_name||""):(j.title||j.original_title||"");
    var date=t==="tv"?(j.first_air_date||""):(j.release_date||"");
    return{title:clean(title),releaseYear:date&&date.length>=4?Number(date.slice(0,4)):0,imdbId:clean(j.external_ids&&j.external_ids.imdb_id)};
  });
}
function appendLease(raw,token){
  try{var u=new URL(raw,BASE);if(/(^|\.)m-zone\.org$/i.test(u.hostname)&&!u.searchParams.has("mz_lease"))u.searchParams.set("mz_lease",token);return u.toString();}catch(_){return raw;}
}
function safeHeaders(obj,referer){
  var h={};Object.keys(obj||{}).forEach(function(k){var v=clean(obj[k]);if(v&&!/^(?:connection|host|content-length)$/i.test(k))h[k]=v;});
  if(referer&&!h.Referer&&!h.referer)h.Referer=referer;return h;
}
function relayHls(raw,h,route,slot,sess){
  var u=clean(raw);if(!u)return"";
  try{var parsed=new URL(u,BASE);if(/(^|\.)m-zone\.org$/i.test(parsed.hostname))return appendLease(parsed.toString(),sess.token);}catch(_){}
  var p=new URL(BASE+"/m3u8-proxy");p.searchParams.set("url",u);p.searchParams.set("_px","originless-2");p.searchParams.set("_provider",PROVIDER);
  if(route&&/^[a-z0-9_-]{1,64}$/i.test(route))p.searchParams.set("_route",route);
  if(h&&Object.keys(h).length)p.searchParams.set("headers",JSON.stringify(h));
  if(Number.isInteger(Number(slot)))p.searchParams.set("_isp",String(Number(slot)));
  p.searchParams.set("mz_lease",sess.token);return p.toString();
}
function relaySubtitle(raw,h,slot,sess){
  var u=clean(raw);if(!/^https?:\/\//i.test(u))return"";
  try{var parsed=new URL(u);if(/(^|\.)m-zone\.org$/i.test(parsed.hostname))return appendLease(u,sess.token);}catch(_){}
  var p=new URL(BASE+"/subtitle-proxy");p.searchParams.set("url",u);
  if(h&&Object.keys(h).length)p.searchParams.set("headers",JSON.stringify(h));
  if(Number.isInteger(Number(slot)))p.searchParams.set("_isp",String(Number(slot)));
  p.searchParams.set("mz_lease",sess.token);return p.toString();
}
function collectSubs(c,slot,sess){
  var src=[];["captions","subtitles","tracks"].forEach(function(k){if(Array.isArray(c&&c[k]))src=src.concat(c[k]);});
  var seen={},out=[];
  src.forEach(function(x){
    var raw=clean(x&&(x.url||x.file));if(!raw)return;
    var kind=clean(x&&x.kind).toLowerCase(),typ=clean(x&&(x.type||x.format)).toLowerCase();
    if(kind&&kind!=="subtitles"&&kind!=="captions"&&!/srt|vtt/.test(typ)&&!/\.(?:srt|vtt)(?:[?#]|$)/i.test(raw))return;
    var h=safeHeaders(x&&x.headers,c&&c.referer),u=relaySubtitle(raw,h,slot,sess);if(!u||seen[u])return;seen[u]=1;
    var lang=clean(x&&(x.language||x.lang||x.code||x.label||x.display))||"Subtitle";
    out.push({url:u,language:lang,name:lang+" ["+LABEL+"]"});
  });
  return out.slice(0,24);
}
function flattenMedia(c){
  var out=[];
  function add(x,quality){
    if(!x)return;
    if(typeof x==="string"){out.push({url:x,quality:quality});return;}
    if(typeof x!=="object")return;
    var u=clean(x.url||x.file||x.playlist);
    if(u)out.push({url:u,type:x.type||x.format,quality:x.quality||x.label||x.resolution||quality,headers:x.headers,referer:x.referer,routeKey:x.routeKey,bandwidth:x.bandwidth,maxHeight:x.maxHeight});
    ["sources","streams","variants"].forEach(function(k){if(Array.isArray(x[k]))x[k].forEach(function(v){add(v,quality);});});
    if(x.qualities&&typeof x.qualities==="object")Object.keys(x.qualities).forEach(function(k){add(x.qualities[k],k);});
  }
  add(c);var seen={};return out.filter(function(x){if(!/^https?:\/\//i.test(x.url)||seen[x.url])return false;seen[x.url]=1;return true;});
}
function formatOf(x){
  var t=clean(x.type).toLowerCase(),u=clean(x.url).toLowerCase();
  if(t==="dash"||t==="mpd"||/\.mpd(?:[?#]|$)/i.test(u))return"dash";
  if(t==="mp4"||t==="file"||/\.mp4(?:[?#]|$)/i.test(u))return"mp4";
  if(t==="hls"||/m3u8|mpegurl/i.test(t)||/\.m3u8(?:[?#]|$)/i.test(u)||/\/cf-master\.[^/?#]+\.txt(?:[?#]|$)/i.test(u))return"hls";
  return"";
}
function quality(v){
  var s=clean(v),m=s.match(/(2160|1440|1080|720|576|540|480|360)p?/i);if(m)return m[1]+"p";return"Auto";
}
function hlsQuality(body){
  var re=/RESOLUTION=\d+x(\d+)/ig,m,max=0;while((m=re.exec(String(body||"")))!==null)max=Math.max(max,Number(m[1])||0);
  return max>=2160?"2160p":max>=1440?"1440p":max>=1080?"1080p":max>=720?"720p":max>=480?"480p":max?"Auto":"Auto";
}
function firstHlsUri(body,base){
  var lines=String(body||"").split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
  for(var i=0;i<lines.length;i++){if(lines[i].charAt(0)!=="#"){try{return new URL(lines[i],base).toString();}catch(_){return"";}}}
  return"";
}
function validateHls(url){
  return timeout(fetch(url,{cache:"no-store"}),12000,"HLS").then(function(r){if(!r.ok)throw new Error("HLS HTTP "+r.status);var final=r.url||url;return r.text().then(function(b){return{body:b,base:final};});})
    .then(function(x){if(String(x.body||"").trim().indexOf("#EXTM3U")!==0)throw new Error("not HLS");var first=firstHlsUri(x.body,x.base);if(!first)throw new Error("HLS has no media URI");return timeout(fetch(first,{cache:"no-store",headers:{Range:"bytes=0-65535"}}),10000,"segment").then(function(r){if(!r.ok&&r.status!==206)throw new Error("segment HTTP "+r.status);var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();if(/text\/html|application\/json/.test(ct))throw new Error("segment is not video");return{url:url,type:"hls",quality:hlsQuality(x.body)};});});
}
function validateMp4(url,h){
  return timeout(fetch(url,{cache:"no-store",headers:Object.assign({},h||{},{"Range":"bytes=0-65535"})}),12000,"MP4").then(function(r){
    if(!(r.ok||r.status===206))throw new Error("MP4 HTTP "+r.status);var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
    if(/text\/html|application\/json/.test(ct))throw new Error("not media");return{url:url,type:"mp4",quality:"Auto"};
  });
}
function resolve(meta,id,type,season,episode,sess){
  var payload={codecCapabilities:caps(),type:type==="tv"?"tv":"movie",tmdbId:String(id),imdbId:meta.imdbId||"",title:meta.title||"",releaseYear:meta.releaseYear||0};
  if(type==="tv"){payload.season=String(Number(season||1));payload.episode=String(Number(episode||1));}
  var hh=baseHeaders({"Content-Type":"application/json","X-MZone-Playback-Lease":sess.token,"X-MZone-Relay-Affinity":"https://relay-a.m-zone.org"});if(sess.cookie)hh.Cookie=sess.cookie;
  return timeout(fetch(BASE+"/mplayer/"+PROVIDER+"/resolve",{method:"POST",cache:"no-store",credentials:"include",headers:hh,body:JSON.stringify(payload)}),20000,LABEL+" resolve")
    .then(function(r){return r.json().catch(function(){return{};}).then(function(j){if(!r.ok||j.success===false||!j.result)throw new Error(clean(j.error||j.message)||("resolver HTTP "+r.status));return j;});});
}
function makeRows(j,sess){
  var c=j.result||{},slot=j.residentialProxySlot,subs=collectSubs(c,slot,sess),items=flattenMedia(c).slice(0,8);
  return Promise.all(items.map(function(x,idx){
    var fmt=formatOf(x);if(!fmt)return Promise.resolve(null);
    var h=safeHeaders(x.headers||c.headers,x.referer||c.referer),route=x.routeKey||c.routeKey||"";
    if(fmt==="dash")return Promise.resolve(null);
    if(fmt==="hls"){
      var u=relayHls(x.url,h,route,slot,sess);
      return validateHls(u).then(function(v){var q=quality(x.maxHeight||x.quality);if(q==="Auto")q=v.quality;var n="NoctraTV · "+LABEL+" · "+(clean(j.server||c.server)||("source "+(idx+1)))+" · "+q;return{name:n,title:n,url:u,quality:q,type:"hls",provider:PLUGIN_ID,headers:{},subtitles:subs};}).catch(function(){return null;});
    }
    return validateMp4(x.url,h).then(function(v){var q=quality(x.maxHeight||x.quality);var n="NoctraTV · "+LABEL+" · "+(clean(j.server||c.server)||("source "+(idx+1)))+" · "+q;return{name:n,title:n,url:x.url,quality:q,type:"mp4",provider:PLUGIN_ID,headers:h,subtitles:subs};}).catch(function(){return null;});
  })).then(function(rows){var seen={};return rows.filter(function(x){if(!x||seen[x.url])return false;seen[x.url]=1;return true;});});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return Promise.all([tmdbMeta(tmdbId,mediaType),getSession()]).then(function(v){return resolve(v[0],tmdbId,mediaType,season,episode,v[1]).then(function(j){return makeRows(j,v[1]);});})
    .then(function(rows){console.log("[Noctra/"+LABEL+"] streams="+rows.length);return rows;})
    .catch(function(e){console.log("[Noctra/"+LABEL+"] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams,createSession:createSession};

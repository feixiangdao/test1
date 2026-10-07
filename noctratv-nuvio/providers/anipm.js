// NoctraTV · AniPM / Hoshi
// Current top-level MPlayer source. Uses NoctraTV metadata proxy and ephemeral MZone v2 playback session.
// No embedded TMDB key. Returns only validated HLS/DASH/MP4.

var PROVIDER="anipm";
var LABEL="AniPM / Hoshi";
var PLUGIN_ID="noctra-anipm";
var REFERER="https://noctratv.com/";
var BASE="https://api.m-zone.org";
var ORIGIN="https://noctratv.com";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var SESSION=null,SESSION_PROMISE=null;

function c(v){return v==null?"":String(v).trim();}
function wait(p,ms,n){return new Promise(function(ok,no){var d=false,t=setTimeout(function(){if(!d){d=true;no(new Error(n+" timeout"));}},ms);Promise.resolve(p).then(function(v){if(!d){d=true;clearTimeout(t);ok(v);}},function(e){if(!d){d=true;clearTimeout(t);no(e);}});});}
function b64(a){a=a instanceof Uint8Array?a:new Uint8Array(a||0);var s="";for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function rawSig(a){
  a=a instanceof Uint8Array?a:new Uint8Array(a||0);if(a.length===64)return a;
  if(a.length<8||a[0]!==48)throw new Error("ECDSA format");
  var p=1,l=a[p++];if(l&128){var n=l&127;l=0;while(n--)l=(l<<8)|a[p++];}
  if(a[p++]!==2)throw new Error("ECDSA r");var rl=a[p++],r=a.slice(p,p+rl);p+=rl;
  if(a[p++]!==2)throw new Error("ECDSA s");var sl=a[p++],s=a.slice(p,p+sl);
  while(r.length>32&&r[0]===0)r=r.slice(1);while(s.length>32&&s[0]===0)s=s.slice(1);
  var out=new Uint8Array(64);out.set(r,32-r.length);out.set(s,32+32-s.length);return out;
}
function hdr(x){var h={"User-Agent":UA,Origin:ORIGIN,Referer:ORIGIN+"/",Accept:"application/json,text/plain,*/*"};Object.keys(x||{}).forEach(function(k){h[k]=String(x[k]);});return h;}
function fp(){var n=typeof navigator!=="undefined"?navigator:{},s=typeof screen!=="undefined"?screen:{},tz="Asia/Shanghai";try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||tz;}catch(_){}
 return{webdriver:false,languages:Array.isArray(n.languages)?n.languages.slice(0,8):["en-US","en"],plugins:Math.min(100,n.plugins&&n.plugins.length?n.plugins.length:5),hardwareConcurrency:Number(n.hardwareConcurrency||8),deviceMemory:Number(n.deviceMemory||8),maxTouchPoints:Number(n.maxTouchPoints||5),platform:c(n.userAgentData&&n.userAgentData.platform)||c(n.platform)||"Android",brands:n.userAgentData&&Array.isArray(n.userAgentData.brands)?n.userAgentData.brands.slice(0,8):[{brand:"Chromium",version:"143"}],mobile:n.userAgentData?!!n.userAgentData.mobile:true,timezone:tz,screen:{width:Number(s.width||1080),height:Number(s.height||2400),colorDepth:Number(s.colorDepth||24),pixelRatio:Number(typeof devicePixelRatio!=="undefined"?devicePixelRatio:2.75)},visibilityState:typeof document!=="undefined"?c(document.visibilityState)||"visible":"visible"};}
function caps(){return{version:1,video:{avc:true,hevc:false,vp9:true,av1:false},audio:{aac:true,heaac:true,opus:true,ac3:false,eac3:false,mp3:true}};}
function goodSession(s){return!!(s&&s.token&&s.sessionId&&Number(s.expiresAt)>Date.now()+30000);}
function newSession(){
 if(!globalThis.crypto||!globalThis.crypto.subtle)return Promise.reject(new Error("WebCrypto unavailable"));
 var ch,kp;
 return wait(fetch(BASE+"/api/player/v2/challenge",{cache:"no-store",credentials:"include",headers:hdr()}),8000,"challenge")
 .then(function(r){if(!r.ok)throw new Error("challenge HTTP "+r.status);return r.json();})
 .then(function(j){if(!j||!j.challengeId||!j.nonce||!j.issuedAt)throw new Error("bad challenge");ch=j;return crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);})
 .then(function(k){kp=k;return Promise.all([crypto.subtle.exportKey("jwk",k.publicKey),crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},k.privateKey,new TextEncoder().encode(ch.challengeId+"."+ch.nonce+"."+ch.issuedAt))]);})
 .then(function(v){return wait(fetch(BASE+"/api/player/v2/session",{method:"POST",cache:"no-store",credentials:"include",headers:hdr({"Content-Type":"application/json"}),body:JSON.stringify({challengeId:ch.challengeId,nonce:ch.nonce,publicKey:v[0],signature:b64(rawSig(new Uint8Array(v[1]))),fingerprint:fp(),embedded:false,embedOrigin:"",sandboxed:false,turnstileToken:"",supportsEncryptedTransport:false,supportsEncryptedCapabilities:false,transportPublicKey:null,playerVersion:"mplayer-web-v2",playbackSessionVersion:2,capabilities:["hls","dash","codec-avc"]})}),10000,"session");})
 .then(function(r){return r.json().catch(function(){return{};}).then(function(j){if(r.status===428&&j.challengeRequired)throw new Error("Turnstile required");if(!r.ok||!j.token||!j.sessionId||!j.expiresAt)throw new Error(c(j.error)||("session HTTP "+r.status));return{token:String(j.token),sessionId:String(j.sessionId),expiresAt:Number(j.expiresAt)};});});
}
function session(){if(goodSession(SESSION))return Promise.resolve(SESSION);if(SESSION_PROMISE)return SESSION_PROMISE;SESSION_PROMISE=newSession().then(function(s){SESSION=s;return s;}).finally(function(){SESSION_PROMISE=null;});return SESSION_PROMISE;}
function meta(id,type){
 var t=type==="tv"?"tv":"movie",u=BASE+"/tmdb/"+t+"/"+encodeURIComponent(String(id))+"?language=en-US&append_to_response=external_ids";
 return wait(fetch(u,{cache:"no-store",headers:{Accept:"application/json","User-Agent":UA}}),8000,"metadata").then(function(r){if(!r.ok)throw new Error("metadata HTTP "+r.status);return r.json();}).then(function(j){var title=t==="tv"?(j.name||j.original_name||""):(j.title||j.original_title||""),date=t==="tv"?(j.first_air_date||""):(j.release_date||"");return{title:c(title),releaseYear:/^\d{4}/.test(date)?Number(date.slice(0,4)):0,imdbId:c(j.imdb_id||(j.external_ids&&j.external_ids.imdb_id))};});
}
function safeHeaders(o){var h={};Object.keys(o||{}).forEach(function(k){var v=c(o[k]);if(v&&!/^(?:host|connection|content-length|origin)$/i.test(k))h[k]=v;});if(!h.Referer&&!h.referer)h.Referer=REFERER;return h;}
function lease(u,t){try{var x=new URL(u,BASE);if(/(^|\.)m-zone\.org$/i.test(x.hostname)&&!x.searchParams.has("mz_lease"))x.searchParams.set("mz_lease",t);return x.toString();}catch(_){return u;}}
function proxy(raw,kind,h,slot,route,s){
 var u=c(raw);if(!u)return"";
 try{var x=new URL(u,BASE);if(/(^|\.)m-zone\.org$/i.test(x.hostname))return lease(x.toString(),s.token);}catch(_){}
 var path=kind==="dash"?"/dash-proxy":"/m3u8-proxy",p=new URL(BASE+path);p.searchParams.set("url",u);
 if(kind!=="dash"){p.searchParams.set("_px","originless-2");p.searchParams.set("_provider",PROVIDER);if(route&&/^[a-z0-9_-]{1,64}$/i.test(route))p.searchParams.set("_route",route);}
 if(h&&Object.keys(h).length)p.searchParams.set("headers",JSON.stringify(h));if(Number.isInteger(Number(slot)))p.searchParams.set("_isp",String(Number(slot)));p.searchParams.set("mz_lease",s.token);return p.toString();
}
function subProxy(raw,h,slot,s){var u=c(raw);if(!/^https?:\/\//i.test(u))return"";var p=new URL(BASE+"/subtitle-proxy");p.searchParams.set("url",u);if(h&&Object.keys(h).length)p.searchParams.set("headers",JSON.stringify(h));if(Number.isInteger(Number(slot)))p.searchParams.set("_isp",String(Number(slot)));p.searchParams.set("mz_lease",s.token);return p.toString();}
function subs(r,slot,s){var a=[];["tracks","captions","subtitles"].forEach(function(k){if(Array.isArray(r&&r[k]))a=a.concat(r[k]);});var seen={},out=[];a.forEach(function(x){var raw=c(x&&(x.url||x.file));if(!raw)return;var u=subProxy(raw,safeHeaders(x&&x.headers),slot,s);if(!u||seen[u])return;seen[u]=1;var l=c(x&&(x.language||x.lang||x.code||x.label||x.display))||"Subtitle";out.push({url:u,language:l,name:l+" ["+LABEL+"]"});});return out.slice(0,24);}
function flatten(r){var out=[];function add(v,q){if(!v)return;if(typeof v==="string"){out.push({url:v,quality:q});return;}if(typeof v!=="object")return;var u=c(v.url||v.file||v.playlist);if(u)out.push({url:u,type:v.type||v.format,quality:v.quality||v.label||v.resolution||q,headers:v.headers,referer:v.referer,routeKey:v.routeKey,maxHeight:v.maxHeight});["sources","streams","variants"].forEach(function(k){if(Array.isArray(v[k]))v[k].forEach(function(x){add(x,q);});});if(v.qualities&&typeof v.qualities==="object")Object.keys(v.qualities).forEach(function(k){add(v.qualities[k],k);});}add(r);var seen={};return out.filter(function(x){if(!/^https?:\/\//i.test(x.url)||seen[x.url])return false;seen[x.url]=1;return true;});}
function fmt(x){var t=c(x.type).toLowerCase(),u=c(x.url).toLowerCase();if(t==="dash"||t==="mpd"||/\.mpd(?:[?#]|$)/i.test(u))return"dash";if(t==="mp4"||t==="file"||/\.mp4(?:[?#]|$)/i.test(u))return"mp4";if(t==="hls"||/m3u8|mpegurl/i.test(t)||/\.m3u8(?:[?#]|$)/i.test(u)||/\/cf-master\.[^/?#]+\.txt(?:[?#]|$)/i.test(u))return"hls";return"";}
function q(v){var m=c(v).match(/(2160|1440|1080|720|576|540|480|360)p?/i);return m?m[1]+"p":"Auto";}
function first(body,base){var a=String(body||"").split(/\r?\n/);for(var i=0;i<a.length;i++){var x=a[i].trim();if(x&&x.charAt(0)!=="#"){try{return new URL(x,base).toString();}catch(_){return"";}}}return"";}
function hlsQ(body){var re=/RESOLUTION=\d+x(\d+)/ig,m,max=0;while((m=re.exec(String(body||"")))!==null)max=Math.max(max,Number(m[1])||0);return max>=2160?"2160p":max>=1440?"1440p":max>=1080?"1080p":max>=720?"720p":max>=480?"480p":"Auto";}
function verifyHls(u){return wait(fetch(u,{cache:"no-store"}),12000,"HLS").then(function(r){if(!r.ok)throw new Error("HLS HTTP "+r.status);var b=r.url||u;return r.text().then(function(t){return{t:t,b:b};});}).then(function(x){if(x.t.trim().indexOf("#EXTM3U")!==0)throw new Error("not HLS");var f=first(x.t,x.b);if(!f)throw new Error("empty HLS");return wait(fetch(f,{cache:"no-store",headers:{Range:"bytes=0-65535"}}),10000,"segment").then(function(r){if(!(r.ok||r.status===206))throw new Error("segment HTTP "+r.status);var ct=c(r.headers.get("content-type")).toLowerCase();if(/text\/html|application\/json/.test(ct))throw new Error("segment not media");return hlsQ(x.t);});});}
function verifyDash(u){return wait(fetch(u,{cache:"no-store"}),12000,"DASH").then(function(r){if(!r.ok)throw new Error("DASH HTTP "+r.status);return r.text();}).then(function(t){if(!/<MPD\b/i.test(t))throw new Error("not DASH");return"Auto";});}
function verifyMp4(u,h){return wait(fetch(u,{cache:"no-store",headers:Object.assign({},h,{Range:"bytes=0-65535"})}),12000,"MP4").then(function(r){if(!(r.ok||r.status===206))throw new Error("MP4 HTTP "+r.status);var ct=c(r.headers.get("content-type")).toLowerCase();if(/text\/html|application\/json/.test(ct))throw new Error("not media");return"Auto";});}
function resolve(m,id,type,season,episode,s){
 var b={codecCapabilities:caps(),type:type==="tv"?"tv":"movie",tmdbId:String(id),imdbId:m.imdbId||"",title:m.title||"",releaseYear:m.releaseYear||0};
 if(type==="tv"){b.season=String(Number(season||1));b.episode=String(Number(episode||1));}
 return wait(fetch(BASE+"/mplayer/"+PROVIDER+"/resolve",{method:"POST",cache:"no-store",credentials:"include",headers:hdr({"Content-Type":"application/json","X-MZone-Playback-Lease":s.token,"X-MZone-Relay-Affinity":"https://relay-a.m-zone.org"}),body:JSON.stringify(b)}),20000,LABEL+" resolver").then(function(r){return r.json().catch(function(){return{};}).then(function(j){if(!r.ok||!j||j.success===false||!j.result)throw new Error(c(j&&j.error)||("resolver HTTP "+r.status));return j;});});
}
function makeRow(u,quality,type,server,h,sb){var n="NoctraTV · "+LABEL+" · "+server+" · "+quality;return{name:n,title:n,url:u,quality:quality,type:type,provider:PLUGIN_ID,headers:h||{},subtitles:sb||[]};}
function convert(j,s){
 var r=j.result||{};if(r.inlineManifest)throw new Error("inline manifest has no stable Nuvio URL");
 var slot=j.residentialProxySlot,sb=subs(r,slot,s),items=flatten(r).slice(0,8);
 return Promise.all(items.map(function(x,i){var f=fmt(x);if(!f)return null;var h=safeHeaders(x.headers);if(x.referer)h.Referer=x.referer;var quality=q(x.maxHeight||x.quality),server=c(j.server||r.server)||("source "+(i+1)),u;
   if(f==="hls"){u=proxy(x.url,"hls",h,slot,x.routeKey||r.routeKey||"",s);return verifyHls(u).then(function(v){return makeRow(u,quality==="Auto"?v:quality,"hls",server,{},sb);}).catch(function(){return null;});}
   if(f==="dash"){u=proxy(x.url,"dash",h,slot,"",s);return verifyDash(u).then(function(v){return makeRow(u,quality==="Auto"?v:quality,"dash",server,{},sb);}).catch(function(){return null;});}
   return verifyMp4(x.url,h).then(function(v){return makeRow(x.url,quality==="Auto"?v:quality,"mp4",server,h,sb);}).catch(function(){return null;});
 })).then(function(a){var seen={};return a.filter(function(x){if(!x||seen[x.url])return false;seen[x.url]=1;return true;});});
}
function getStreams(id,type,season,episode){
 if(!id||(type!=="movie"&&type!=="tv"))return Promise.resolve([]);if(type==="tv"&&(!season||!episode))return Promise.resolve([]);
 return Promise.all([meta(id,type),session()]).then(function(v){return resolve(v[0],id,type,season,episode,v[1]).then(function(j){return convert(j,v[1]);});}).then(function(a){console.log("[Noctra/"+LABEL+"] streams="+a.length);return a;}).catch(function(e){console.log("[Noctra/"+LABEL+"] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

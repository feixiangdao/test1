// NoctraTV · Screenscape · awsind — direct Nxsha backend mapping.
// No iframe fallback; returns only direct HLS/MP4 media.

var BASES=["https://web.nxsha.app","https://nxsha.space"];
var PASS="S8x!Jk4ZP1uG8$my";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var TARGETS=[
  {provider:"awsind",label:"AwsPly"}
];

function clean(v){return v==null?"":String(v).trim()}
function cryptoJs(){
  try{if(globalThis.CryptoJS)return globalThis.CryptoJS}catch(_){}
  try{if(typeof require==="function")return require("crypto-js")}catch(_){}
  return null;
}
function toUrlSafe(b64){return String(b64||"").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function fromUrlSafe(s){
  var x=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  while(x.length%4)x+="=";
  return x;
}
function payload(obj){
  var o={};
  Object.keys(obj||{}).forEach(function(k){o[k]=obj[k]});
  o._req_ts=Date.now();
  o._req_salt=Math.random().toString(36).slice(2,12);
  return o;
}
function encodePayload(obj){
  var C=cryptoJs();
  if(!C)return Promise.reject(new Error("CryptoJS unavailable"));
  try{
    var enc=C.AES.encrypt(JSON.stringify(payload(obj)),PASS).toString();
    return Promise.resolve(toUrlSafe(enc));
  }catch(e){return Promise.reject(e)}
}
function decodeHash(hash){
  var C=cryptoJs();
  if(!C)return Promise.reject(new Error("CryptoJS unavailable"));
  try{
    var plain=C.AES.decrypt(fromUrlSafe(hash),PASS).toString(C.enc.Utf8);
    if(!plain)throw new Error("empty AES plaintext");
    var o=JSON.parse(plain);
    delete o._req_ts;delete o._req_salt;
    return Promise.resolve(o);
  }catch(e){return Promise.reject(e)}
}
function api(base,path,obj){
  return encodePayload(obj).then(function(q){
    return fetch(base+path+"?q="+encodeURIComponent(q),{
      headers:{"User-Agent":UA,"Accept":"application/json,*/*","Referer":base+"/"}
    });
  }).then(function(r){
    if(!r.ok)throw new Error(path+" HTTP "+r.status);
    return r.json();
  }).then(function(j){
    if(!j||!j._hash)throw new Error(path+" hash missing");
    return decodeHash(j._hash);
  });
}
function qLabel(s){
  var q=clean(s&&(s.quality||s.label));
  if(/4k|2160/i.test(q))return"4K";
  var m=q.match(/(1440|1080|720|480|360)/);
  return m?m[1]+"p":(q&&q!=="hguider"?q:"Auto");
}
function normalizeHeaders(base,h){
  var o={"User-Agent":UA,"Referer":base+"/"};
  if(h&&typeof h==="object")Object.keys(h).forEach(function(k){o[k]=String(h[k])});
  return o;
}
function playable(s){
  if(!s||s.isEmbed===true)return false;
  var typ=clean(s.type).toLowerCase(),u=clean(s.url||s.file);
  if(!/^https?:\/\//i.test(u)||typ==="embed")return false;
  return typ==="m3u8"||typ==="hls"||typ==="mp4"||
    /\.m3u8(?:[?#]|$)|\.mp4(?:[?#]|$)/i.test(u);
}
function queryTarget(base,target,tmdbId,mediaType,season,episode){
  var obj={
    ex_lang:false,
    provider:target.provider,
    tmdbId:String(tmdbId),
    imdb_id:"",
    type:mediaType==="tv"?"tv":"movie",
    season:mediaType==="tv"?Number(season||1):0,
    episode:mediaType==="tv"?Number(episode||1):0,
    method:"stream"
  };
  return api(base,"/api/sources",obj).then(function(j){
    var a=j&&Array.isArray(j.sources)?j.sources:[];
    return a.filter(playable).map(function(s){
      var u=clean(s.url||s.file),q=qLabel(s);
      var name="NoctraTV · Screenscape · awsind · "+q;
      return{
        name:name,title:name,url:u,quality:q,
        type:/m3u8|hls/i.test(clean(s.type)+" "+u)?"hls":"mp4",
        provider:"noctra-screenscape-awsind",
        headers:normalizeHeaders(base,s.headers),
        subtitles:[]
      };
    });
  }).catch(function(e){
    console.log("[NoctraTV/Screenscape/awsind] "+target.label+" "+base+" "+(e&&e.message?e.message:e));
    return[];
  });
}
function runBase(base,tmdbId,mediaType,season,episode){
  return Promise.all(TARGETS.map(function(t){
    return queryTarget(base,t,tmdbId,mediaType,season,episode);
  })).then(function(groups){
    var out=[],seen={};
    groups.forEach(function(g){g.forEach(function(x){
      if(x&&!seen[x.url]){seen[x.url]=1;out.push(x)}
    })});
    return out;
  });
}
function tryBase(i,tmdbId,mediaType,season,episode){
  if(i>=BASES.length)return Promise.resolve([]);
  return runBase(BASES[i],tmdbId,mediaType,season,episode).then(function(out){
    return out.length?out:tryBase(i+1,tmdbId,mediaType,season,episode);
  }).catch(function(){return tryBase(i+1,tmdbId,mediaType,season,episode)});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tryBase(0,tmdbId,mediaType,season,episode).then(function(out){
    console.log("[NoctraTV/Screenscape/awsind] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.error("[NoctraTV/Screenscape/awsind] "+(e&&e.message?e.message:e));
    return[];
  });
}

module.exports={
  getStreams:getStreams,
  encodePayload:encodePayload,
  decodeHash:decodeHash
};

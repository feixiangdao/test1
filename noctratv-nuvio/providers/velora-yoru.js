// NoctraTV · Velora · Yoru — current Videasy v2 direct resolver.
// Protocol: seed -> enc=2 provider payload -> local mvm1 PRNG/XOR decrypt.
// No iframe / WebView fallback.

var API="https://api.speedracelight.com";
var DB="https://db.speedracelight.com/3";
var PLAYER="https://player.videasy.to";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var F=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580];
var MAGIC=[109,118,109,49];

function clean(v){return v==null?"":String(v).trim();}
function isEvenTri(e){return ((e*(e+1))&1)===0;}
function isOddTri(e){return ((e*(e+1))&1)===1;}
function mix(e){e=e>>>0;e^=e>>>16;e=Math.imul(e,2246822507)>>>0;e^=e>>>13;e=Math.imul(e,3266489909)>>>0;return (e^(e>>>16))>>>0;}
function rotl(e,t){e=e>>>0;t&=31;if(!t)return e;return ((e<<t)|(e>>>(32-t)))>>>0;}
function fnv1a(s){var t=2166136261>>>0;for(var i=0;i<s.length;i++)t=Math.imul(t^s.charCodeAt(i),16777619)>>>0;return mix(t);}
function accSeed(s){var t=1732584193>>>0;for(var i=0;i<s.length;i++)t=rotl((t^Math.imul(s.charCodeAt(i),F[15&i]))>>>0,5);return mix(t);}
function rc4Sbox(s){var t=[],i,j=0,tmp;for(i=0;i<256;i++)t[i]=i;for(i=0;i<256;i++){j=(j+t[i]+s.charCodeAt(i%s.length))&255;tmp=t[i];t[i]=t[j];t[j]=tmp;}return t;}
function buildState(seed,mediaId){
  if(isOddTri(seed.length))return{S:rc4Sbox(seed),acc:accSeed(seed)};
  var s=new Array(61),a=mix((fnv1a(seed)^mix(((mediaId>>>0)^2654435769)>>>0))>>>0);
  for(var e=0;e<8;e++){
    if(isEvenTri(e)){var t=a%61;a=rotl((a+2654435769)>>>0,7+(7&e));s[t]=(a^mix(a))>>>0;a=mix((a+t)>>>0);}
    else s[e]=F[15&e];
  }
  return{S:s,acc:mix((2779096485^a)>>>0)};
}
function nextWord(state,counter){
  var r=state.S,acc=state.acc,n=acc%61,exists=(n in r),i=0-Number(exists),l=(r[n]||0)>>>0;
  var a=(l^Math.imul(2654435769,counter+1))>>>0;
  var d=(((acc^a)>>>0)|((acc&a&i)>>>0))>>>0;
  d=(rotl((d+acc)>>>0,31&n)^rotl(acc,31&Math.imul(n,7)))>>>0;
  acc=mix((d+2654435769)>>>0);r[n]=acc;state.acc=acc;return acc;
}
function b64Bytes(s){
  var x=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  while(x.length%4)x+="=";
  var bin=atob(x),out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
function utf8(bytes){
  if(typeof TextDecoder!=="undefined")return new TextDecoder("utf-8").decode(bytes);
  var s="";for(var i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);
  try{return decodeURIComponent(escape(s));}catch(_){return s;}
}
function decryptPayload(payload,seed,mediaId){
  var r=b64Bytes(payload),st=buildState(seed,mediaId),o=new Uint8Array(r.length),counter=0,e=0;
  while(e<o.length){
    var w=nextWord(st,counter++);
    o[e++]=w&255;if(e<o.length)o[e++]=(w>>>8)&255;if(e<o.length)o[e++]=(w>>>16)&255;if(e<o.length)o[e++]=(w>>>24)&255;
  }
  for(var i=0;i<r.length;i++)r[i]^=o[i];
  for(i=0;i<MAGIC.length;i++)if(r[i]!==MAGIC[i])throw new Error("bad seed/payload");
  return utf8(r.subarray(MAGIC.length));
}
function headers(){return{"User-Agent":UA,"Referer":PLAYER+"/","Origin":PLAYER,"Accept":"application/json, text/plain, */*"};}
function fetchJson(url){return fetch(url,{headers:headers()}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();});}
function meta(id,type){
  var t=type==="tv"?"tv":"movie";
  return fetchJson(DB+"/"+t+"/"+encodeURIComponent(String(id))+"?append_to_response=external_ids").then(function(d){
    var date=clean(t==="tv"?d.first_air_date:d.release_date);
    return{title:clean(t==="tv"?(d.name||d.original_name):(d.title||d.original_title)),year:date?date.slice(0,4):"",imdb:clean(d&&d.external_ids&&d.external_ids.imdb_id),type:t,totalSeasons:d&&d.number_of_seasons};
  });
}
function seed(mediaId){
  return fetchJson(API+"/seed?mediaId="+encodeURIComponent(String(mediaId))).then(function(j){
    var s=clean(j&&j.seed);if(!s)throw new Error("seed missing");return s;
  });
}
function providerUrl(id,m,season,episode,sd){
  var q=[
    "title="+encodeURIComponent(encodeURIComponent(m.title)),
    "mediaType="+encodeURIComponent(m.type),
    "year="+encodeURIComponent(m.year),
    "tmdbId="+encodeURIComponent(String(id)),
    "imdbId="+encodeURIComponent(m.imdb)
  ];
  if(m.type==="tv"){
    if(m.totalSeasons)q.push("totalSeasons="+encodeURIComponent(String(m.totalSeasons)));
    q.push("seasonId="+encodeURIComponent(String(season||1)));
    q.push("episodeId="+encodeURIComponent(String(episode||1)));
  }
  q.push("enc=2");
  q.push("seed="+encodeURIComponent(sd));
  return API+"/cdn/sources-with-title?"+q.join("&");
}
function fetchYoru(id,m,s,e,sd){
  return fetch(providerUrl(id,m,s,e,sd),{headers:headers()}).then(function(r){if(!r.ok)throw new Error("Yoru HTTP "+r.status);return r.text();}).then(function(t){
    var p=clean(t);if(p.charAt(0)==='"'&&p.charAt(p.length-1)==='"')p=JSON.parse(p);
    var dec=decryptPayload(p,sd,Number(id));
    return JSON.parse(dec);
  });
}
function qlabel(x){
  var q=clean(x&&x.quality),u=clean(x&&(x.url||x.file)),s=q+" "+u,m=s.match(/(2160|1440|1080|720|480|360)/);
  if(m)return m[1]==="2160"?"4K":m[1]+"p";
  return q||"Auto";
}
function getStreams(tmdbId,mediaType,season,episode){
  var m=null,sd="";
  return meta(tmdbId,mediaType).then(function(mm){m=mm;return seed(Number(tmdbId));}).then(function(s){sd=s;return fetchYoru(tmdbId,m,season,episode,sd);}).then(function(d){
    var a=d&&Array.isArray(d.sources)?d.sources:[],out=[],seen={};
    a.forEach(function(x){
      var u=clean(x&&(x.url||x.file));if(!/^https?:\/\//i.test(u)||seen[u])return;seen[u]=1;
      var q=qlabel(x),name="NoctraTV · Velora · Yoru · "+q;
      out.push({name:name,title:name,url:u,quality:q,provider:"noctra-velora-yoru",headers:{"User-Agent":UA,"Referer":PLAYER+"/","Origin":PLAYER},subtitles:[]});
    });
    console.log("[Noctra/Velora/Yoru] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){console.log("[Noctra/Velora/Yoru] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

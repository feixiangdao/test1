// NoctraTV · AniCine · VaPlayer — direct CinePro worker resolver.
// Current AniCine movie/TV flow: /v1/token -> Bearer -> per-title sources.
// Returns direct media only; no iframe fallback.

var BASES=["https://aniwish.dekhovo.workers.dev","https://api.anicine-embed.workers.dev"];
var BASE=BASES[0];
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var tokenCache="";
var tokenExp=0;

function clean(v){return v==null?"":String(v).trim();}
function qnum(q){var s=String(q||"").toLowerCase();if(/2160|4k/.test(s))return 2160;var m=s.match(/(1440|1080|720|480|360)/);return m?parseInt(m[1],10):0;}

function getToken(force){
  var now=Date.now();
  if(!force&&tokenCache&&tokenExp-now>60000)return Promise.resolve(tokenCache);
  return fetch(BASE+"/v1/token",{headers:{"User-Agent":UA,"Accept":"application/json, */*"}})
    .then(function(r){if(!r.ok)throw new Error("token HTTP "+r.status);return r.json();})
    .then(function(j){
      var t=clean(j&&j.token);if(!t)throw new Error("token missing");
      var exp=Number(j&&j.exp)||0;
      if(exp>0&&exp<1e12)exp*=1000;
      tokenCache=t;tokenExp=exp||Date.now()+30*60*1000;return t;
    });
}
function pathFor(id,type,s,e){
  id=encodeURIComponent(String(id));
  if(type==="tv")return "/v1/tv/"+id+"/seasons/"+encodeURIComponent(String(s||1))+"/episodes/"+encodeURIComponent(String(e||1));
  return "/v1/movies/"+id;
}
function getJson(path,attempt){
  attempt=attempt||0;
  return getToken(false).then(function(t){
    return fetch(BASE+path,{headers:{"User-Agent":UA,"Accept":"application/json, */*","Authorization":"Bearer "+t}});
  }).then(function(r){
    if((r.status===401||r.status===403)&&attempt<1){
      tokenCache="";tokenExp=0;
      return getToken(true).then(function(){return getJson(path,attempt+1);});
    }
    if(!r.ok)throw new Error("worker HTTP "+r.status);
    return r.json();
  });
}
function quality(row){
  var q=clean(row&&row.quality)||"Auto";
  if(/4k|2160/i.test(q))return"4K";
  var m=q.match(/(1440|1080|720|480|360)/);if(m)return m[1]+"p";
  var u=clean(row&&row.url),m2=u.match(/(2160|1440|1080|720|480|360)p/i);
  return m2?(m2[1]==="2160"?"4K":m2[1]+"p"):q;
}
function subtitles(data){
  var a=data&&Array.isArray(data.subtitles)?data.subtitles:[],out=[];
  a.forEach(function(s){
    var u=clean(s&&(s.url||s.file));if(!/^https?:\/\//i.test(u))return;
    out.push({url:u,lang:clean(s.label||s.language||"en"),language:clean(s.label||s.language||"en"),title:clean(s.label||s.language||"Subtitle")});
  });
  return out;
}
function resolveOnBase(base,tmdbId,mediaType,season,episode){
  BASE=base;tokenCache="";tokenExp=0;
  return getJson(pathFor(tmdbId,mediaType,season,episode),0);
}
function getStreams(tmdbId,mediaType,season,episode){
  var bi=0;
  function load(){
    if(bi>=BASES.length)throw new Error("all workers failed");
    var b=BASES[bi++];
    return resolveOnBase(b,tmdbId,mediaType,season,episode).catch(function(e){
      console.log("[Noctra/AniCine/VaPlayer] "+b+" "+(e&&e.message?e.message:e));
      return load();
    });
  }
  return load().then(function(data){
    var a=data&&Array.isArray(data.sources)?data.sources:[],subs=subtitles(data),seen={},out=[];
    a.forEach(function(row){
      var p=clean(row&&row.provider&&(row.provider.id||row.provider.name)).toLowerCase();
      var pn=clean(row&&row.provider&&row.provider.name);
      // Noctra current label is AniCine · VaPlayer: retain that exact backend only.
      if(p&&p.indexOf("vaplayer")<0&&pn.toLowerCase().indexOf("vaplayer")<0)return;
      var u=clean(row&&row.url);if(!/^https?:\/\//i.test(u)||seen[u])return;seen[u]=1;
      var q=quality(row),kind=clean(row&&row.type).toLowerCase()||(/\.mpd(?:\?|$)/i.test(u)?"dash":/\.mp4(?:\?|$)/i.test(u)?"mp4":"hls");
      out.push({
        name:"NoctraTV · AniCine · VaPlayer",
        title:"AniCine · VaPlayer · "+q,
        url:u,quality:q,provider:"noctra-anicine-vaplayer",
        headers:{"User-Agent":UA},subtitles:subs,type:kind
      });
    });
    out.sort(function(a,b){return qnum(b.quality)-qnum(a.quality);});
    console.log("[Noctra/AniCine/VaPlayer] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/AniCine/VaPlayer] "+(e&&e.message?e.message:e));return[];
  });
}
module.exports={getStreams:getStreams};

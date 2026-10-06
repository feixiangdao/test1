// NoctraTV · Bingr · Corvus — direct Bingr API resolver.
// Maps the current noctratv.com labels with publicly verified Bingr server ids:
//   Bingr · Aphelion -> s40
//   Bingr · Bastion  -> s62
//   Bingr · Corvus   -> s61
//   Bingr · Edmunds  -> s3
//
// No iframe fallback. The provider asks Bingr's JSON API for direct sources and
// returns only URLs that can be preflighted as HLS or MP4.

var ORIGIN="https://bingr.one";
var API="https://api.bingr.one/api";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var SERVERS=[
  {key:"corvus",srv:"s61",name:"Corvus"}
]

function clean(v){return v==null?"":String(v).trim()}
function headers(extra){
  var h={"User-Agent":UA,"Accept":"application/json, text/plain, */*","Origin":ORIGIN,"Referer":ORIGIN+"/"};
  Object.keys(extra||{}).forEach(function(k){h[k]=String(extra[k])});
  return h;
}
function timers(){
  try{return typeof setTimeout==="function"&&typeof clearTimeout==="function"}catch(_){return false}
}
function withTimeout(p,ms,label){
  if(!timers())return p;
  return new Promise(function(resolve,reject){
    var done=false,t=setTimeout(function(){if(done)return;done=true;reject(new Error(label+" timeout"))},ms);
    Promise.resolve(p).then(function(v){if(done)return;done=true;clearTimeout(t);resolve(v)},function(e){if(done)return;done=true;clearTimeout(t);reject(e)});
  });
}
function jsonFetch(url,opt,ms){
  return withTimeout(fetch(url,opt||{}),ms||10000,"fetch").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  });
}
function details(tmdbId,type){
  return jsonFetch(API+"/details/"+(type==="tv"?"tv":"movie")+"/"+encodeURIComponent(String(tmdbId)),{headers:headers()},7000)
    .catch(function(){return{}});
}
function qlabel(raw,url){
  var s=(clean(raw)+" "+clean(url)).toLowerCase();
  if(/2160|4k/.test(s))return"4K";
  var m=s.match(/(1440|1080|720|480|360)\s*p?/);
  return m?m[1]+"p":"Auto";
}
function isHls(src,u){
  var t=clean(src&&src.type).toLowerCase();
  return /mpegurl|hls|m3u8/.test(t)||/\.m3u8(?:[?#]|$)/i.test(u)||/manifest\?url=/i.test(u);
}
function isMp4(src,u){
  var t=clean(src&&src.type).toLowerCase();
  return /mp4|video/.test(t)||/\.mp4(?:[?#]|$)/i.test(u);
}
function streamHeaders(src){
  var h={"User-Agent":UA,"Referer":ORIGIN+"/"};
  var up=src&&src.headers&&typeof src.headers==="object"?src.headers:{};
  Object.keys(up).forEach(function(k){var v=clean(up[k]);if(v)h[k]=v});
  return h;
}
function verify(src){
  var u=clean(src&&src.url);
  if(!/^https?:\/\//i.test(u))return Promise.resolve(null);
  var h=streamHeaders(src),hls=isHls(src,u),mp4=isMp4(src,u);
  if(!hls&&!mp4)return Promise.resolve(null);
  if(hls){
    return withTimeout(fetch(u,{headers:h}),7000,"hls").then(function(r){
      if(!r.ok)return null;
      return r.text().then(function(t){return /^#EXTM3U/m.test(String(t||""))?{url:u,type:"hls",headers:h}:null});
    }).catch(function(){return null});
  }
  var hh={};Object.keys(h).forEach(function(k){hh[k]=h[k]});hh.Range="bytes=0-511";
  return withTimeout(fetch(u,{headers:hh}),7000,"mp4").then(function(r){
    return (r.ok||r.status===206)?{url:u,type:"mp4",headers:h}:null;
  }).catch(function(){return null});
}
function bodyFor(server,tmdbId,type,season,episode,d){
  var title=clean(d&&(d.title||d.name));
  var year=clean(d&&(d.year||d.release_year||d.first_air_year));
  var imdb=clean(d&&(d.imdb_id||d.imdbId));
  var q={title:title,year:year,imdbId:imdb,imdb_id:imdb};
  if(type==="tv"){q.season=String(season||1);q.episode=String(episode||1)}
  return{srv:server.srv,t:type==="tv"?"tv":"movie",id:String(tmdbId),imdbId:imdb||undefined,query:q};
}
function resolveOne(server,tmdbId,type,season,episode,d){
  function normal(){
    var body=bodyFor(server,tmdbId,type,season,episode,d);
    return jsonFetch(API+"/stream",{
      method:"POST",
      headers:headers({"Content-Type":"application/json"}),
      body:JSON.stringify(body)
    },12000);
  }
  var req=(server.srv==="s40"&&type==="tv")
    ?jsonFetch(API+"/stream/aphelion-tv/"+encodeURIComponent(String(tmdbId))+"/"+Number(season||1)+"/"+Number(episode||1),{headers:headers()},10000)
      .then(function(j){return j&&j.sources&&j.sources.length?j:normal()})
      .catch(normal)
    :normal();

  return req.then(function(j){
    var a=j&&Array.isArray(j.sources)?j.sources:[];
    var tasks=a.slice(0,5).map(function(src){
      return verify(src).then(function(v){
        if(!v)return null;
        var q=qlabel(src.quality||src.label||src.name,v.url);
        var name="NoctraTV · Bingr · Corvus · "+q;
        var subs=(j&&Array.isArray(j.subtitles)?j.subtitles:[]).filter(function(x){return x&&x.url}).slice(0,10).map(function(x){
          var lang=clean(x.lang||x.label)||"und";
          return{url:x.url,language:lang,name:(clean(x.label)||lang)+" [Bingr]"};
        });
        return{name:name,title:name,url:v.url,quality:q,type:v.type,provider:"noctra-bingr-corvus",headers:v.headers,subtitles:subs};
      });
    });
    return Promise.all(tasks).then(function(rows){
      for(var i=0;i<rows.length;i++)if(rows[i])return rows[i];
      return null;
    });
  }).catch(function(e){
    console.log("[NoctraTV/Bingr/Corvus] "+server.name+" "+(e&&e.message?e.message:e));
    return null;
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return details(tmdbId,mediaType).then(function(d){
    return Promise.all(SERVERS.map(function(s){return resolveOne(s,tmdbId,mediaType,season,episode,d)}));
  }).then(function(rows){
    var out=[],seen={};
    rows.forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x)}});
    console.log("[NoctraTV/Bingr/Corvus] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[NoctraTV/Bingr/Corvus] "+(e&&e.message?e.message:e));return[];
  });
}
module.exports={getStreams:getStreams};

// NoctraTV · Cinevaro · Videasy — current 2026 local resolver
// Current backend: api.speedracelight.com + per-title seed + enc=2.
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var TMDB_BASE="https://api.themoviedb.org/3";
var BASE="https://api.speedracelight.com";
var DEC="https://enc-dec.app/api/dec-videasy";
var PLAYER="https://player.videasy.to";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var SERVERS=[
  {name:"Neon",path:"vsrc"},
  {name:"Breach",path:"m4uhd"},
  {name:"Yoru",path:"cdn",moviesOnly:true},
  {name:"Vyse",path:"hdmovie"},
  {name:"Raze",path:"superflix"},
  {name:"Omen",path:"lamovie"}
];
function clean(v){return v==null?"":String(v).trim()}
function req(url,opt){return fetch(url,opt||{}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r})}
function headers(extra){var h={"User-Agent":UA,"Accept":"application/json, text/plain, */*","Origin":PLAYER,"Referer":PLAYER+"/"};Object.keys(extra||{}).forEach(function(k){h[k]=extra[k]});return h}
function tmdbInfo(id,type){
  var t=type==="tv"?"tv":"movie";
  var u=TMDB_BASE+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(TMDB_KEY)+"&append_to_response=external_ids";
  return req(u,{headers:{"User-Agent":UA,Accept:"application/json"}}).then(function(r){return r.json()}).then(function(d){
    var date=clean(t==="tv"?d.first_air_date:d.release_date);
    return{title:clean(t==="tv"?d.name:d.title),year:date?date.slice(0,4):"",imdb:clean(d&&d.external_ids&&d.external_ids.imdb_id),type:t};
  });
}
function seed(id){
  return req(BASE+"/seed?mediaId="+encodeURIComponent(String(id)),{headers:headers()}).then(function(r){return r.json()}).then(function(j){return clean(j&&j.seed)});
}
function doubleEnc(s){return encodeURIComponent(encodeURIComponent(String(s||"")))}
function build(server,meta,id,season,episode,sd){
  var u=BASE+"/"+server.path+"/sources-with-title?title="+doubleEnc(meta.title)+
    "&mediaType="+encodeURIComponent(meta.type)+
    "&year="+encodeURIComponent(meta.year)+
    "&tmdbId="+encodeURIComponent(String(id))+
    "&imdbId="+encodeURIComponent(meta.imdb)+
    "&enc=2&seed="+encodeURIComponent(sd);
  if(meta.type==="tv")u+="&seasonId="+encodeURIComponent(String(season||1))+"&episodeId="+encodeURIComponent(String(episode||1));
  return u;
}
function decrypt(text,id,sd){
  return req(DEC,{method:"POST",headers:headers({"Content-Type":"application/json"}),body:JSON.stringify({text:text,id:String(id),seed:sd})})
    .then(function(r){return r.json()})
    .then(function(j){
      var x=j&&j.result!=null?j.result:j;
      if(typeof x==="string"){try{x=JSON.parse(x)}catch(_){}}
      return x&&Array.isArray(x.sources)?x.sources:[];
    });
}
function quality(src){
  var s=clean(src&&src.quality||src&&src.label||src&&src.url);
  if(/4k|2160/i.test(s))return"4K";
  var m=s.match(/(1440|1080|720|480|360)/);return m?m[1]+"p":"Auto";
}
function one(server,meta,id,season,episode,sd){
  if(meta.type==="tv"&&server.moviesOnly)return Promise.resolve([]);
  return req(build(server,meta,id,season,episode,sd),{headers:headers()})
    .then(function(r){return r.text()})
    .then(function(t){t=clean(t);if(t.length<20||t.charAt(0)==="<")throw new Error("empty/envelope");return decrypt(t,id,sd)})
    .then(function(list){
      return(list||[]).map(function(src){
        var u=clean(src&&(src.url||src.file));if(!/^https?:\/\//i.test(u))return null;
        var q=quality(src);
        return{name:"NoctraTV · Cinevaro · Videasy",title:"Cinevaro · Videasy · "+server.name+" · "+q,
          url:u,quality:q,provider:"noctra-cinevaro-videasy",
          headers:{"User-Agent":UA,"Referer":PLAYER+"/","Origin":PLAYER},subtitles:[]};
      }).filter(Boolean);
    }).catch(function(e){console.log("[NoctraTV/Cinevaro/Videasy] "+server.name+" "+(e&&e.message?e.message:e));return[]});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  return tmdbInfo(tmdbId,mediaType).then(function(meta){
    return seed(tmdbId).then(function(sd){if(!sd)throw new Error("seed missing");return Promise.all(SERVERS.map(function(s){return one(s,meta,tmdbId,season,episode,sd)}))});
  }).then(function(groups){
    var out=[],seen={};(groups||[]).forEach(function(g){(g||[]).forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x)}})});
    console.log("[NoctraTV/Cinevaro/Videasy] streams="+out.length);return out;
  }).catch(function(e){console.error("[NoctraTV/Cinevaro/Videasy] "+(e&&e.message?e.message:e));return[]});
}
module.exports={getStreams:getStreams};

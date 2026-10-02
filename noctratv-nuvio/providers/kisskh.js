// NoctraTV · KissKH — strict local resolver, no wrong-title fallback
var MAIN="https://kisskh.ovh";
var KEY_API="https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec?id=";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="1c29a5198ee1854bd5eb45dbe8d17d92";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function norm(v){return clean(v).toLowerCase().normalize?clean(v).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim():clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function meta(id,type){
  var t=type==="tv"?"tv":"movie";
  return fetch(TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+TMDB_KEY,{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
    .then(function(d){
      return{
        type:t,
        title:clean(t==="tv"?d.name:d.title),
        original:clean(t==="tv"?d.original_name:d.original_title),
        year:clean(t==="tv"?d.first_air_date:d.release_date).slice(0,4)
      };
    });
}
function findDrama(m){
  var q=m.title||m.original;
  return fetch(MAIN+"/api/DramaList/Search?q="+encodeURIComponent(q)+"&type=0",{headers:{"User-Agent":UA,"Referer":MAIN+"/","Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("search HTTP "+r.status);return r.json();})
    .then(function(list){
      if(!Array.isArray(list))return null;
      var targets=[norm(m.title),norm(m.original)].filter(Boolean);
      var exact=list.filter(function(x){return targets.indexOf(norm(x&&x.title))>=0;});
      if(exact.length===1)return exact[0];
      if(exact.length>1){
        var byYear=exact.find(function(x){
          var y=clean(x&&(x.releaseDate||x.year||x.date));
          return m.year&&y.indexOf(m.year)>=0;
        });
        return byYear||exact[0];
      }
      return null;
    });
}
function detail(id){
  return fetch(MAIN+"/api/DramaList/Drama/"+encodeURIComponent(String(id))+"?isq=false",{headers:{"User-Agent":UA,"Referer":MAIN+"/","Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("detail HTTP "+r.status);return r.json();});
}
function episodeId(d,type,episode){
  var eps=d&&Array.isArray(d.episodes)?d.episodes:[];
  if(!eps.length)return "";
  if(type==="movie")return clean(eps[eps.length-1]&&eps[eps.length-1].id);
  var n=Number(episode||1);
  var x=eps.find(function(ep){return Number(ep&&ep.number)===n;});
  return clean(x&&x.id);
}
function getKey(id){
  return fetch(KEY_API+encodeURIComponent(String(id))+"&version=2.8.10",{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("key HTTP "+r.status);return r.json();})
    .then(function(d){return clean(d&&d.key);});
}
function source(id,key){
  var u=MAIN+"/api/DramaList/Episode/"+encodeURIComponent(String(id))+".png?err=false&ts=&time=&kkey="+encodeURIComponent(key);
  return fetch(u,{headers:{"User-Agent":UA,"Origin":MAIN,"Referer":MAIN+"/","Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("source HTTP "+r.status);return r.json();});
}
function collect(s){
  var out=[],seen={};
  [s&&s.Video,s&&s.ThirdParty].forEach(function(v){
    var u=clean(v);if(!/^https?:\/\//i.test(u)||seen[u])return;seen[u]=1;
    var fmt=/\.m3u8(?:[?#]|$)/i.test(u)?"HLS":(/\.mp4(?:[?#]|$)/i.test(u)?"MP4":"Direct");
    out.push({
      name:"NoctraTV · KissKH",
      title:"KissKH · "+fmt,
      url:u,
      quality:"Auto",
      provider:"noctra-kisskh",
      headers:{"User-Agent":UA,"Origin":MAIN,"Referer":MAIN+"/"},
      subtitles:[]
    });
  });
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  return meta(tmdbId,mediaType)
    .then(function(m){return findDrama(m).then(function(hit){if(!hit)throw new Error("strict title miss");return{m:m,id:hit.id};});})
    .then(function(x){return detail(x.id).then(function(d){var id=episodeId(d,x.m.type,episode);if(!id)throw new Error("episode missing");return id;});})
    .then(function(id){return getKey(id).then(function(k){if(!k)throw new Error("key missing");return source(id,k);});})
    .then(collect)
    .then(function(out){console.log("[NoctraTV/KissKH] streams="+out.length);return out;})
    .catch(function(e){console.log("[NoctraTV/KissKH] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

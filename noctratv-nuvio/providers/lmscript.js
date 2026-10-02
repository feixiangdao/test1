// NoctraTV · LMScript — direct local API resolver
var BASE="https://lmscript.xyz";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function norm(v){return clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function getJson(url){
  return fetch(url,{headers:{"User-Agent":UA,"Accept":"application/json","Referer":BASE+"/","Origin":BASE}})
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();});
}
function meta(id,type){
  var t=type==="tv"?"tv":"movie";
  return fetch(TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+TMDB_KEY,{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
    .then(function(d){
      var date=clean(t==="tv"?d.first_air_date:d.release_date);
      return{type:t,title:clean(t==="tv"?d.name:d.title),year:Number(date.slice(0,4)||0)};
    });
}
function search(m){
  var route=m.type==="tv"?"/v1/shows":"/v1/movies";
  var url=BASE+route+"?filters%5Bq%5D="+encodeURIComponent(m.title);
  return getJson(url).then(function(d){
    var a=d&&Array.isArray(d.items)?d.items:[];
    return a.find(function(x){return norm(x&&x.title)===norm(m.title)&&(!m.year||!Number(x.year)||Number(x.year)===m.year);})||null;
  });
}
function targetId(m,res,season,episode){
  if(m.type==="movie")return Promise.resolve(clean(res&&res.id_movie));
  var id=clean(res&&res.id_show);if(!id)return Promise.resolve("");
  return getJson(BASE+"/v1/shows?expand=episodes&id="+encodeURIComponent(id)).then(function(d){
    var a=d&&Array.isArray(d.episodes)?d.episodes:[];
    var x=a.find(function(v){return Number(v&&v.season)===Number(season||1)&&Number(v&&v.episode)===Number(episode||1);});
    return clean(x&&x.id);
  });
}
function qlabel(k){
  var s=clean(k);var m=s.match(/(2160|1080|720|480|360|240|144)/);
  return m?(m[1]==="2160"?"4K":m[1]+"p"):(s||"Auto");
}
function view(m,id){
  var route=m.type==="tv"?"/v1/episodes/view":"/v1/movies/view";
  return getJson(BASE+route+"?expand=streams%2Csubtitles&id="+encodeURIComponent(id));
}
function collect(d){
  var streams=d&&d.streams&&typeof d.streams==="object"?d.streams:{};
  var order=["auto","2160p","2160","1080p","1080","720p","720","480p","480","360p","360","240p","240","144p","144"];
  var rawSubs=d&&Array.isArray(d.subtitles)?d.subtitles:[];
  var mapped=rawSubs.map(function(s){
    var u=clean(s&&s.url);if(u&&u.charAt(0)==="/")u=BASE+u;
    if(!/^https?:\/\//i.test(u))return null;
    var lang=clean(s&&s.language)||"Subtitle";
    return{url:u,language:lang,name:lang+" [LMScript]"};
  }).filter(Boolean);
  var preferred=[],rest=[];
  mapped.forEach(function(s){
    var l=clean(s.language).toLowerCase();
    if(/^zh|chinese|english|^en$/.test(l))preferred.push(s);else rest.push(s);
  });
  var subs=preferred.concat(rest).slice(0,24);
  var seen={},out=[];
  order.forEach(function(k){
    var u=clean(streams[k]);if(!/^https?:\/\//i.test(u)||seen[u])return;seen[u]=1;
    var q=qlabel(k);
    out.push({
      name:"NoctraTV · LMScript",
      title:"LMScript · "+q,
      url:u,
      quality:q,
      provider:"noctra-lmscript",
      headers:{"User-Agent":UA,"Referer":BASE+"/","Origin":BASE},
      subtitles:subs
    });
  });
  Object.keys(streams).forEach(function(k){
    var u=clean(streams[k]);if(!/^https?:\/\//i.test(u)||seen[u])return;seen[u]=1;
    var q=qlabel(k);
    out.push({name:"NoctraTV · LMScript",title:"LMScript · "+q,url:u,quality:q,provider:"noctra-lmscript",headers:{"User-Agent":UA,"Referer":BASE+"/","Origin":BASE},subtitles:subs});
  });
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  return meta(tmdbId,mediaType)
    .then(function(m){return search(m).then(function(r){if(!r)throw new Error("strict title/year miss");return targetId(m,r,season,episode).then(function(id){if(!id)throw new Error("media id missing");return{m:m,id:id};});});})
    .then(function(x){return view(x.m,x.id);})
    .then(collect)
    .then(function(out){console.log("[NoctraTV/LMScript] streams="+out.length);return out;})
    .catch(function(e){console.log("[NoctraTV/LMScript] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

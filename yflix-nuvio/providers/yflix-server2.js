// YFlix Local for Nuvio
// v0.4.0 - YFlix Server 2 / VidBolt Quasar strict-match build
//
// Fixes:
// - Removed opaque Orion movie fallback (could not verify title identity).
// - Removed stale Callisto route.
// - Uses current Quasar backend.
// - Only returns HLS rows whose source name proves the requested title/year.
// - TV rows must also prove the requested SxxExx.
//
// Nuvio/Hermes friendly: Promise chains, no async/await.

var SCRAPER_BASE="https://scraper.vidbolt.xyz";
var TMDB_BASE="https://api.themoviedb.org/3";
var DEFAULT_TMDB_API_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var DIAG=[];

function clean(v){return v==null?"":String(v).trim();}
function diag(msg){msg=clean(msg).replace(/\s+/g," ").slice(0,180);if(msg&&DIAG.indexOf(msg)<0)DIAG.push(msg);}
function statusRows(){
  var a=DIAG.slice(-4);
  if(!a.length)a=["No trusted stream returned"];
  return a.map(function(msg,i){
    var n="YFlix · S2 · DIAG "+(i+1)+" · "+msg;
    return{name:n,title:n,url:"about:error",quality:"Status",type:"diagnostic",provider:"yflix-server2",headers:{},subtitles:[]};
  });
}
function settings(){try{return(typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS)||{};}catch(_){return{};}}
function tmdbKey(){
  var s=settings(),k=clean(s.tmdbApiKey);
  if(k)return k;
  try{k=clean(typeof globalThis!=="undefined"&&globalThis.TMDB_API_KEY);if(k)return k;}catch(_){}
  return DEFAULT_TMDB_API_KEY;
}
function fetchJson(url,opt){
  opt=opt||{};
  try{opt.skipSizeCheck=true;}catch(_){}
  return fetch(url,opt).then(function(r){
    if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"no-response")+(r&&r.statusText?(" · "+r.statusText):""));
    return r.json();
  });
}
function getTmdbInfo(tmdbId,mediaType){
  var type=mediaType==="tv"?"tv":"movie";
  var u=TMDB_BASE+"/"+type+"/"+encodeURIComponent(String(tmdbId))+
    "?api_key="+encodeURIComponent(tmdbKey())+
    "&language=en-US&append_to_response=external_ids";
  return fetchJson(u,{headers:{"Accept":"application/json","User-Agent":UA}})
    .then(function(d){
      var title=clean(d.title||d.name||d.original_title||d.original_name);
      var date=clean(d.release_date||d.first_air_date);
      var year=parseInt(date.slice(0,4),10)||0;
      var imdb=clean(d.imdb_id||(d.external_ids&&d.external_ids.imdb_id));
      if(!title)throw new Error("TMDB title missing");
      if(!imdb)throw new Error("TMDB IMDb id missing");
      return{title:title,year:year,imdbId:imdb,tmdbId:String(tmdbId)};
    });
}
function stripUnsafeHeaders(src){
  var out={},h=src&&typeof src==="object"?src:{};
  Object.keys(h).forEach(function(k){
    var lk=String(k).toLowerCase();
    if(lk==="range"||lk==="connection"||lk==="accept-encoding"||lk==="host"||lk==="content-length")return;
    var v=clean(h[k]);if(v)out[k]=v;
  });
  if(!out["User-Agent"]&&!out["user-agent"])out["User-Agent"]=UA;
  return out;
}
function subtitleRows(list){
  var out=[],seen={};
  (Array.isArray(list)?list:[]).forEach(function(s,i){
    if(!s||typeof s!=="object")return;
    var u=clean(s.url);
    if(!/^https?:\/\//i.test(u)||seen[u])return;
    seen[u]=1;
    out.push({
      url:u,
      language:clean(s.lang||s.language||s.code)||"und",
      name:clean(s.label||s.name||s.language||s.lang)||("Subtitle "+(i+1))
    });
  });
  return out;
}
function compact(s){
  return clean(s).toLowerCase().replace(/[^a-z0-9]+/g,"");
}
function pad2(n){n=parseInt(n,10)||0;return n<10?"0"+n:String(n);}
function trustedName(row,info,mediaType,season,episode){
  var raw=clean(row&&row.name);
  if(!raw)return false;

  var n=compact(raw),t=compact(info&&info.title);
  if(!t||n.indexOf(t)<0)return false;

  if(info.year&&raw.indexOf(String(info.year))<0)return false;

  if(mediaType==="tv"){
    var marker="s"+pad2(season)+"e"+pad2(episode);
    if(n.indexOf(marker)<0)return false;
  }
  return true;
}
function isHls(row){
  var t=clean(row&&row.type).toLowerCase();
  var u=clean(row&&row.url).toLowerCase();
  return t==="m3u8"||t==="hls"||u.indexOf(".m3u8")>=0;
}
function qualityOf(row){
  var q=clean(row&&row.quality)||"Auto";
  if(/^\d+$/.test(q))q+="p";
  return q;
}
function normalizeQuasar(j,info,mediaType,season,episode){
  var rows=j&&Array.isArray(j.sources)?j.sources:[];
  var subs=subtitleRows(j&&j.subtitles);
  var out=[],seen={};

  rows.forEach(function(row){
    if(!row||typeof row!=="object")return;
    if(!trustedName(row,info,mediaType,season,episode))return;
    if(!isHls(row))return;

    var u=clean(row.url);
    if(!/^https?:\/\//i.test(u)||seen[u])return;
    seen[u]=1;

    var lang=clean(row.language)||"Original";
    var q=qualityOf(row);
    var name="YFlix · S2 · Quasar · "+lang+" · "+q;

    out.push({
      name:name,
      title:name,
      url:u,
      quality:q,
      type:"hls",
      provider:"yflix-server2",
      headers:stripUnsafeHeaders(row.headers),
      subtitles:subs,
      _rank:(parseInt(q,10)||0)
    });
  });

  out.sort(function(a,b){return(b._rank||0)-(a._rank||0);});
  out.forEach(function(x){try{delete x._rank;}catch(_){}});
  return out;
}
function callQuasar(info,mediaType,season,episode){
  var kind=mediaType==="tv"?"tv":"movie";
  var q=[];
  q.push("tmdbId="+encodeURIComponent(info.tmdbId));
  q.push("imdbId="+encodeURIComponent(info.imdbId));
  q.push("title="+encodeURIComponent(info.title));
  if(info.year)q.push("year="+encodeURIComponent(String(info.year)));
  if(mediaType==="tv"){
    q.push("season="+encodeURIComponent(String(season)));
    q.push("episode="+encodeURIComponent(String(episode)));
  }
  var u=SCRAPER_BASE+"/scrape/Quasar/"+kind+"/"+encodeURIComponent(info.imdbId)+"?"+q.join("&");

  return fetchJson(u,{
    headers:{
      "Accept":"application/json",
      "User-Agent":UA,
      "Referer":"https://vidbolt.xyz/"
    }
  }).then(function(j){
    var out=normalizeQuasar(j,info,mediaType,season,episode);
    if(!out.length)diag("Quasar · no title-verified HLS");
    return out;
  }).catch(function(e){
    var m=e&&e.message?e.message:e;
    diag("Quasar · "+m);
    return[];
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  DIAG=[];
  if(!tmdbId){diag("missing TMDB id");return Promise.resolve(statusRows());}
  mediaType=mediaType==="tv"?"tv":"movie";
  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;
  if(mediaType==="tv"&&(!season||!episode)){diag("TV missing season/episode");return Promise.resolve(statusRows());}

  return getTmdbInfo(String(tmdbId),mediaType)
    .then(function(info){return callQuasar(info,mediaType,season,episode);})
    .then(function(rows){
      if(!rows||!rows.length)return statusRows();
      return rows;
    })
    .catch(function(e){
      var m=e&&e.message?e.message:e;
      diag("TMDB/runtime · "+m);
      return statusRows();
    });
}
function onSettings(){
  return[
    {type:"header",label:"YFlix Local · Server 2"},
    {type:"info",label:"VidBolt/Quasar 严格匹配版：只返回能同时证明正确片名、年份（剧集还需匹配 SxxExx）的 HLS；不可验证的 Orion/Vidlink/VaPlayer/MKV 路线已过滤。"},
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"用于取得英文片名、年份和 IMDb ID。留空使用备用 Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

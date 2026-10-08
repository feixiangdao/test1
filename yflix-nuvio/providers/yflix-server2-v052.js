// YFlix Local for Nuvio
// v0.5.2 - YFlix Server 2 / VidBolt stable-TV build
//
// Current VidBolt status:
// - Movie: no verified playable source at the moment.
// - TV: Quasar still returns Vidlink MP4; 480p/360p are currently stable.
// - 1080p Vidlink is intentionally skipped because current Range probes time out.
// - Expired signed HLS, broken proxies and opaque sources are never exposed.
//
// React Native / Hermes friendly: Promise chains, no async/await.

var SCRAPER_BASE="https://scraper.vidbolt.xyz";
var TMDB_BASE="https://api.themoviedb.org/3";
var DEFAULT_TMDB_API_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
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
function safeHeaders(src){
  var out={},h=src&&typeof src==="object"?src:{};
  Object.keys(h).forEach(function(k){
    var lk=String(k).toLowerCase();
    if(lk==="range"||lk==="connection"||lk==="accept-encoding"||lk==="host"||lk==="content-length")return;
    var v=clean(h[k]);if(v)out[k]=v;
  });
  if(!out["User-Agent"]&&!out["user-agent"])out["User-Agent"]=UA;
  return out;
}
function getTvInfo(tmdbId){
  var u=TMDB_BASE+"/tv/"+encodeURIComponent(String(tmdbId))+
    "?api_key="+encodeURIComponent(tmdbKey())+
    "&language=en-US&append_to_response=external_ids";
  return fetchJson(u,{headers:{"Accept":"application/json","User-Agent":UA}})
    .then(function(d){
      var imdb=clean(d&&d.external_ids&&d.external_ids.imdb_id);
      if(!imdb)throw new Error("TMDB IMDb id missing");
      return{tmdbId:String(tmdbId),imdbId:imdb};
    });
}
function qualityRank(q){
  var m=String(q||"").match(/(1080|720|480|360|240)/);
  return m?parseInt(m[1],10):0;
}
function probeMp4(row){
  var h=safeHeaders(row.headers);
  h["Range"]="bytes=0-0";
  return fetch(row.url,{headers:h,skipSizeCheck:true})
    .then(function(r){
      if(!r)return null;
      var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
      if(Number(r.status)!==206)return null;
      if(ct&&ct.indexOf("video/")<0&&ct.indexOf("application/octet-stream")<0)return null;
      return row;
    })
    .catch(function(){return null;});
}
function normalizeTvCandidates(j){
  var rows=j&&Array.isArray(j.sources)?j.sources:[];
  var out=[];
  rows.forEach(function(row){
    if(!row||typeof row!=="object")return;
    var name=clean(row.name);
    var m=name.match(/^Vidlink\s*-\s*(480p|360p)$/i);
    if(!m)return;
    var u=clean(row.url);
    if(!/^https?:\/\//i.test(u))return;
    out.push({
      name:"YFlix · S2 · Vidlink · "+m[1].toLowerCase(),
      title:"YFlix · S2 · Vidlink · "+m[1].toLowerCase(),
      url:u,
      quality:m[1].toLowerCase(),
      type:"mp4",
      provider:"yflix-server2",
      headers:safeHeaders(row.headers),
      subtitles:[],
      _rank:qualityRank(m[1])
    });
  });
  out.sort(function(a,b){return(b._rank||0)-(a._rank||0);});
  return out;
}
function callQuasarTv(info,season,episode){
  var u=SCRAPER_BASE+"/scrape/Quasar/tv/"+encodeURIComponent(info.imdbId)+
    "?tmdbId="+encodeURIComponent(info.tmdbId)+
    "&season="+encodeURIComponent(String(season))+
    "&episode="+encodeURIComponent(String(episode));

  return fetchJson(u,{
    headers:{
      "Accept":"application/json",
      "User-Agent":UA,
      "Referer":"https://vidbolt.xyz/"
    }
  }).then(function(j){
    var rows=normalizeTvCandidates(j);
    if(!rows.length)return[];
    return Promise.all(rows.map(probeMp4)).then(function(all){
      var seen={},out=[];
      all.forEach(function(x){
        if(!x||!x.url||seen[x.url])return;
        seen[x.url]=1;
        try{delete x._rank;}catch(_){}
        out.push(x);
      });
      return out;
    });
  }).catch(function(){return[];});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  mediaType=mediaType==="tv"?"tv":"movie";

  // Current VidBolt movie sources are either expired, dead, or unverifiable.
  // Hide S2 for movies rather than expose broken/wrong streams.
  if(mediaType!=="tv")return Promise.resolve([]);

  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;
  if(!season||!episode)return Promise.resolve([]);

  return getTvInfo(String(tmdbId))
    .then(function(info){return callQuasarTv(info,season,episode);})
    .catch(function(){return[];});
}
function onSettings(){
  return[
    {type:"header",label:"YFlix Local · Server 2"},
    {type:"info",label:"VidBolt 稳定版：当前电影端无可靠可播源，因此自动隐藏；剧集只保留已验证的 Vidlink 480p/360p MP4。过期 HLS、失效代理和超时 1080p 不显示。"},
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"用于取得剧集 IMDb ID。留空使用备用 Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

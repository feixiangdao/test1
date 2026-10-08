// YFlix Local for Nuvio
// v0.5.0 - YFlix Server 4 / FilmU Videasy identity-checked build
//
// Current YFlix S4 iframe:
//   https://embed.filmu.in/movie/{tmdb}
//   https://embed.filmu.in/tv/{tmdb}/{season}/{episode}
//
// Singularity was removed after it returned a playable but wrong-title movie.
// This build follows FilmU's current Box/Videasy extractor and binds every
// request to TMDB + IMDb + title + year (+ season/episode for TV).
// Before exposing streams, one HLS playlist is duration-checked against TMDB.

var FILMU="https://embed.filmu.in";
var BOX="https://box.filmu.in";
var BOX_KEY="09eb429913afb6b1cc90f23746f41fb3279aed77726c625c40672b81444c0bac";
var TMDB="https://api.themoviedb.org/3";
var DEFAULT_TMDB_API_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var DIAG=[];

function clean(v){return v==null?"":String(v).trim();}
function diag(msg){msg=clean(msg).replace(/\s+/g," ").slice(0,180);if(msg&&DIAG.indexOf(msg)<0)DIAG.push(msg);}
function statusRows(){
  var a=DIAG.slice(-3);
  if(!a.length)a=["No verified stream returned"];
  return a.map(function(msg,i){
    var n="YFlix · S4 · DIAG "+(i+1)+" · "+msg;
    return{name:n,title:n,url:"about:error",quality:"Status",type:"diagnostic",provider:"yflix-server4",headers:{},subtitles:[]};
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
function pageReferer(tmdbId,mediaType,season,episode){
  if(mediaType==="tv"){
    return FILMU+"/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season))+"/"+encodeURIComponent(String(episode));
  }
  return FILMU+"/movie/"+encodeURIComponent(String(tmdbId));
}
function getTmdbInfo(tmdbId,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie";
  var u=TMDB+"/"+type+"/"+encodeURIComponent(String(tmdbId))+
    "?api_key="+encodeURIComponent(tmdbKey())+
    "&language=en-US&append_to_response=external_ids";
  return fetchJson(u,{headers:{"Accept":"application/json","User-Agent":UA}})
    .then(function(d){
      var title=clean(d.title||d.name||d.original_title||d.original_name);
      var date=clean(d.release_date||d.first_air_date);
      var year=parseInt(date.slice(0,4),10)||0;
      var imdb=clean(d.imdb_id||(d.external_ids&&d.external_ids.imdb_id));
      var runtime=parseFloat(d.runtime)||0;
      if(!title)throw new Error("TMDB title missing");
      var info={title:title,year:year,imdbId:imdb,tmdbId:String(tmdbId),runtime:runtime};

      if(mediaType!=="tv")return info;
      var ep=TMDB+"/tv/"+encodeURIComponent(String(tmdbId))+
        "/season/"+encodeURIComponent(String(season))+
        "/episode/"+encodeURIComponent(String(episode))+
        "?api_key="+encodeURIComponent(tmdbKey())+"&language=en-US";
      return fetchJson(ep,{headers:{"Accept":"application/json","User-Agent":UA}})
        .then(function(e){
          info.runtime=parseFloat(e&&e.runtime)||0;
          return info;
        })
        .catch(function(){return info;});
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
function absUrl(base,ref){
  ref=clean(ref);
  if(/^https?:\/\//i.test(ref))return ref;
  try{return new URL(ref,base).toString();}catch(_){}
  if(ref.charAt(0)==="/"){
    var m=String(base).match(/^(https?:\/\/[^/]+)/i);
    return m?m[1]+ref:ref;
  }
  return String(base).replace(/[^/]*(?:\?.*)?$/,"")+ref;
}
function subtitleRows(list){
  var out=[],seen={};
  (Array.isArray(list)?list:[]).forEach(function(s,i){
    if(!s||typeof s!=="object")return;
    var u=clean(s.url);
    if(!u)return;
    if(u.charAt(0)==="/")u=BOX+u;
    if(!/^https?:\/\//i.test(u)||seen[u])return;
    seen[u]=1;
    out.push({
      url:u,
      language:clean(s.lang||s.language||s.code)||"und",
      name:clean(s.label||s.name||s.lang||s.language)||("Subtitle "+(i+1))
    });
  });
  return out;
}
function qualityOf(row){
  var q=clean(row&&row.quality)||"Auto";
  if(/^\d+$/.test(q))q+="p";
  return q;
}
function qualityRank(q){
  var m=String(q||"").match(/(2160|1440|1080|720|480|360|240)/);
  return m?parseInt(m[1],10):0;
}
function normalizeVideasy(j){
  var rows=j&&Array.isArray(j.sources)?j.sources:[];
  var subs=subtitleRows(j&&j.subtitles);
  var out=[],seen={};
  rows.forEach(function(row){
    if(!row||typeof row!=="object")return;
    var u=clean(row.url);
    var typ=clean(row.type).toLowerCase();
    if(!/^https?:\/\//i.test(u))return;
    if(typ!=="m3u8"&&typ!=="hls"&&u.toLowerCase().indexOf(".m3u8")<0)return;
    if(seen[u])return;
    seen[u]=1;
    var q=qualityOf(row);
    var n="YFlix · S4 · Videasy · "+q;
    out.push({
      name:n,title:n,url:u,quality:q,type:"hls",
      provider:"yflix-server4",
      headers:safeHeaders(row.headers),
      subtitles:subs,
      _rank:qualityRank(q)
    });
  });
  out.sort(function(a,b){return(b._rank||0)-(a._rank||0);});
  out.forEach(function(x){try{delete x._rank;}catch(_){}});
  return out;
}
function durationFromText(text){
  var re=/#EXTINF:([0-9.]+)/g,m,total=0,count=0;
  text=String(text||"");
  while((m=re.exec(text))){
    total+=parseFloat(m[1])||0;
    count++;
  }
  return count?{seconds:total,count:count}:null;
}
function firstMediaLine(text){
  var lines=String(text||"").replace(/\r/g,"").split("\n");
  for(var i=0;i<lines.length;i++){
    var s=clean(lines[i]);
    if(s&&s.charAt(0)!=="#")return s;
  }
  return "";
}
function readHlsDuration(url,headers,depth){
  depth=depth||0;
  if(depth>2)return Promise.reject(new Error("HLS nesting too deep"));
  return fetch(url,{headers:headers||{}})
    .then(function(r){
      if(!r||!r.ok)throw new Error("HLS HTTP "+(r?r.status:"no-response"));
      return r.text();
    })
    .then(function(t){
      t=String(t||"");
      if(t.indexOf("#EXTM3U")!==0)throw new Error("not HLS");
      var d=durationFromText(t);
      if(d)return d;
      var next=firstMediaLine(t);
      if(!next)throw new Error("empty HLS");
      return readHlsDuration(absUrl(url,next),headers,depth+1);
    });
}
function runtimeMatches(expectedMin,actualSec){
  expectedMin=parseFloat(expectedMin)||0;
  actualSec=parseFloat(actualSec)||0;
  if(!expectedMin||!actualSec)return true;
  var actualMin=actualSec/60;
  var tol=Math.max(7,expectedMin*0.20);
  return Math.abs(actualMin-expectedMin)<=tol;
}
function verifyIdentity(rows,info){
  if(!rows||!rows.length)return Promise.resolve([]);
  var probe=rows[0];
  for(var i=0;i<rows.length;i++){
    if(String(rows[i].quality).indexOf("1080")>=0){probe=rows[i];break;}
  }
  return readHlsDuration(probe.url,probe.headers,0)
    .then(function(d){
      var actual=d&&d.seconds?d.seconds:0;
      if(info.runtime&&!runtimeMatches(info.runtime,actual)){
        diag("Videasy · runtime mismatch · TMDB "+Math.round(info.runtime)+"m vs HLS "+Math.round(actual/60)+"m");
        return[];
      }
      return rows;
    })
    .catch(function(e){
      diag("Videasy · HLS verify failed · "+(e&&e.message?e.message:e));
      return[];
    });
}
function callVideasy(info,mediaType,season,episode){
  var kind=mediaType==="tv"?"tv":"movie";
  var id=clean(info.imdbId)||String(info.tmdbId);
  var q=[];
  q.push("title="+encodeURIComponent(info.title));
  q.push("tmdbId="+encodeURIComponent(info.tmdbId));
  if(info.imdbId)q.push("imdbId="+encodeURIComponent(info.imdbId));
  if(info.year)q.push("year="+encodeURIComponent(String(info.year)));
  if(mediaType==="tv"){
    q.push("season="+encodeURIComponent(String(season)));
    q.push("episode="+encodeURIComponent(String(episode)));
  }
  var u=BOX+"/scrape/Videasy/"+kind+"/"+encodeURIComponent(id)+"?"+q.join("&");
  return fetchJson(u,{
    headers:{
      "x-api-key":BOX_KEY,
      "Accept":"application/json",
      "User-Agent":UA,
      "Referer":pageReferer(info.tmdbId,mediaType,season,episode)
    }
  }).then(function(j){
    var rows=normalizeVideasy(j);
    if(!rows.length){diag("Videasy · 0 HLS");return[];}
    return verifyIdentity(rows,info);
  }).catch(function(e){
    diag("Videasy · "+(e&&e.message?e.message:e));
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

  return getTmdbInfo(String(tmdbId),mediaType,season,episode)
    .then(function(info){return callVideasy(info,mediaType,season,episode);})
    .then(function(rows){return rows&&rows.length?rows:statusRows();})
    .catch(function(e){
      diag("TMDB/runtime · "+(e&&e.message?e.message:e));
      return statusRows();
    });
}
function onSettings(){
  return[
    {type:"header",label:"YFlix Local · Server 4"},
    {type:"info",label:"FilmU/Videasy 身份校验版：请求同时绑定 TMDB、IMDb、片名、年份和集数；返回前还会用 HLS 总时长与 TMDB 正片/单集时长比对，避免“能播但播错片”。"},
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"用于取得标题、IMDb ID 和正片/单集时长。留空使用备用 Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

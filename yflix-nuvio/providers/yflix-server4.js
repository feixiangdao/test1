// YFlix Local for Nuvio
// v0.3.2 - YFlix Server 4 / FilmU
//
// Current YFlix S4 iframe:
//   https://embed.filmu.in/movie/{tmdb}
//   https://embed.filmu.in/tv/{tmdb}/{season}/{episode}
//
// Verified paths kept here:
//   - Pulsar / Allmovieland: multi-audio HLS through FilmU proxy
//   - Singularity: direct 1080p HLS fallback, verified for movie + TV
//
// S3 is intentionally not represented by a fake/dead provider.

var FILMU = "https://embed.filmu.in";
var FILMU_PROXY = "https://api.filmu.in";
var TMDB = "https://api.themoviedb.org/3";
var DEFAULT_TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var DIAG=[];
function diag(msg){msg=clean(msg).replace(/\s+/g," ").slice(0,160);if(msg&&DIAG.indexOf(msg)<0)DIAG.push(msg);}
function statusRows(){var a=DIAG.slice(-4);if(!a.length)a=["No stream returned"];return a.map(function(msg,i){var n="YFlix · S4 · DIAG "+(i+1)+" · "+msg;return{name:n,title:n,url:"about:error",quality:"Status",type:"diagnostic",provider:"yflix-server4",headers:{},subtitles:[]};});}

function clean(v){ return v == null ? "" : String(v).trim(); }

function settings(){
  try { return (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) || {}; }
  catch(_) { return {}; }
}

function tmdbKey(){
  var s=settings(), k=clean(s.tmdbApiKey);
  if(k) return k;
  try{
    k=clean(typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY);
    if(k) return k;
  }catch(_){}
  return DEFAULT_TMDB_API_KEY;
}

function apiHeaders(tmdbId, mediaType, season, episode){
  var ref;
  if(mediaType === "tv"){
    ref=FILMU+"/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season||1))+"/"+encodeURIComponent(String(episode||1));
  }else{
    ref=FILMU+"/movie/"+encodeURIComponent(String(tmdbId));
  }
  return {
    "User-Agent":UA,
    "Accept":"application/json, text/plain, */*",
    "Origin":FILMU,
    "Referer":ref,
    "Sec-Fetch-Site":"same-origin",
    "Sec-Fetch-Mode":"cors",
    "Sec-Fetch-Dest":"empty"
  };
}

function playbackHeaders(){
  return {
    "User-Agent":UA,
    "Origin":FILMU,
    "Referer":FILMU+"/"
  };
}

function fetchJson(url, opt){
  opt=opt||{};
  try{ opt.skipSizeCheck=true; }catch(_){}
  return fetch(url,opt).then(function(r){
    if(!r || !r.ok) throw new Error("HTTP "+(r?r.status:"no-response"));
    return r.json();
  });
}

function getTmdbInfo(tmdbId, mediaType){
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
      if(!title) throw new Error("TMDB title missing");
      return {title:title,year:year,imdbId:imdb,tmdbId:String(tmdbId)};
    });
}

// ASCII Base64. The Pulsar path is ASCII because title is encodeURIComponent'd.
function b64Ascii(s){
  s=String(s||"");
  var chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out="",i=0,c1,c2,c3,e1,e2,e3,e4;
  while(i<s.length){
    c1=s.charCodeAt(i++)&255;
    c2=i<s.length?s.charCodeAt(i++):NaN;
    c3=i<s.length?s.charCodeAt(i++):NaN;
    e1=c1>>2;
    e2=((c1&3)<<4)|((isNaN(c2)?0:c2)>>4);
    e3=isNaN(c2)?64:(((c2&15)<<2)|((isNaN(c3)?0:c3)>>6));
    e4=isNaN(c3)?64:(c3&63);
    out+=chars.charAt(e1)+chars.charAt(e2)+(e3===64?"=":chars.charAt(e3))+(e4===64?"=":chars.charAt(e4));
  }
  return out;
}

function qualityOf(x){
  var q=clean(x&&x.quality)||"Auto";
  if(/^\d+$/.test(q)) return q+"p";
  return q;
}

function subtitleRows(list){
  var out=[],seen={};
  (Array.isArray(list)?list:[]).forEach(function(s,i){
    if(!s||typeof s!=="object") return;
    var u=clean(s.url);
    if(!/^https?:\/\//i.test(u)||seen[u]) return;
    seen[u]=1;
    var lang=clean(s.lang||s.language||s.code)||"und";
    var name=clean(s.label||s.name||s.lang||s.language)||("Subtitle "+(i+1));
    out.push({url:u,language:lang,name:name});
  });
  return out;
}

function labelLanguage(row){
  var n=clean(row&&(row.name||row.label||row.language||row.lang));
  if(!n) return "";
  n=n.replace(/^Allmovieland\s*[•·:-]?\s*/i,"").trim();
  return n;
}

function normalizePulsar(j){
  var rows=j&&Array.isArray(j.sources)?j.sources:[];
  var subs=subtitleRows(j&&j.subtitles);
  var out=[],seen={};
  rows.forEach(function(x){
    if(!x||typeof x!=="object") return;
    var url=clean(x.url);
    if(!url) return;
    if(url.charAt(0)==="/") url=FILMU_PROXY+url;
    if(!/^https?:\/\//i.test(url)||seen[url]) return;
    seen[url]=1;
    var q=qualityOf(x);
    var lang=labelLanguage(x)||"Multi";
    var name="YFlix · S4 · Pulsar · "+lang+" · "+q;
    out.push({
      name:name,
      title:name,
      url:url,
      quality:q,
      type:"hls",
      provider:"yflix-server4",
      headers:playbackHeaders(),
      subtitles:subs,
      _rank:30000+(parseInt(q,10)||0)
    });
  });
  return out;
}

function normalizeSingularity(j){
  var rows=[];
  if(j&&Array.isArray(j.sources)) rows=rows.concat(j.sources);
  if(j&&j.url) rows.push({
    url:(j.multilingual&&j.multilingual_url)||j.url,
    quality:j.quality||"1080p",
    type:"m3u8"
  });
  if(!rows.length && j&&j.m3u8_path){
    var base=clean(j._base);
    var p=clean(j.m3u8_path);
    if(/^https?:\/\//i.test(p)) rows.push({url:p,quality:"1080p",type:"m3u8"});
    else if(base) rows.push({url:base.replace(/\/$/,"")+"/"+p.replace(/^\//,""),quality:"1080p",type:"m3u8"});
  }

  var out=[],seen={};
  rows.forEach(function(x){
    var url=clean(x&&x.url);
    if(!/^https?:\/\//i.test(url)||seen[url]) return;
    seen[url]=1;
    var q=qualityOf(x);
    var name="YFlix · S4 · Singularity · "+q;
    out.push({
      name:name,
      title:name,
      url:url,
      quality:q,
      type:"hls",
      provider:"yflix-server4",
      headers:{"User-Agent":UA},
      subtitles:subtitleRows((x&&x.subtitles)||(j&&j.subtitles)),
      _rank:20000+(parseInt(q,10)||0)
    });
  });
  return out;
}

function callSingularity(tmdbId,mediaType,season,episode){
  var u;
  if(mediaType==="tv"){
    u=FILMU+"/api/singularity-tv?tmdb="+encodeURIComponent(String(tmdbId))+
      "&s="+encodeURIComponent(String(season||1))+
      "&e="+encodeURIComponent(String(episode||1));
  }else{
    u=FILMU+"/api/singularity-movie?id="+encodeURIComponent(String(tmdbId));
  }
  return fetchJson(u,{headers:apiHeaders(tmdbId,mediaType,season,episode)})
    .then(normalizeSingularity)
    .catch(function(e){
      var m=(e&&e.message?e.message:e);console.warn("[YFlix S4] Singularity "+m);diag("Singularity · "+m);
      return [];
    });
}

function callPulsar(info,mediaType,season,episode){
  if(!info||!info.imdbId||!info.title) return Promise.resolve([]);

  var kind=mediaType==="tv"?"tv":"movie";
  var path="/scrape/Allmovieland/"+kind+"/"+encodeURIComponent(info.imdbId)+
    "?tmdbId="+encodeURIComponent(info.tmdbId)+
    "&title="+encodeURIComponent(info.title);
  if(info.year) path+="&year="+encodeURIComponent(String(info.year));
  if(mediaType==="tv"){
    path+="&season="+encodeURIComponent(String(season||1))+
      "&episode="+encodeURIComponent(String(episode||1));
  }

  var u=FILMU+"/api/proxy?b64path="+encodeURIComponent(b64Ascii(path));
  return fetchJson(u,{headers:apiHeaders(info.tmdbId,mediaType,season,episode)})
    .then(normalizePulsar)
    .catch(function(e){
      var m=(e&&e.message?e.message:e);console.warn("[YFlix S4] Pulsar "+m);diag("Pulsar · "+m);
      return [];
    });
}

function dedupeSort(rows){
  var out=[],seen={};
  (rows||[]).forEach(function(x){
    if(!x||!x.url||seen[x.url]) return;
    seen[x.url]=1;
    out.push(x);
  });
  out.sort(function(a,b){return (b._rank||0)-(a._rank||0);});
  out.forEach(function(x){try{delete x._rank;}catch(_){}});
  return out;
}

function getStreams(tmdbId,mediaType,season,episode){
  DIAG=[];
  if(!tmdbId){diag("missing TMDB id");return Promise.resolve(statusRows());}
  mediaType=mediaType==="tv"?"tv":"movie";
  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;
  if(mediaType==="tv"&&(!season||!episode)){diag("TV missing season/episode");return Promise.resolve(statusRows());}

  var singular=callSingularity(String(tmdbId),mediaType,season,episode);
  var pulsar=getTmdbInfo(String(tmdbId),mediaType)
    .then(function(info){return callPulsar(info,mediaType,season,episode);})
    .catch(function(e){
      var m=(e&&e.message?e.message:e);console.warn("[YFlix S4] TMDB/Pulsar "+m);diag("TMDB/Pulsar · "+m);
      return [];
    });

  return Promise.all([pulsar,singular]).then(function(all){
    var p=all[0]||[], s=all[1]||[];

    // Movie Pulsar is the useful multi-audio path and avoids duplicating the
    // same Singularity/Orion movie URL already exposed by S2.
    var chosen;
    if(mediaType==="movie" && p.length) chosen=p;
    else chosen=p.concat(s);

    var out=dedupeSort(chosen);
    console.log("[YFlix S4] tmdb="+tmdbId+" type="+mediaType+" pulsar="+p.length+" singularity="+s.length+" out="+out.length);
    if(!out.length){diag(mediaType+" · 0 playable streams");return statusRows();}
    return out;
  }).catch(function(e){
    var m=(e&&e.message?e.message:e);console.error("[YFlix S4] "+m);diag("runtime · "+m);
    return statusRows();
  });
}

function onSettings(){
  return [
    {type:"header",label:"YFlix Local · Server 4"},
    {
      type:"info",
      label:"解析 YFlix 的 FilmU（Multi Audio）线路。电影优先 Pulsar 多语言 HLS；剧集同时使用可用 Pulsar 与 Singularity 1080p。"
    },
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"Pulsar 需要标题/年份/IMDb ID；留空使用公共备用 Key。Singularity 不依赖此设置。",
      defaultValue:"",
      isPassword:true
    }
  ];
}

module.exports={getStreams:getStreams,onSettings:onSettings};

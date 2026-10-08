// YFlix Local for Nuvio
// v0.5.1 - YFlix Server 2 / VidBolt live-source build
//
// Mirrors VidBolt's current Quasar resolver:
//   /scrape/Quasar/{movie|tv}/{imdb}?tmdbId=...
//
// HLS rows are opened before display. Direct-file rows are probed with a
// 1-byte Range request and are returned only on HTTP 206.
// This intentionally hides broken/expired cards instead of rendering DIAG
// items that look like playable streams.

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
      if(!title||!imdb)throw new Error("TMDB metadata incomplete");
      return{title:title,year:year,imdbId:imdb,tmdbId:String(tmdbId)};
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
function probeHeaders(src){
  var out=safeHeaders(src);
  out["Range"]="bytes=0-0";
  return out;
}
function compact(s){return clean(s).toLowerCase().replace(/[^a-z0-9]+/g,"");}
function pad2(n){n=parseInt(n,10)||0;return n<10?"0"+n:String(n);}
function nameMatchesIdentity(row,info,mediaType,season,episode){
  var raw=clean(row&&row.name);
  if(!raw)return false;
  var n=compact(raw),title=compact(info.title);
  if(!title||n.indexOf(title)<0)return false;
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
function qualityRank(q){
  var m=String(q||"").match(/(2160|1440|1080|720|480|360|240)/);
  return m?parseInt(m[1],10):0;
}
function expiryMs(url){
  var m=String(url||"").match(/[?&]expire=(\d{10,13})(?:&|$)/i);
  if(!m)return 0;
  var n=parseInt(m[1],10)||0;
  return n>20000000000?n:n*1000;
}
function probeHls(row){
  var exp=expiryMs(row.url);
  if(exp&&exp<=Date.now()+60000)return Promise.resolve(null);
  return fetch(row.url,{headers:row.headers||{}})
    .then(function(r){
      if(!r||!r.ok)return null;
      return r.text().then(function(t){
        return String(t||"").indexOf("#EXTM3U")===0?row:null;
      });
    })
    .catch(function(){return null;});
}
function probeFile(row){
  return fetch(row.url,{headers:probeHeaders(row.headers),skipSizeCheck:true})
    .then(function(r){
      if(!r)return null;
      return Number(r.status)===206?row:null;
    })
    .catch(function(){return null;});
}
function makeStream(row,kind,index){
  var q=qualityOf(row);
  var src=clean(row.name);
  if(src.length>42)src=src.slice(0,42);
  var label="YFlix · S2 · "+kind+" · "+q;
  if(src&&src.toLowerCase().indexOf("vidlink")>=0)label="YFlix · S2 · Vidlink · "+q;
  return{
    name:label,
    title:label,
    url:clean(row.url),
    quality:q,
    type:isHls(row)?"hls":"mp4",
    provider:"yflix-server2",
    headers:safeHeaders(row.headers),
    subtitles:[],
    _rank:(isHls(row)?10000:20000)+qualityRank(q)-index
  };
}
function normalizeCandidates(j,info,mediaType,season,episode){
  var rows=j&&Array.isArray(j.sources)?j.sources:[];
  var files=[],hls=[];
  rows.forEach(function(row,i){
    if(!row||typeof row!=="object")return;
    var u=clean(row.url);
    if(!/^https?:\/\//i.test(u))return;
    if(isHls(row)){
      // HLS must prove title/year/episode in its own name because the current
      // Quasar pool has produced stale/mismatched signed HLS in the past.
      if(nameMatchesIdentity(row,info,mediaType,season,episode)){
        hls.push({row:row,index:i});
      }
      return;
    }

    if(mediaType==="movie"){
      // Movie files must carry title + year in the filename/source name.
      if(nameMatchesIdentity(row,info,mediaType,season,episode)){
        files.push({row:row,index:i});
      }
    }else{
      // VidBolt's TV Vidlink MP4 rows are unnamed by show, but are generated
      // from the exact IMDb + TMDB + S/E query. Only admit the Vidlink family.
      var n=clean(row.name).toLowerCase();
      if(n.indexOf("vidlink")>=0)files.push({row:row,index:i});
    }
  });

  files.sort(function(a,b){return qualityRank(qualityOf(b.row))-qualityRank(qualityOf(a.row));});
  hls.sort(function(a,b){return qualityRank(qualityOf(b.row))-qualityRank(qualityOf(a.row));});

  // Keep device-side probing bounded.
  files=files.slice(0,4);
  hls=hls.slice(0,4);
  return{files:files,hls:hls};
}
function callQuasar(info,mediaType,season,episode){
  var kind=mediaType==="tv"?"tv":"movie";
  var q=["tmdbId="+encodeURIComponent(info.tmdbId)];
  if(mediaType==="tv"){
    q.push("season="+encodeURIComponent(String(season)));
    q.push("episode="+encodeURIComponent(String(episode)));
  }
  var u=SCRAPER_BASE+"/scrape/Quasar/"+kind+"/"+encodeURIComponent(info.imdbId)+"?"+q.join("&");
  return fetchJson(u,{
    headers:{"Accept":"application/json","User-Agent":UA,"Referer":"https://vidbolt.xyz/"}
  }).then(function(j){
    var c=normalizeCandidates(j,info,mediaType,season,episode);
    var jobs=[];
    c.files.forEach(function(x){
      var s=makeStream(x.row,"Quasar",x.index);
      jobs.push(probeFile(s));
    });
    c.hls.forEach(function(x){
      var s=makeStream(x.row,"Quasar",x.index);
      jobs.push(probeHls(s));
    });
    if(!jobs.length)return[];
    return Promise.all(jobs).then(function(all){
      var out=all.filter(function(x){return!!x;});
      var seen={};
      out=out.filter(function(x){
        if(!x.url||seen[x.url])return false;
        seen[x.url]=1;return true;
      });
      out.sort(function(a,b){return(b._rank||0)-(a._rank||0);});
      out.forEach(function(x){try{delete x._rank;}catch(_){}});
      return out;
    });
  }).catch(function(){return[];});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  mediaType=mediaType==="tv"?"tv":"movie";
  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);

  return getTmdbInfo(String(tmdbId),mediaType)
    .then(function(info){return callQuasar(info,mediaType,season,episode);})
    .catch(function(){return[];});
}
function onSettings(){
  return[
    {type:"header",label:"YFlix Local · Server 2"},
    {type:"info",label:"VidBolt 实时可播版：每条 HLS 会先实际打开，文件流会先做 1-byte Range 检查；失效、过期或不能证明影片身份的线路直接隐藏，不再显示不可播放的 DIAG 卡。"},
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"用于核对标题、年份和 IMDb ID。留空使用备用 Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

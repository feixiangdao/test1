// YFlix Local for Nuvio
// v0.3.1 - YFlix Server 2 / VidBolt
//
// Current YFlix S2 iframe:
//   https://vidbolt.xyz/movie/{tmdb}
//   https://vidbolt.xyz/tv/{tmdb}/{season}/{episode}
//
// VidBolt internally aggregates multiple scrapers. This provider keeps the
// currently useful/non-redundant paths:
//   - Callisto: multi-language / dubbed HLS + MP4 (movie + TV)
//   - Orion: direct 1080p HLS movie fallback
//
// React Native / Hermes friendly: Promise chains, no async/await.

var SCRAPER_BASE = "https://scraper.vidbolt.xyz";
var TMDB_BASE = "https://api.themoviedb.org/3";
var DEFAULT_TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var ORION_API = "https://api.movy.lol";
var ORION_KEY = "0f461eaa465bb2a7acd037425217f2f209ef540a3171e1ac";
var UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var DIAG=[];
function diag(msg){msg=clean(msg).replace(/\s+/g," ").slice(0,160);if(msg&&DIAG.indexOf(msg)<0)DIAG.push(msg);}
function statusRows(){var a=DIAG.slice(-4);if(!a.length)a=["No stream returned"];return a.map(function(msg,i){var n="YFlix · S2 · DIAG "+(i+1)+" · "+msg;return{name:n,title:n,url:"about:error",quality:"Status",type:"diagnostic",provider:"yflix-server2",headers:{},subtitles:[]};});}

function clean(v){ return v == null ? "" : String(v).trim(); }

function settings(){
  try {
    return (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) || {};
  } catch(_) {
    return {};
  }
}

function tmdbKey(){
  var s = settings();
  var k = clean(s.tmdbApiKey);
  if(k) return k;
  try {
    k = clean(typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY);
    if(k) return k;
  } catch(_) {}
  return DEFAULT_TMDB_API_KEY;
}

function fetchJson(url, opt){
  opt = opt || {};
  try { opt.skipSizeCheck = true; } catch(_) {}
  return fetch(url,opt).then(function(r){
    if(!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "no-response"));
    return r.json();
  });
}

function getTmdbInfo(tmdbId, mediaType){
  var type = mediaType === "tv" ? "tv" : "movie";
  var extra = type === "movie"
    ? "external_ids,alternative_titles"
    : "external_ids,alternative_titles";
  var u = TMDB_BASE + "/" + type + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(tmdbKey()) +
    "&language=en-US&append_to_response=" + encodeURIComponent(extra);

  return fetchJson(u,{
    headers:{"Accept":"application/json","User-Agent":UA}
  }).then(function(d){
    var title = clean(d.title || d.name || d.original_title || d.original_name);
    var date = clean(d.release_date || d.first_air_date);
    var year = parseInt(date.slice(0,4),10) || 0;
    var imdbId = clean(
      d.imdb_id ||
      (d.external_ids && d.external_ids.imdb_id)
    );
    if(!title) throw new Error("TMDB title missing");
    return {
      title:title,
      year:year,
      imdbId:imdbId,
      tmdbId:String(tmdbId)
    };
  });
}

function copyHeaders(h){
  var out = {}, k;
  h = h && typeof h === "object" ? h : {};
  for(k in h){
    if(Object.prototype.hasOwnProperty.call(h,k) && h[k] != null){
      out[k] = String(h[k]);
    }
  }
  if(!out["User-Agent"]) out["User-Agent"] = UA;
  return out;
}

function qualityOf(row){
  var q = clean(row && row.quality) || "Auto";
  if(/^\d+$/.test(q)) return q + "p";
  return q;
}

function typeOf(row){
  var t = clean(row && row.type).toLowerCase();
  var u = clean(row && row.url).toLowerCase();
  if(t === "m3u8" || t === "hls" || u.indexOf(".m3u8") >= 0 || u.indexOf("%2fm3u8") >= 0) return "hls";
  if(t === "dash" || t === "mpd" || u.indexOf(".mpd") >= 0) return "dash";
  return "mp4";
}

function subtitleRows(list){
  var out=[], seen={};
  (Array.isArray(list)?list:[]).forEach(function(s,i){
    if(!s || typeof s !== "object") return;
    var u=clean(s.url);
    if(!/^https?:\/\//i.test(u) || seen[u]) return;
    seen[u]=1;
    var lang=clean(s.lang || s.language || s.code) || "und";
    var name=clean(s.label || s.name || s.display || lang) || ("Subtitle " + (i+1));
    out.push({url:u,language:lang,name:name});
  });
  return out;
}

function rankQuality(q){
  var m=String(q||"").match(/(2160|1440|1080|720|480|360|240)/);
  return m ? parseInt(m[1],10) : 0;
}

function normalizeCallisto(json){
  var rows=json && Array.isArray(json.sources) ? json.sources : [];
  var subs=subtitleRows(json && json.subtitles);
  var grouped={};

  rows.forEach(function(row){
    if(!row || typeof row !== "object") return;
    var url=clean(row.url);
    if(!/^https?:\/\//i.test(url)) return;

    var key=url;
    var lang=clean(row.language) || "Original";
    var q=qualityOf(row);

    if(!grouped[key]){
      grouped[key]={
        row:row,
        langs:[],
        quality:q
      };
    }
    if(grouped[key].langs.indexOf(lang)<0) grouped[key].langs.push(lang);
  });

  var out=[];
  Object.keys(grouped).forEach(function(url){
    var g=grouped[url], row=g.row;
    var langs=g.langs.join("/");
    var q=g.quality;
    var typ=typeOf(row);
    var transport=typ==="hls" ? "HLS" : (typ==="dash" ? "DASH" : "MP4");
    var label="YFlix · S2 · Callisto · " + langs + " · " + q + " · " + transport;

    out.push({
      name:label,
      title:label,
      url:url,
      quality:q,
      type:typ,
      provider:"yflix-server2",
      headers:copyHeaders(row.headers),
      subtitles:subs,
      _rank:(typ==="hls"?30000:20000)+rankQuality(q)
    });
  });

  return out;
}

function callCallisto(info, mediaType, season, episode){
  if(!info || !info.title) return Promise.resolve([]);

  var kind=mediaType==="tv" ? "tv" : "movie";
  var id=clean(info.imdbId) || ("tmdb" + info.tmdbId);
  var q=[];
  q.push("title="+encodeURIComponent(info.title));
  q.push("tmdbId="+encodeURIComponent(info.tmdbId));
  if(info.year) q.push("year="+encodeURIComponent(String(info.year)));
  if(mediaType==="tv"){
    q.push("season="+encodeURIComponent(String(season||1)));
    q.push("episode="+encodeURIComponent(String(episode||1)));
  }

  var u=SCRAPER_BASE + "/scrape/Callisto/" + kind + "/" + encodeURIComponent(id) + "?" + q.join("&");

  return fetchJson(u,{
    headers:{
      "Accept":"application/json",
      "User-Agent":UA,
      "Referer":"https://vidbolt.xyz/"
    }
  }).then(normalizeCallisto).catch(function(e){
    var m=(e && e.message ? e.message : e);console.warn("[YFlix S2] Callisto " + m);diag("Callisto · "+m);
    return [];
  });
}

function callOrionMovie(tmdbId){
  var u=ORION_API + "/api/source/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(ORION_KEY) +
    "&apikey=" + encodeURIComponent(ORION_KEY);

  return fetchJson(u,{
    headers:{"Accept":"application/json","User-Agent":UA}
  }).then(function(j){
    var rows=j && Array.isArray(j.sources) ? j.sources : [];
    if(!rows.length && j && j.m3u8_path){
      rows=[{
        url:String(j.m3u8_path).indexOf("http")===0
          ? j.m3u8_path
          : "https://img.rousav.tech/" + String(j.m3u8_path).replace(/^\/+/, ""),
        quality:"1080p",
        type:"m3u8"
      }];
    }

    var out=[];
    rows.forEach(function(row,i){
      var url=clean(row && row.url);
      if(!/^https?:\/\//i.test(url)) return;
      var q=qualityOf(row);
      var typ=typeOf(row);
      var label="YFlix · S2 · Orion · " + q + (i ? " · " + (i+1) : "");
      out.push({
        name:label,
        title:label,
        url:url,
        quality:q,
        type:typ,
        provider:"yflix-server2",
        headers:{"User-Agent":UA},
        subtitles:[],
        _rank:(typ==="hls"?30000:20000)+rankQuality(q)
      });
    });
    return out;
  }).catch(function(e){
    var m=(e && e.message ? e.message : e);console.warn("[YFlix S2] Orion " + m);diag("Orion · "+m);
    return [];
  });
}

function dedupeSort(rows){
  var out=[], seen={};
  (rows||[]).forEach(function(x){
    if(!x || !x.url) return;
    var key=x.url + "|" + x.name;
    if(seen[key]) return;
    seen[key]=1;
    out.push(x);
  });
  out.sort(function(a,b){return (b._rank||0)-(a._rank||0);});
  out.forEach(function(x){try{delete x._rank;}catch(_){}});
  return out;
}

function getStreams(tmdbId, mediaType, season, episode){
  DIAG=[];
  if(!tmdbId){diag("missing TMDB id");return Promise.resolve(statusRows());}
  mediaType=mediaType==="tv" ? "tv" : "movie";
  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;

  if(mediaType==="tv" && (!season || !episode)){diag("TV missing season/episode");return Promise.resolve(statusRows());}

  var metaPromise=getTmdbInfo(String(tmdbId),mediaType).catch(function(e){
    var m=(e && e.message ? e.message : e);console.warn("[YFlix S2] TMDB " + m);diag("TMDB · "+m);
    return null;
  });

  if(mediaType==="movie"){
    return Promise.all([
      metaPromise.then(function(info){return callCallisto(info,mediaType,0,0);}),
      callOrionMovie(String(tmdbId))
    ]).then(function(all){
      var out=dedupeSort((all[0]||[]).concat(all[1]||[]));
      console.log("[YFlix S2] movie tmdb="+tmdbId+" streams="+out.length);
      if(!out.length){diag("movie · 0 playable streams");return statusRows();}
      return out;
    }).catch(function(e){
      var m=(e && e.message ? e.message : e);console.error("[YFlix S2] " + m);diag("runtime · "+m);
      return statusRows();
    });
  }

  return metaPromise.then(function(info){
    return callCallisto(info,mediaType,season,episode);
  }).then(function(rows){
    var out=dedupeSort(rows||[]);
    console.log("[YFlix S2] tv tmdb="+tmdbId+" S"+season+"E"+episode+" streams="+out.length);
    if(!out.length){diag("TV · 0 playable streams");return statusRows();}
    return out;
  }).catch(function(e){
    var m=(e && e.message ? e.message : e);console.error("[YFlix S2] " + m);diag("runtime · "+m);
    return statusRows();
  });
}

function onSettings(){
  return [
    {type:"header",label:"YFlix Local · Server 2"},
    {
      type:"info",
      label:"解析 YFlix 的 VidBolt（Multi Dubbed）线路。当前保留 Callisto 多语言源；电影额外加入 Orion 1080p HLS。"
    },
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"用于取得标题、年份和 IMDb ID。留空使用公共备用 Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}

module.exports={
  getStreams:getStreams,
  onSettings:onSettings
};

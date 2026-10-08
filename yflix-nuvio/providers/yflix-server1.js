// YFlix Local for Nuvio
// v0.3.2
// Current YFlix.in Server 1 (Multi Source):
// TMDB -> player.playapi.eu.cc -> tmdb-embed-api.stayawayx.workers.dev
//
// React Native / Hermes friendly: Promise chains, no async/await.
// v0.1.1: hide DahmerMovies rows after device testing showed that this
// upstream consistently fails in Nuvio while the other S1 providers play.

var API_BASE = "https://tmdb-embed-api.stayawayx.workers.dev";
var UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var DIAG=[];
function diag(msg){msg=clean(msg).replace(/\s+/g," ").slice(0,160);if(msg&&DIAG.indexOf(msg)<0)DIAG.push(msg);}
function statusRows(){var a=DIAG.slice(-3);if(!a.length)a=["No stream returned"];return a.map(function(msg,i){var n="YFlix · S1 · DIAG "+(i+1)+" · "+msg;return{name:n,title:n,url:"about:error",quality:"Status",type:"diagnostic",provider:"yflix-server1",headers:{},subtitles:[]};});}

function clean(v){ return v == null ? "" : String(v).trim(); }

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
  var q = clean(row && row.quality);
  if(!q) return "Auto";
  if(/^\d+$/.test(q)) return q + "p";
  if(/^2160p?$/i.test(q)) return "2160p";
  return q;
}

function streamType(url){
  var u = clean(url).toLowerCase().split("?")[0];
  if(u.indexOf(".m3u8") >= 0) return "hls";
  if(u.indexOf(".mpd") >= 0) return "dash";
  return "mp4";
}

function containerLabel(url){
  var u = clean(url).toLowerCase();
  if(u.indexOf(".m3u8") >= 0) return "HLS";
  if(u.indexOf(".mkv") >= 0) return "MKV";
  if(u.indexOf(".mp4") >= 0) return "MP4";
  if(u.indexOf(".mpd") >= 0) return "DASH";
  return "Direct";
}

function languageHint(row){
  var n = clean(row && row.name);
  var m = n.match(/\[([^\]]+)\]/);
  return m ? clean(m[1]) : "";
}

function subtitleRows(row){
  var src = row && Array.isArray(row.subtitles) ? row.subtitles : [];
  var out = [], seen = {};
  src.forEach(function(s, i){
    if(!s || typeof s !== "object") return;
    var url = clean(s.url);
    if(!/^https?:\/\//i.test(url) || seen[url]) return;
    seen[url] = 1;
    var lang = clean(s.lang || s.language || s.code) || "und";
    var label = clean(s.label || s.name || s.lang || s.language) || ("Subtitle " + (i + 1));
    out.push({ url:url, language:lang, name:label });
  });
  return out;
}

function rank(row){
  var q = qualityOf(row);
  var m = String(q).match(/(2160|1440|1080|720|480|360|240)/);
  var res = m ? parseInt(m[1],10) : 0;
  var url = clean(row && row.url).toLowerCase();
  var transport = url.indexOf(".m3u8") >= 0 ? 30000 :
                  url.indexOf(".mp4") >= 0 ? 20000 :
                  url.indexOf(".mkv") >= 0 ? 10000 : 0;
  return transport + res;
}

function normalize(rows){
  var out = [], seen = {}, skippedDahmer = 0;
  (rows || []).forEach(function(row, i){
    if(!row || typeof row !== "object") return;

    var provider = clean(row.provider || row.name) || "Server";

    // The current DahmerMovies rows are p.111477.xyz/bulk direct-file
    // endpoints. They are returned by PlayAPI but repeatedly fail on the
    // tested Nuvio/Android playback path, while the other S1 providers work.
    // Keep this filter provider-specific: other MKV sources are not removed.
    if(provider.toLowerCase() === "dahmermovies"){
      skippedDahmer++;
      return;
    }

    var url = clean(row.url);
    if(!/^https?:\/\//i.test(url) || seen[url]) return;
    seen[url] = 1;

    var q = qualityOf(row);
    var lang = languageHint(row);
    var container = containerLabel(url);
    var suffix = provider + " · " + q + " · " + container + (lang ? " · " + lang : "");
    var detail = clean(row.title);

    out.push({
      name: "YFlix · S1 · " + suffix,
      title: detail ? ("YFlix · S1 · " + suffix + " · " + detail.replace(/\s+/g," ")) : ("YFlix · S1 · " + suffix),
      url: url,
      quality: q,
      type: streamType(url),
      provider: "yflix-server1",
      headers: copyHeaders(row.headers),
      subtitles: subtitleRows(row),
      _rank: rank(row)
    });
  });

  out.sort(function(a,b){ return b._rank - a._rank; });
  out.forEach(function(x){ try { delete x._rank; } catch(_) {} });
  if(skippedDahmer) console.log("[YFlix S1] skipped DahmerMovies=" + skippedDahmer);
  return out;
}

function getStreams(tmdbId, mediaType, season, episode){
  DIAG=[];
  if(!tmdbId){diag("missing TMDB id");return Promise.resolve(statusRows());}

  var type = mediaType === "tv" ? "tv" : "movie";
  var s = parseInt(season,10) || 0;
  var e = parseInt(episode,10) || 0;

  if(type === "tv" && (!s || !e)){
    console.log("[YFlix S1] TV missing season/episode");
    diag("TV missing season/episode");
    return Promise.resolve(statusRows());
  }

  var url = API_BASE + "/api/streams/" + type + "/" + encodeURIComponent(String(tmdbId));
  if(type === "tv"){
    url += "?season=" + encodeURIComponent(String(s)) + "&episode=" + encodeURIComponent(String(e));
  }

  return fetch(url,{
    headers:{
      "Accept":"application/json",
      "User-Agent":UA,
      "Referer":"https://player.playapi.eu.cc/"
    },
    skipSizeCheck:true
  })
  .then(function(r){
    if(!r || !r.ok) throw new Error("PlayAPI HTTP " + (r ? r.status : "no-response") + (r && r.statusText ? " · " + r.statusText : ""));
    return r.json();
  })
  .then(function(j){
    if(!j || j.success === false) throw new Error("PlayAPI returned failure");
    var rows = Array.isArray(j.streams) ? j.streams : [];
    var out = normalize(rows);
    console.log("[YFlix S1] tmdb=" + tmdbId + " raw=" + rows.length + " playable=" + out.length);
    if(!out.length){diag("PlayAPI returned 0 playable streams");return statusRows();}
    return out;
  })
  .catch(function(err){
    var m=(err && err.message ? err.message : err);
    console.error("[YFlix S1] " + m);
    diag("PlayAPI · "+m);
    return statusRows();
  });
}

function onSettings(){
  return [
    { type:"header", label:"YFlix Local · Server 1" },
    {
      type:"info",
      label:"直接调用当前 YFlix Server 1 使用的 PlayAPI 后台，按 TMDB ID 获取真实播放流并保留各线路请求头。已暂时隐藏实机测试持续失败的 DahmerMovies 线路。"
    }
  ];
}

module.exports = {
  getStreams:getStreams,
  onSettings:onSettings
};

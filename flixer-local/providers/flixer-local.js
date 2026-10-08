// Flixer Local — experimental direct-media fallback (NO remote resolver).
// Runs exclusively in Nuvio's local JS runtime. The current website generally
// requires browser/WASM to obtain its HLS URL, so this does not claim full playback.
var FLIXER_BASE = "https://flixer.su";
var FLIXER_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
function flixerClean(v) { return v == null ? "" : String(v).trim(); }
function flixerRoute(id, type, season, episode) {
  id=flixerClean(id);type=flixerClean(type);
  if (!/^\d{1,10}$/.test(id)) return "";
  if (type==="movie") return "/watch/movie/"+id;
  if (type!=="tv") return "";
  var s=flixerClean(season),e=flixerClean(episode);
  if (!/^\d{1,3}$/.test(s) || !/^\d{1,3}$/.test(e)) return "";
  if (Number(s)>99 || Number(e)<1 || Number(e)>999) return "";
  return "/watch/tv/"+id+"/"+Number(s)+"/"+Number(e);
}
function flixerDecode(t) {
  return flixerClean(t).replace(/&amp;/gi,"&")
    .replace(/\\u0026/gi,"&").replace(/\\u003d/gi,"=")
    .replace(/\\\//g,"/");
}
function flixerScanDirect(html, referer) {
  var input=flixerDecode(html), urls=[], unique={};
  var exp=/https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?/ig;
  var match;
  while ((match=exp.exec(input))!==null) {
    var url=match[0];
    if (unique[url]) continue;
    unique[url]=true;
    // Ignore known front-end assets; only consider direct media URLs.
    if (/\/assets\/(?:js|css|img)\//i.test(url)) continue;
    urls.push(url);
    if(urls.length>=10)break;
  }
  return urls.map(function(url){
    var type=/\.mp4(?:$|[?])/i.test(url)?"mp4":/\.mpd(?:$|[?])/i.test(url)?"dash":"hls";
    var quality=/2160|4k/i.test(url)?"4K":/1080/i.test(url)?"1080p":/720/i.test(url)?"720p":"Auto";
    return {
      name:"Flixer Local · Direct",
      title:"Flixer Local · Direct · "+quality,
      provider:"flixer-local-direct-020",
      type:type, quality:quality,url:url,
      headers:{"Referer":referer,"Origin":FLIXER_BASE,"User-Agent":FLIXER_UA}
    };
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  var path=flixerRoute(tmdbId,mediaType,season,episode);
  if(!path) return Promise.resolve([]);
  var url=FLIXER_BASE+path;
  return fetch(url,{headers:{
    "User-Agent":FLIXER_UA,
    "Referer":FLIXER_BASE+"/",
    "Accept":"text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
  }}).then(function(response){
    if(!response.ok)throw new Error("HTTP "+response.status);
    return response.text();
  }).then(function(html){
    var direct=flixerScanDirect(html,url);
    if (!direct.length) {
      // The current Flixer site uses browser/WebAssembly source resolution.
      // Returning [] is intentional; fake links cause Nuvio buffering/crashes.
      console.log("[Flixer Local] No direct media in response; browser/WASM resolver required.");
    }
    return direct;
  }).catch(function(e){
    console.log("[Flixer Local] "+(e&&e.message?e.message:e));
    return [];
  });
}
function onSettings(){
  return [
    {type:"header",label:"Flixer Local (experimental)"},
    {type:"info",label:"Pure local JavaScript. No external resolver and no API key. The current Flixer source format relies on browser/WebAssembly; this direct-link fallback may return zero results until a pure-JS decoder is completed."}
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

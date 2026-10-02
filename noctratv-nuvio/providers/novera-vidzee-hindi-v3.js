// NoctraTV · Novera · VidZee Hindi v3
var API="https://core.vidzee.wtf";
var PLAYER="https://player.vidzee.wtf";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function getStreams(tmdbId,mediaType,season,episode){
  var id=encodeURIComponent(String(tmdbId));
  var path=mediaType==="tv"?"/streams/tv/"+id+"/"+encodeURIComponent(String(season||1))+"/"+encodeURIComponent(String(episode||1)):"/streams/movie/"+id;
  var u=API+path+"?s="+encodeURIComponent("v6:Hindi")+"&e=0";
  return fetch(u,{headers:{"Accept":"application/json, text/plain, */*","Referer":PLAYER+"/","Origin":PLAYER,"User-Agent":UA}}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();}).then(function(d){
    var media=clean(d&&d.url);if(!/^https?:\/\//i.test(media))return[];
    var h={"Referer":PLAYER+"/","User-Agent":UA};var up=d&&d.headers&&typeof d.headers==="object"?d.headers:{};Object.keys(up).forEach(function(k){var v=clean(up[k]);if(v)h[k]=v;});
    var q="Auto",m=media.match(/(2160|1080|720|480)p/i);if(m)q=m[1]+"p";
    return[{name:"NoctraTV · Novera · VidZee Hindi v3",title:"Novera · VidZee · Hindi v3 · "+q,url:media,quality:q,language:"Hindi",provider:"noctra-novera-vidzee-hindi-v3",headers:h,subtitles:[]}];
  }).catch(function(e){console.log("[Noctra/Novera/VidZee/Hindi-v3] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

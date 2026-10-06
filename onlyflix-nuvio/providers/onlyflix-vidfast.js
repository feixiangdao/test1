var RESOLVER="https://onlyflix-resolver-feixiangdao.vercel.app/api/resolve";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var u=RESOLVER+"?tmdb="+encodeURIComponent(String(tmdbId))+"&type="+encodeURIComponent(mediaType==="tv"?"tv":"movie");
  if(mediaType==="tv")u+="&season="+encodeURIComponent(String(season||1))+"&episode="+encodeURIComponent(String(episode||1));
  u+="&source=vidfast";
  return fetch(u,{headers:{"Accept":"application/json","User-Agent":UA}})
    .then(function(r){if(!r.ok)throw new Error("resolver HTTP "+r.status);return r.json();})
    .then(function(j){
      var urls=j&&Array.isArray(j.streams)?j.streams:[];
      var subs=j&&Array.isArray(j.subtitles)?j.subtitles.filter(function(s){return s&&s.url;}).slice(0,8).map(function(s){
        return{url:s.url,language:clean(s.lang||s.code)||"en",name:clean(s.lang||s.code)||"Subtitle"};
      }):[];
      var out=[],seen={};
      urls.forEach(function(x,i){
        var url=clean(x);if(!/^https?:\/\//i.test(url)||seen[url])return;seen[url]=1;
        var name="OnlyFlix · Server 3 · VidFast · HLS "+(i+1);
        out.push({name:name,title:name,url:url,quality:"Auto",type:"hls",provider:"onlyflix-vidfast",headers:{"User-Agent":UA},subtitles:subs});
      });
      console.log("[onlyflix-vidfast] resolver streams="+out.length);
      return out;
    })
    .catch(function(e){console.error("[onlyflix-vidfast] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};
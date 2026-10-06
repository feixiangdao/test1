var RESOLVER="https://onlyflix-resolver-feixiangdao.vercel.app/api/resolve";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var u=RESOLVER+"?tmdb="+encodeURIComponent(String(tmdbId))+"&type="+encodeURIComponent(mediaType==="tv"?"tv":"movie");
  if(mediaType==="tv")u+="&season="+encodeURIComponent(String(season||1))+"&episode="+encodeURIComponent(String(episode||1));
  u+="&source=nontongo";
  return fetch(u,{headers:{"Accept":"application/json","User-Agent":UA}})
    .then(function(r){if(!r.ok)throw new Error("resolver HTTP "+r.status);return r.json();})
    .then(function(j){
      var rows=j&&Array.isArray(j.streams)?j.streams:[];
      var subs=j&&Array.isArray(j.subtitles)?j.subtitles.filter(function(s){return s&&s.url;}).slice(0,8).map(function(s){
        return{url:s.url,language:clean(s.lang||s.code||s.language)||"en",name:clean(s.label||s.lang||s.code||s.name)||"Subtitle"};
      }):[];
      var out=[],seen={};
      rows.forEach(function(x,i){
        var obj=x&&typeof x==="object"?x:null;
        var url=clean(obj?obj.url:x);
        if(!/^https?:\/\//i.test(url)||seen[url])return;
        seen[url]=1;
        var q=clean(obj&&(obj.quality||obj.label))||"Auto";
        var suffix=clean(obj&&obj.name)||("HLS "+(i+1));
        var name="OnlyFlix · NontonGo · "+suffix;
        out.push({name:name,title:name,url:url,quality:q,type:"hls",provider:"onlyflix-nontongo",headers:{"User-Agent":UA},subtitles:subs});
      });
      console.log("[onlyflix-nontongo] resolver streams="+out.length);
      return out;
    })
    .catch(function(e){console.error("[onlyflix-nontongo] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};
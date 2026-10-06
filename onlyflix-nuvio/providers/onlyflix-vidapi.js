var API="https://streamdata.vaplayer.ru/api.php";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var REFERER="https://nextgencloudfabric.com/";
var SOURCE="";
function clean(v){return v==null?"":String(v).trim();}
function apiUrl(id,type,season,episode){
  var u=API+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie");
  if(SOURCE)u+="&source="+encodeURIComponent(SOURCE);
  if(type==="tv")u+="&season="+encodeURIComponent(String(season||1))+"&episode="+encodeURIComponent(String(episode||1));
  return u;
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var headers={"User-Agent":UA,"Referer":REFERER,"Origin":REFERER.replace(/\/$/,""),"Accept":"application/json, text/plain, */*"};
  return fetch(apiUrl(tmdbId,mediaType,season,episode),{headers:headers})
    .then(function(r){if(!r.ok)throw new Error("API HTTP "+r.status);return r.json();})
    .then(function(j){
      var urls=j&&j.data&&Array.isArray(j.data.stream_urls)?j.data.stream_urls:[];
      var subs=Array.isArray(j&&j.default_subs)?j.default_subs.filter(function(s){return s&&s.url;}).slice(0,8).map(function(s){
        return{url:s.url,language:clean(s.lang||s.code)||"en",name:clean(s.lang||s.code)||"Subtitle"};
      }):[];
      var seen={},out=[];
      urls.forEach(function(u,i){
        u=clean(u); if(!/^https?:\/\//i.test(u)||seen[u])return; seen[u]=1;
        var name="OnlyFlix · Server 1 · VidAPI · HLS "+(i+1);
        out.push({name:name,title:name,url:u,quality:"Auto",type:"hls",provider:"onlyflix-vidapi",headers:{"User-Agent":UA,"Referer":REFERER},subtitles:subs});
      });
      console.log("[onlyflix-vidapi] streams="+out.length);
      return out;
    })
    .catch(function(e){console.error("[onlyflix-vidapi] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};
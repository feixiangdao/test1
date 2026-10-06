// OnlyFlix · VidAPI — local-first, cloud fallback
var API="https://streamdata.vaplayer.ru/api.php";
var RESOLVER="https://onlyflix-resolver-feixiangdao.vercel.app/api/resolve";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
var REFS=["https://nextgencloudfabric.com/","https://brightpathsignals.com/"];
function clean(v){return v==null?"":String(v).trim();}
function apiUrl(id,type,s,e){
  var u=API+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie");
  if(type==="tv")u+="&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1));
  return u;
}
function normalize(j,label){
  var d=j&&j.data?j.data:null;
  var rows=d&&Array.isArray(d.stream_urls)?d.stream_urls:[];
  var subs=j&&Array.isArray(j.default_subs)?j.default_subs.filter(function(s){return s&&s.url;}).slice(0,8).map(function(s){
    return{url:s.url,language:clean(s.lang||s.code||s.language)||"en",name:clean(s.label||s.lang||s.code||s.name)||"Subtitle"};
  }):[];
  var out=[],seen={};
  rows.forEach(function(x,i){
    var url=clean(x&&typeof x==="object"?x.url:x);
    if(!/^https?:\/\//i.test(url)||seen[url])return;seen[url]=1;
    var name="OnlyFlix · VidAPI · "+label+" · HLS "+(i+1);
    out.push({name:name,title:name,url:url,quality:"Auto",type:"hls",provider:"onlyflix-vidapi",headers:{"User-Agent":UA},subtitles:subs});
  });
  return out;
}
function localTry(i,id,type,s,e){
  if(i>=REFS.length)return Promise.resolve([]);
  var ref=REFS[i];
  return fetch(apiUrl(id,type,s,e),{headers:{"User-Agent":UA,"Referer":ref,"Origin":ref.replace(/\/$/,""),"Accept":"application/json, text/plain, */*"}})
    .then(function(r){if(!r.ok)throw new Error("local HTTP "+r.status);return r.json();})
    .then(function(j){var out=normalize(j,"Local");return out.length?out:localTry(i+1,id,type,s,e);})
    .catch(function(){return localTry(i+1,id,type,s,e);});
}
function cloud(id,type,s,e){
  var u=RESOLVER+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie");
  if(type==="tv")u+="&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1));
  return fetch(u,{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("cloud HTTP "+r.status);return r.json();})
    .then(function(j){
      var wrap={data:{stream_urls:j&&Array.isArray(j.streams)?j.streams:[]},default_subs:j&&Array.isArray(j.subtitles)?j.subtitles:[]};
      return normalize(wrap,"Cloud fallback");
    }).catch(function(){return[];});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return localTry(0,tmdbId,mediaType,season,episode).then(function(rows){
    if(rows.length){console.log("[OnlyFlix/VidAPI] local streams="+rows.length);return rows;}
    return cloud(tmdbId,mediaType,season,episode).then(function(x){console.log("[OnlyFlix/VidAPI] cloud fallback="+x.length);return x;});
  }).catch(function(){return cloud(tmdbId,mediaType,season,episode);});
}
module.exports={getStreams:getStreams};
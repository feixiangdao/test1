// OnlyFlix · VidAPI — pure local Nuvio resolver
var API="https://streamdata.vaplayer.ru/api.php";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
var REFS=["https://nextgencloudfabric.com/","https://brightpathsignals.com/"];
function clean(v){return v==null?"":String(v).trim();}
function apiUrl(id,type,s,e){
  var u=API+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie");
  if(type==="tv")u+="&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1));
  return u;
}
function normalize(j){
  var d=j&&j.data?j.data:null;
  var rows=d&&Array.isArray(d.stream_urls)?d.stream_urls:[];
  var subs=j&&Array.isArray(j.default_subs)?j.default_subs.filter(function(s){return s&&s.url;}).slice(0,8).map(function(s){
    return{url:s.url,language:clean(s.lang||s.code||s.language)||"en",name:clean(s.label||s.lang||s.code||s.name)||"Subtitle"};
  }):[];
  var out=[],seen={};
  rows.forEach(function(x,i){
    var url=clean(x&&typeof x==="object"?x.url:x);
    if(!/^https?:\/\//i.test(url)||seen[url])return;
    seen[url]=1;
    var name="OnlyFlix · VidAPI · Local · HLS "+(i+1);
    out.push({name:name,title:name,url:url,quality:"Auto",type:"hls",provider:"onlyflix-vidapi",headers:{"User-Agent":UA},subtitles:subs});
  });
  return out;
}
function tryRef(i,id,type,s,e){
  if(i>=REFS.length)return Promise.resolve([]);
  var ref=REFS[i];
  return fetch(apiUrl(id,type,s,e),{
    headers:{
      "User-Agent":UA,
      "Referer":ref,
      "Origin":ref.replace(/\/$/,""),
      "Accept":"application/json, text/plain, */*"
    }
  }).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(j){
    var out=normalize(j);
    return out.length?out:tryRef(i+1,id,type,s,e);
  }).catch(function(){
    return tryRef(i+1,id,type,s,e);
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tryRef(0,tmdbId,mediaType,season,episode).then(function(rows){
    console.log("[OnlyFlix/VidAPI] pure-local streams="+rows.length);
    return rows;
  }).catch(function(e){
    console.error("[OnlyFlix/VidAPI] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};
// OnlyFlix · NontonGo — local-first, cloud fallback
var BASES=["https://sv2.nontongo.day","https://sv2.nontongo.stream"];
var RESOLVER="https://onlyflix-resolver-feixiangdao.vercel.app/api/resolve";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function page(base,id,type,s,e){
  return type==="tv"
    ?base+"/01russia/multisourcesoap.php?id="+encodeURIComponent(id)+"&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1))+"&type=tv"
    :base+"/01russia/multisourcesoap.php?id="+encodeURIComponent(id)+"&type=movie";
}
function parse(html){
  var m=String(html||"").match(/const\s+sources\s*=\s*(\[[\s\S]*?\]);/);
  if(!m)return[];
  try{return JSON.parse(m[1]);}catch(e){return[];}
}
function probe(row,base){
  var raw=clean(row&&row.file);
  if(!/^https?:\/\//i.test(raw))return Promise.resolve(null);
  var requestUrl=raw.split("#")[0];
  return fetch(requestUrl,{method:"HEAD",headers:{"User-Agent":UA,"Referer":base+"/","Accept":"*/*"}})
    .then(function(r){
      if(!r.ok)return null;
      var ct="";
      try{ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();}catch(e){}
      var type=ct.indexOf("video/mp4")>=0?"mp4":"hls";
      var url=type==="mp4"?requestUrl:raw;
      var source=clean(row&&row.html)||"Soap2";
      var name="OnlyFlix · NontonGo · Local · "+source;
      return{name:name,title:name,url:url,quality:"Auto",type:type,provider:"onlyflix-nontongo",headers:{"User-Agent":UA},subtitles:[]};
    }).catch(function(){return null;});
}
function localBase(i,id,type,s,e){
  if(i>=BASES.length)return Promise.resolve([]);
  var base=BASES[i],u=page(base,id,type,s,e);
  return fetch(u,{headers:{"User-Agent":UA,"Referer":base+"/","Accept":"text/html,application/xhtml+xml,*/*"}})
    .then(function(r){if(!r.ok)throw new Error("page "+r.status);return r.text();})
    .then(function(html){
      var rows=parse(html).slice(0,8);
      if(!rows.length)throw new Error("sources missing");
      return Promise.all(rows.map(function(x){return probe(x,base);})).then(function(xs){
        return xs.filter(Boolean);
      });
    }).then(function(out){return out.length?out:localBase(i+1,id,type,s,e);})
    .catch(function(){return localBase(i+1,id,type,s,e);});
}
function cloud(id,type,s,e){
  var u=RESOLVER+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie")+"&source=nontongo";
  if(type==="tv")u+="&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1));
  return fetch(u,{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("cloud "+r.status);return r.json();})
    .then(function(j){
      var rows=j&&Array.isArray(j.streams)?j.streams:[],out=[],seen={};
      rows.forEach(function(x,i){
        var obj=x&&typeof x==="object"?x:null,url=clean(obj?obj.url:x);
        if(!/^https?:\/\//i.test(url)||seen[url])return;seen[url]=1;
        var source=clean(obj&&obj.name)||("Source "+(i+1));
        var name="OnlyFlix · NontonGo · Cloud fallback · "+source;
        out.push({name:name,title:name,url:url,quality:clean(obj&&obj.quality)||"Auto",type:clean(obj&&obj.type)||"hls",provider:"onlyflix-nontongo",headers:{"User-Agent":UA},subtitles:[]});
      });
      return out;
    }).catch(function(){return[];});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return localBase(0,tmdbId,mediaType,season,episode).then(function(rows){
    if(rows.length){console.log("[OnlyFlix/NontonGo] local streams="+rows.length);return rows;}
    return cloud(tmdbId,mediaType,season,episode);
  }).catch(function(){return cloud(tmdbId,mediaType,season,episode);});
}
module.exports={getStreams:getStreams};
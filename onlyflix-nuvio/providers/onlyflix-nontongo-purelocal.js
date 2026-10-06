// OnlyFlix · NontonGo — pure local Nuvio resolver
var BASES=["https://sv2.nontongo.day","https://sv2.nontongo.stream"];
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
  return fetch(requestUrl,{
    method:"GET",
    headers:{
      "User-Agent":UA,
      "Referer":base+"/",
      "Accept":"*/*",
      "Range":"bytes=0-0"
    }
  }).then(function(r){
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
function tryBase(i,id,type,s,e){
  if(i>=BASES.length)return Promise.resolve([]);
  var base=BASES[i],u=page(base,id,type,s,e);
  return fetch(u,{headers:{
    "User-Agent":UA,
    "Referer":base+"/",
    "Accept":"text/html,application/xhtml+xml,*/*"
  }}).then(function(r){
    if(!r.ok)throw new Error("page "+r.status);
    return r.text();
  }).then(function(html){
    var rows=parse(html).slice(0,8);
    if(!rows.length)throw new Error("sources missing");
    return Promise.all(rows.map(function(x){return probe(x,base);})).then(function(xs){
      var out=[],seen={};
      xs.filter(Boolean).forEach(function(x){
        if(x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
      });
      return out.length?out:tryBase(i+1,id,type,s,e);
    });
  }).catch(function(){
    return tryBase(i+1,id,type,s,e);
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tryBase(0,tmdbId,mediaType,season,episode).then(function(rows){
    console.log("[OnlyFlix/NontonGo] pure-local streams="+rows.length);
    return rows;
  }).catch(function(e){
    console.error("[OnlyFlix/NontonGo] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};
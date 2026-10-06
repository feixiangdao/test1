// OnlyFlix · VidFast — pure local VA upstream with HLS quality expansion
var VA="https://streamdata.vaplayer.ru/api.php";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var REFS=["https://vidfast.pro/","https://nextgencloudfabric.com/"];
function clean(v){return v==null?"":String(v).trim();}

function absUrl(base,ref){
  ref=clean(ref);
  if(/^https?:\/\//i.test(ref))return ref;
  try{return new URL(ref,base).toString();}catch(e){return ref;}
}
function stdQuality(w,h){
  w=parseInt(w||0,10)||0;h=parseInt(h||0,10)||0;
  if(w>=3500||h>=1800)return"2160p";
  if(w>=2400||h>=1300)return"1440p";
  if(w>=1800||h>=1000)return"1080p";
  if(w>=1200||h>=650)return"720p";
  if(w>=800||h>=440)return"480p";
  if(w>=600||h>=320)return"360p";
  if(w>=400||h>=220)return"240p";
  return h>0?(h+"p"):"Unknown";
}
function parseMaster(text,masterUrl){
  var lines=String(text||"").replace(/\r/g,"").split("\n"),out=[];
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var attrs=line.slice(18),rm=attrs.match(/RESOLUTION=(\d+)x(\d+)/i),bm=attrs.match(/BANDWIDTH=(\d+)/i);
    var uri="";
    for(var j=i+1;j<lines.length;j++){
      var n=lines[j].trim();
      if(!n)continue;
      if(n.charAt(0)==="#")continue;
      uri=n;break;
    }
    if(!uri)continue;
    var w=rm?parseInt(rm[1],10):0,h=rm?parseInt(rm[2],10):0;
    out.push({url:absUrl(masterUrl,uri),width:w,height:h,quality:stdQuality(w,h),bandwidth:bm?parseInt(bm[1],10):0});
  }
  return out;
}
function qualityDetail(v){
  return v.width&&v.height?v.quality+" ("+v.width+"×"+v.height+")":v.quality;
}

function qnum(q){var m=String(q||"").match(/(\d{3,4})/);return m?parseInt(m[1],10):0;}
function apiUrl(id,type,s,e){
  var u=VA+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie")+"&source=vidfast";
  if(type==="tv")u+="&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1));
  return u;
}
function expand(url,index){
  var h={"User-Agent":UA};
  return fetch(url,{headers:h}).then(function(r){
    if(!r.ok)throw new Error("master "+r.status);return r.text();
  }).then(function(txt){
    var vars=parseMaster(txt,url);
    if(!vars.length){
      var name="OnlyFlix · VidFast · S"+index+" · Unknown";
      return[{name:name,title:name,url:url,quality:"Unknown",type:"hls",provider:"onlyflix-vidfast",headers:h,subtitles:[]}];
    }
    return vars.map(function(v){
      var detail=qualityDetail(v),name="OnlyFlix · VidFast · S"+index+" · "+detail;
      return{name:name,title:name,url:v.url,quality:v.quality,type:"hls",provider:"onlyflix-vidfast",headers:h,subtitles:[]};
    });
  }).catch(function(){
    var name="OnlyFlix · VidFast · S"+index+" · Unknown";
    return[{name:name,title:name,url:url,quality:"Unknown",type:"hls",provider:"onlyflix-vidfast",headers:h,subtitles:[]}];
  });
}
function tryRef(i,id,type,s,e){
  if(i>=REFS.length)return Promise.resolve([]);
  var ref=REFS[i];
  return fetch(apiUrl(id,type,s,e),{headers:{
    "User-Agent":UA,
    "Referer":ref,
    "Origin":ref.replace(/\/$/,""),
    "Accept":"application/json, text/plain, */*"
  }}).then(function(r){
    if(!r.ok)throw new Error("VA "+r.status);return r.json();
  }).then(function(j){
    var rows=j&&j.data&&Array.isArray(j.data.stream_urls)?j.data.stream_urls:[],masters=[],seen={};
    rows.forEach(function(x){var u=clean(x);if(/^https?:\/\//i.test(u)&&!seen[u]){seen[u]=1;masters.push(u);}});
    if(!masters.length)return tryRef(i+1,id,type,s,e);
    return Promise.all(masters.map(function(u,n){return expand(u,n+1);})).then(function(gs){
      var out=[];gs.forEach(function(g){out=out.concat(g||[]);});
      out.sort(function(a,b){
        var sa=parseInt((a.name.match(/S(\d+)/)||[])[1]||0,10),sb=parseInt((b.name.match(/S(\d+)/)||[])[1]||0,10);
        if(sa!==sb)return sa-sb;
        return qnum(b.quality)-qnum(a.quality);
      });
      return out;
    });
  }).catch(function(){return tryRef(i+1,id,type,s,e);});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tryRef(0,tmdbId,mediaType,season,episode).then(function(rows){
    console.log("[OnlyFlix/VidFast] quality streams="+rows.length);return rows;
  }).catch(function(){return[];});
}
module.exports={getStreams:getStreams};
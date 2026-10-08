// YFlix Local for Nuvio
// v0.4.1 - YFlix Server 4 / FilmU Singularity expanded-HLS build
//
// Current YFlix S4 iframe:
//   https://embed.filmu.in/movie/{tmdb}
//   https://embed.filmu.in/tv/{tmdb}/{season}/{episode}
//
// v0.4.0 deliberately removes Pulsar/Allmovieland from Nuvio output.
// The simpler Singularity HLS path was verified for both movie and TV and
// avoids the fragile FilmU proxy/header chain that failed on the user's device.

var FILMU="https://embed.filmu.in";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var DIAG=[];

function clean(v){return v==null?"":String(v).trim();}
function diag(msg){msg=clean(msg).replace(/\s+/g," ").slice(0,180);if(msg&&DIAG.indexOf(msg)<0)DIAG.push(msg);}
function statusRows(){
  var a=DIAG.slice(-3);
  if(!a.length)a=["No stream returned"];
  return a.map(function(msg,i){
    var n="YFlix · S4 · DIAG "+(i+1)+" · "+msg;
    return{name:n,title:n,url:"about:error",quality:"Status",type:"diagnostic",provider:"yflix-server4",headers:{},subtitles:[]};
  });
}
function apiHeaders(tmdbId,mediaType,season,episode){
  var ref=mediaType==="tv"
    ? FILMU+"/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season||1))+"/"+encodeURIComponent(String(episode||1))
    : FILMU+"/movie/"+encodeURIComponent(String(tmdbId));
  return{
    "User-Agent":UA,
    "Accept":"application/json, text/plain, */*",
    "Origin":FILMU,
    "Referer":ref
  };
}
function fetchJson(url,opt){
  opt=opt||{};
  try{opt.skipSizeCheck=true;}catch(_){}
  return fetch(url,opt).then(function(r){
    if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"no-response")+(r&&r.statusText?(" · "+r.statusText):""));
    return r.json();
  });
}
function qualityOf(x){
  var q=clean(x&&x.quality)||"1080p";
  if(/^\d+$/.test(q))q+="p";
  return q;
}
function playbackHeaders(x){
  var out={},h=x&&x.headers&&typeof x.headers==="object"?x.headers:{};
  Object.keys(h).forEach(function(k){
    var lk=String(k).toLowerCase();
    if(lk==="range"||lk==="connection"||lk==="accept-encoding"||lk==="host"||lk==="content-length")return;
    var v=clean(h[k]);if(v)out[k]=v;
  });
  if(!out["User-Agent"]&&!out["user-agent"])out["User-Agent"]=UA;
  return out;
}
function subtitleRows(list){
  var out=[],seen={};
  (Array.isArray(list)?list:[]).forEach(function(s,i){
    if(!s||typeof s!=="object")return;
    var u=clean(s.url);
    if(!/^https?:\/\//i.test(u)||seen[u])return;
    seen[u]=1;
    out.push({
      url:u,
      language:clean(s.lang||s.language||s.code)||"und",
      name:clean(s.label||s.name||s.language||s.lang)||("Subtitle "+(i+1))
    });
  });
  return out;
}
function absoluteUrl(base,ref){
  ref=clean(ref);
  if(/^https?:\/\//i.test(ref))return ref;
  try{return new URL(ref,base).toString();}catch(_){return ref;}
}
function qualityFromHeight(h){
  h=parseInt(h,10)||0;
  if(h>=1800)return"2160p";
  if(h>=1300)return"1440p";
  if(h>=1000)return"1080p";
  if(h>=650)return"720p";
  if(h>=440)return"480p";
  if(h>=320)return"360p";
  return h?(h+"p"):"Auto";
}
function expandHlsRow(row){
  return fetch(row.url,{headers:row.headers||{}})
    .then(function(r){
      if(!r||!r.ok)throw new Error("master HTTP "+(r?r.status:"no-response")+(r&&r.statusText?(" · "+r.statusText):""));
      return r.text();
    })
    .then(function(text){
      text=String(text||"");
      if(text.indexOf("#EXTM3U")!==0)throw new Error("not HLS");
      var lines=text.replace(/\r/g,"").split("\n"),vars=[];
      for(var i=0;i<lines.length;i++){
        var line=lines[i].trim();
        if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
        var rm=line.match(/RESOLUTION=(\d+)x(\d+)/i),u="";
        for(var j=i+1;j<lines.length;j++){
          var n=lines[j].trim();
          if(!n)continue;
          if(n.charAt(0)==="#")continue;
          u=absoluteUrl(row.url,n);break;
        }
        if(!u)continue;
        vars.push({url:u,height:rm?parseInt(rm[2],10):0});
      }
      if(!vars.length){
        row.quality=row.quality||"HLS";
        row.name="YFlix · S4 · Singularity · "+row.quality;
        row.title=row.name;
        return[row];
      }
      vars.sort(function(a,b){return(b.height||0)-(a.height||0);});
      var seen={},out=[];
      vars.forEach(function(v){
        if(!v.url||seen[v.url])return;
        seen[v.url]=1;
        var q=qualityFromHeight(v.height);
        var n="YFlix · S4 · Singularity · "+q;
        out.push({
          name:n,title:n,url:v.url,quality:q,type:"hls",
          provider:"yflix-server4",headers:row.headers||{},subtitles:row.subtitles||[]
        });
      });
      return out;
    });
}
function normalizeSingularity(j){
  var rows=[];
  if(j&&Array.isArray(j.sources))rows=rows.concat(j.sources);
  if(j&&j.url){
    rows.push({
      url:(j.multilingual&&j.multilingual_url)||j.url,
      quality:j.quality||"1080p",
      type:"m3u8",
      headers:j.headers
    });
  }
  if(!rows.length&&j&&j.m3u8_path){
    var base=clean(j._base),p=clean(j.m3u8_path),u="";
    if(/^https?:\/\//i.test(p))u=p;
    else if(base)u=base.replace(/\/$/,"")+"/"+p.replace(/^\//,"");
    if(u)rows.push({url:u,quality:"1080p",type:"m3u8",headers:j.headers});
  }

  var out=[],seen={};
  rows.forEach(function(x){
    var u=clean(x&&x.url);
    if(!/^https?:\/\//i.test(u)||seen[u])return;
    if(clean(x&&x.type).toLowerCase()!=="m3u8"&&u.toLowerCase().indexOf(".m3u8")<0)return;
    seen[u]=1;
    var q=qualityOf(x);
    var name="YFlix · S4 · Singularity · "+q;
    out.push({
      name:name,
      title:name,
      url:u,
      quality:q,
      type:"hls",
      provider:"yflix-server4",
      headers:playbackHeaders(x),
      subtitles:subtitleRows((x&&x.subtitles)||(j&&j.subtitles))
    });
  });
  return out;
}
function callSingularity(tmdbId,mediaType,season,episode){
  var u=mediaType==="tv"
    ? FILMU+"/api/singularity-tv?tmdb="+encodeURIComponent(String(tmdbId))+"&s="+encodeURIComponent(String(season))+"&e="+encodeURIComponent(String(episode))
    : FILMU+"/api/singularity-movie?id="+encodeURIComponent(String(tmdbId));

  return fetchJson(u,{headers:apiHeaders(tmdbId,mediaType,season,episode)})
    .then(function(j){
      var rows=normalizeSingularity(j);
      if(!rows.length){diag("Singularity · 0 HLS");return[];}
      return Promise.all(rows.map(expandHlsRow)).then(function(groups){
        var out=[];groups.forEach(function(g){out=out.concat(g||[]);});
        if(!out.length)diag("Singularity · no playable HLS variants");
        return out;
      });
    })
    .catch(function(e){
      var m=e&&e.message?e.message:e;
      diag("Singularity · "+m);
      return[];
    });
}
function getStreams(tmdbId,mediaType,season,episode){
  DIAG=[];
  if(!tmdbId){diag("missing TMDB id");return Promise.resolve(statusRows());}
  mediaType=mediaType==="tv"?"tv":"movie";
  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;
  if(mediaType==="tv"&&(!season||!episode)){diag("TV missing season/episode");return Promise.resolve(statusRows());}

  return callSingularity(String(tmdbId),mediaType,season,episode)
    .then(function(rows){return rows&&rows.length?rows:statusRows();})
    .catch(function(e){
      var m=e&&e.message?e.message:e;
      diag("runtime · "+m);
      return statusRows();
    });
}
function onSettings(){
  return[
    {type:"header",label:"YFlix Local · Server 4"},
    {type:"info",label:"FilmU 稳定版：只使用 Singularity，并在返回前验证/展开 HLS master，直接给 Nuvio 已确认可访问的分辨率子线路。Pulsar/Allmovieland 已移除。"}
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

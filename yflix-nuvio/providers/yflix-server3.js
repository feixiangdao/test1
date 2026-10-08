// YFlix Local for Nuvio
// v0.6.0 - YFlix Server 3 / native VidNest
//
// YFlix S3 originally embeds VidGod. The old VidGod front/worker path became
// unreliable, so this provider follows its native VidNest backend directly:
//   https://new.vidnest.fun/{server}/movie/{tmdb}
//   https://new.vidnest.fun/{server}/tv/{tmdb}/{season}/{episode}
//
// Verified servers:
//   - videasy
//   - nextgencloudfabric
//
// Each candidate HLS is opened and its total duration is checked against TMDB
// runtime before it is exposed to Nuvio. This prevents "playable but wrong
// title" regressions.
//
// React Native / Hermes friendly: no async/await, no Buffer/TextDecoder.

var VIDNEST_API="https://new.vidnest.fun";
var VIDNEST_ORIGIN="https://vidnest.fun";
var TMDB="https://api.themoviedb.org/3";
var DEFAULT_TMDB_API_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var ALPH="RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
var REV=(function(){var m={},i;for(i=0;i<ALPH.length;i++)m[ALPH.charAt(i)]=i;return m;})();

function clean(v){return v==null?"":String(v).trim();}

function settings(){
  try{return(typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS)||{};}
  catch(_){return{};}
}

function tmdbKey(){
  var s=settings(),k=clean(s.tmdbApiKey);
  if(k)return k;
  try{
    k=clean(typeof globalThis!=="undefined"&&globalThis.TMDB_API_KEY);
    if(k)return k;
  }catch(_){}
  return DEFAULT_TMDB_API_KEY;
}

function fetchJson(url,opt){
  opt=opt||{};
  try{opt.skipSizeCheck=true;}catch(_){}
  return fetch(url,opt).then(function(r){
    if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"no-response")+(r&&r.statusText?(" · "+r.statusText):""));
    return r.json();
  });
}

function utf8(bytes){
  var out="",i=0,c,c2,c3,c4,cp;
  while(i<bytes.length){
    c=bytes[i++];
    if(c<128){out+=String.fromCharCode(c);continue;}
    if((c&224)===192){
      c2=bytes[i++]||0;
      out+=String.fromCharCode(((c&31)<<6)|(c2&63));
      continue;
    }
    if((c&240)===224){
      c2=bytes[i++]||0;c3=bytes[i++]||0;
      out+=String.fromCharCode(((c&15)<<12)|((c2&63)<<6)|(c3&63));
      continue;
    }
    if((c&248)===240){
      c2=bytes[i++]||0;c3=bytes[i++]||0;c4=bytes[i++]||0;
      cp=((c&7)<<18)|((c2&63)<<12)|((c3&63)<<6)|(c4&63);
      cp-=65536;
      out+=String.fromCharCode(55296+(cp>>10),56320+(cp&1023));
      continue;
    }
  }
  return out;
}

function decodeCustom(input){
  var p=clean(input),bytes=[],i,c0,c1,c2,c3;
  while(p.length%4)p+="=";
  for(i=0;i<p.length;i+=4){
    c0=REV[p.charAt(i)];
    c1=REV[p.charAt(i+1)];
    c2=p.charAt(i+2)==="="?64:REV[p.charAt(i+2)];
    c3=p.charAt(i+3)==="="?64:REV[p.charAt(i+3)];
    if(c0==null)c0=64;if(c1==null)c1=64;if(c2==null)c2=64;if(c3==null)c3=64;
    if(c0===64||c1===64)break;
    bytes.push(((c0<<2)|(c1>>4))&255);
    if(c2!==64)bytes.push((((c1&15)<<4)|(c2>>2))&255);
    if(c3!==64)bytes.push((((c2&3)<<6)|c3)&255);
  }
  return utf8(bytes);
}

function apiHeaders(){
  return{
    "User-Agent":UA,
    "Accept":"application/json, text/javascript, */*; q=0.01",
    "Accept-Language":"en-US,en;q=0.9",
    "Referer":VIDNEST_ORIGIN+"/",
    "Origin":VIDNEST_ORIGIN
  };
}

function safeHeaders(src){
  var out={},h=src&&typeof src==="object"?src:{},k,v,lk;
  for(k in h){
    if(!Object.prototype.hasOwnProperty.call(h,k))continue;
    lk=String(k).toLowerCase();
    if(lk==="range"||lk==="connection"||lk==="accept-encoding"||lk==="host"||lk==="content-length")continue;
    v=clean(h[k]);if(v)out[k]=v;
  }
  if(!out["User-Agent"]&&!out["user-agent"])out["User-Agent"]=UA;
  return out;
}

function absUrl(base,ref){
  ref=clean(ref);
  if(/^https?:\/\//i.test(ref))return ref;
  var m=String(base).match(/^(https?:\/\/[^/]+)/i);
  if(ref.charAt(0)==="/")return m?m[1]+ref:ref;
  var q=String(base).split("?")[0],p=q.lastIndexOf("/");
  return(p>=0?q.slice(0,p+1):q+"/")+ref;
}

function getTmdbInfo(tmdbId,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie";
  var u=TMDB+"/"+type+"/"+encodeURIComponent(String(tmdbId))+
    "?api_key="+encodeURIComponent(tmdbKey())+"&language=en-US";

  return fetchJson(u,{headers:{"Accept":"application/json","User-Agent":UA}})
    .then(function(d){
      var runtime=parseFloat(d&&d.runtime)||0;
      var info={runtime:runtime,title:clean(d&& (d.title||d.name)),tmdbId:String(tmdbId)};
      if(mediaType!=="tv")return info;

      var ep=TMDB+"/tv/"+encodeURIComponent(String(tmdbId))+
        "/season/"+encodeURIComponent(String(season))+
        "/episode/"+encodeURIComponent(String(episode))+
        "?api_key="+encodeURIComponent(tmdbKey())+"&language=en-US";

      return fetchJson(ep,{headers:{"Accept":"application/json","User-Agent":UA}})
        .then(function(e){
          info.runtime=parseFloat(e&&e.runtime)||runtime;
          return info;
        })
        .catch(function(){return info;});
    });
}

function fetchVidNest(server,tmdbId,mediaType,season,episode){
  var path=mediaType==="tv"
    ? "tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season))+"/"+encodeURIComponent(String(episode))
    : "movie/"+encodeURIComponent(String(tmdbId));
  var u=VIDNEST_API+"/"+server+"/"+path;

  return fetchJson(u,{headers:apiHeaders()})
    .then(function(outer){
      var root=outer&&outer.data;
      if(outer&&outer.encrypted&&typeof root==="string"){
        root=JSON.parse(decodeCustom(root));
      }
      if(!root||typeof root!=="object")throw new Error("empty VidNest payload");
      return root;
    });
}

function collectStreams(root){
  var out=[],i,s,u,h;

  if(Array.isArray(root&&root.streams)){
    for(i=0;i<root.streams.length;i++){
      s=root.streams[i];
      if(!s||typeof s!=="object")continue;
      u=clean(s.url);
      if(!/^https?:\/\//i.test(u))continue;
      out.push({
        url:u,
        quality:clean(s.quality)||"Auto",
        language:clean(s.language)||"",
        type:clean(s.type),
        headers:safeHeaders(s.headers||root.headers)
      });
    }
  }

  if(Array.isArray(root&&root.sources)){
    for(i=0;i<root.sources.length;i++){
      s=root.sources[i];
      if(!s||typeof s!=="object")continue;
      u=clean(s.url||s.file);
      if(!/^https?:\/\//i.test(u))continue;
      out.push({
        url:u,
        quality:clean(s.quality)||"Auto",
        language:clean(s.language)||"",
        type:clean(s.type),
        headers:safeHeaders(s.headers||root.headers)
      });
    }
  }

  if(root&&typeof root.url==="string"&&/^https?:\/\//i.test(root.url)){
    out.push({
      url:root.url,
      quality:clean(root.quality)||"Auto",
      language:clean(root.language)||"",
      type:clean(root.type),
      headers:safeHeaders(root.headers)
    });
  }

  if(Array.isArray(root&&root.url)){
    for(i=0;i<root.url.length;i++){
      s=root.url[i];
      u=clean(s&&s.link);
      if(!/^https?:\/\//i.test(u))continue;
      out.push({url:u,quality:clean(s.quality)||"Auto",language:"",type:clean(s.type),headers:safeHeaders(s.headers||root.headers)});
    }
  }

  return out;
}

function durationFromText(text){
  var re=/#EXTINF:([0-9.]+)/g,m,total=0,count=0;
  text=String(text||"");
  while((m=re.exec(text))){
    total+=parseFloat(m[1])||0;
    count++;
  }
  return count?total:0;
}

function parseVariants(base,text){
  var lines=String(text||"").replace(/\r/g,"").split("\n");
  var out=[],i,line,m,u,j,next;
  for(i=0;i<lines.length;i++){
    line=clean(lines[i]);
    if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    m=line.match(/RESOLUTION=(\d+)x(\d+)/i);
    next="";
    for(j=i+1;j<lines.length;j++){
      u=clean(lines[j]);
      if(!u)continue;
      if(u.charAt(0)==="#")continue;
      next=absUrl(base,u);break;
    }
    if(next)out.push({url:next,height:m?parseInt(m[2],10):0});
  }
  return out;
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

function runtimeMatches(expectedMin,actualSec){
  expectedMin=parseFloat(expectedMin)||0;
  actualSec=parseFloat(actualSec)||0;
  if(!expectedMin||!actualSec)return false;
  var actualMin=actualSec/60;
  var tol=Math.max(6,expectedMin*0.12);
  return Math.abs(actualMin-expectedMin)<=tol;
}

function readMediaDuration(url,headers,depth){
  depth=depth||0;
  if(depth>4)return Promise.reject(new Error("HLS nesting too deep"));
  return fetch(url,{headers:headers||{}})
    .then(function(r){
      if(!r||!r.ok)throw new Error("HLS HTTP "+(r?r.status:"no-response"));
      return r.text();
    })
    .then(function(text){
      text=String(text||"");
      if(text.indexOf("#EXTM3U")!==0)throw new Error("not HLS");
      var sec=durationFromText(text);
      if(sec)return{seconds:sec,text:text,url:url};
      var vars=parseVariants(url,text);
      if(!vars.length)throw new Error("empty master");
      vars.sort(function(a,b){return(b.height||0)-(a.height||0);});
      return readMediaDuration(vars[0].url,headers,depth+1);
    });
}

function expandValidated(server,rows,expectedMin){
  var idx=0;

  function tryNext(){
    if(idx>=rows.length)return Promise.resolve([]);
    var row=rows[idx++];
    var u=clean(row.url);
    var isHls=clean(row.type).toLowerCase().indexOf("hls")>=0||
      u.toLowerCase().indexOf(".m3u8")>=0||
      u.toLowerCase().indexOf("/hls/")>=0||
      u.toLowerCase().indexOf("goodstream")>=0;

    if(!isHls)return tryNext();

    return fetch(u,{headers:row.headers||{}})
      .then(function(r){
        if(!r||!r.ok)throw new Error("master HTTP "+(r?r.status:"no-response"));
        return r.text();
      })
      .then(function(master){
        if(String(master).indexOf("#EXTM3U")!==0)throw new Error("not HLS");
        var vars=parseVariants(u,master);

        if(!vars.length){
          var sec=durationFromText(master);
          if(!runtimeMatches(expectedMin,sec))throw new Error("runtime mismatch");
          return [{
            name:"YFlix · S3 · "+server+" · Auto",
            title:"YFlix · S3 · "+server+" · Auto",
            url:u,quality:"Auto",type:"hls",provider:"yflix-server3",
            headers:row.headers||{},subtitles:[]
          }];
        }

        vars.sort(function(a,b){return(b.height||0)-(a.height||0);});
        return readMediaDuration(vars[0].url,row.headers||{},1)
          .then(function(d){
            if(!runtimeMatches(expectedMin,d.seconds))throw new Error("runtime mismatch");
            var seen={},out=[];
            vars.forEach(function(v){
              if(!v.url||seen[v.url])return;
              seen[v.url]=1;
              var q=qualityFromHeight(v.height);
              var n="YFlix · S3 · "+server+" · "+q;
              out.push({
                name:n,title:n,url:v.url,quality:q,type:"hls",
                provider:"yflix-server3",headers:row.headers||{},subtitles:[]
              });
            });
            return out;
          });
      })
      .catch(function(){return tryNext();});
  }

  return tryNext();
}

function serverStreams(server,label,tmdbId,mediaType,season,episode,expectedMin){
  return fetchVidNest(server,tmdbId,mediaType,season,episode)
    .then(collectStreams)
    .then(function(rows){return expandValidated(label,rows,expectedMin);})
    .catch(function(){return[];});
}

function dedupe(rows){
  var out=[],seen={};
  (rows||[]).forEach(function(x){
    if(!x||!x.url||seen[x.url])return;
    seen[x.url]=1;out.push(x);
  });
  return out;
}

function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  mediaType=mediaType==="tv"?"tv":"movie";
  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);

  return getTmdbInfo(String(tmdbId),mediaType,season,episode)
    .then(function(info){
      var expected=parseFloat(info&&info.runtime)||0;
      if(!expected)return[];
      return Promise.all([
        serverStreams("videasy","Videasy",String(tmdbId),mediaType,season,episode,expected),
        serverStreams("nextgencloudfabric","NextGen",String(tmdbId),mediaType,season,episode,expected)
      ]).then(function(all){
        return dedupe((all[0]||[]).concat(all[1]||[]));
      });
    })
    .catch(function(){return[];});
}

function onSettings(){
  return[
    {type:"header",label:"YFlix Local · Server 3"},
    {
      type:"info",
      label:"VidGod/VidNest 原生解析版：使用 Videasy 与 NextGen 两条 VidNest HLS，并在显示前用 TMDB 正片/单集时长验证内容身份。"
    },
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"用于取得电影或单集时长，防止错片。留空使用备用 Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}

module.exports={getStreams:getStreams,onSettings:onSettings};

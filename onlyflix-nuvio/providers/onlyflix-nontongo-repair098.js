var UA="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36";
var SPEED="https://api.speedracelight.com";
// Public TMDB v3 client key exposed by the current player.videasy.to frontend bundle.
var VIDEASY_TMDB_KEY="8476a7ab80ad76f0936744df0430e67c";
var VIDNEST="https://new.vidnest.fun";
var VIDNEST_ALPH="RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
var VCONST=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580];
var VMAGIC=[109,118,109,49];

function clean(v){return v==null?"":String(v).trim();}
function copyHeaders(src){
  var h={"User-Agent":UA};
  if(src&&typeof src==="object")Object.keys(src).forEach(function(k){h[k]=String(src[k]);});
  return h;
}
function directMedia(url,type){
  url=clean(url);type=clean(type).toLowerCase();
  if(!/^https?:\/\//i.test(url))return false;
  if(type==="mp4")return true;
  if(type==="hls"||type==="m3u8")return true;
  return /\.(m3u8|mp4)(?:[?#]|$)/i.test(url)||/\/hls\//i.test(url);
}
function addRows(out,data,label){
  function add(x){
    if(!x||typeof x!=="object")return;
    var url=clean(x.url||x.file||x.link);
    var type=clean(x.type)||(/\.mp4(?:[?#]|$)/i.test(url)?"mp4":"hls");
    if(!directMedia(url,type))return;
    var q=clean(x.quality||x.resolution||x.label)||"Auto";
    var h=copyHeaders(x.headers);
    if(!h.Referer)h.Referer="https://player.videasy.to/";
    var name="OnlyFlix · NontonGo · "+label+" · "+q;
    out.push({name:name,title:name,url:url,quality:q,type:type==="mp4"?"mp4":"hls",provider:"onlyflix-nontongo",headers:h,subtitles:[]});
  }
  if(!data||typeof data!=="object")return out;
  if(Array.isArray(data.sources))data.sources.forEach(add);
  if(Array.isArray(data.streams))data.streams.forEach(add);
  if(Array.isArray(data.url))data.url.forEach(add);
  else if(typeof data.url==="string")add({url:data.url,type:data.type,quality:data.quality,headers:data.headers});
  if(data.data&&Array.isArray(data.data.downloads))data.data.downloads.forEach(add);
  return out;
}

function oddTri(n){return ((n*(n+1))&1)===1;}
function evenTri(n){return ((n*(n+1))&1)===0;}
function mix32(x){
  x>>>=0;x^=x>>>16;x=Math.imul(x,2246822507)>>>0;x^=x>>>13;x=Math.imul(x,3266489909)>>>0;return (x^(x>>>16))>>>0;
}
function rotl32(x,n){
  x>>>=0;n&=31;return n===0?x>>>0:((x<<n)|(x>>>(32-n)))>>>0;
}
function rc4Seed(seed){
  var S=Array(256),i,j=0,t;
  for(i=0;i<256;i++)S[i]=i;
  for(i=0;i<256;i++){
    j=(j+S[i]+seed.charCodeAt(i%seed.length))&255;
    t=S[i];S[i]=S[j];S[j]=t;
  }
  return S;
}
function seedHash(seed){
  var x=1732584193;
  for(var i=0;i<seed.length;i++)x=rotl32((x^Math.imul(seed.charCodeAt(i),VCONST[i&15]))>>>0,5);
  return mix32(x);
}
function fnvMix(seed){
  var x=2166136261;
  for(var i=0;i<seed.length;i++)x=Math.imul(x^seed.charCodeAt(i),16777619)>>>0;
  return mix32(x);
}
function initState(seed,mediaId){
  if(oddTri(seed.length))return {S:rc4Seed(seed),acc:seedHash(seed)};
  var S=Array(61),a=mix32(fnvMix(seed)^mix32((mediaId>>>0)^2654435769))>>>0;
  for(var i=0;i<8;i++){
    if(evenTri(i)){
      var idx=a%61;
      a=rotl32((a+2654435769)>>>0,7+(7&i));
      S[idx]=(a^mix32(a))>>>0;
      a=mix32((a+idx)>>>0);
    }else S[i]=VCONST[i&15];
  }
  return {S:S,acc:mix32(2779096485^a)>>>0};
}
function nextWord(st,counter){
  var S=st.S,o=st.acc,n=o%61,mask=0-Number(n in S),d=S[n]>>>0;
  var a=(d^(Math.imul(2654435769,counter+1)>>>0))>>>0;
  var l=(((o^a)>>>0)|((o&a&mask)>>>0))>>>0;
  l=(rotl32((l+o)>>>0,31&n)^rotl32(o,31&Math.imul(n,7)))>>>0;
  o=mix32((l+2654435769)>>>0);
  S[n]=o>>>0;st.acc=o;return o>>>0;
}
function keyStream(seed,mediaId,len){
  var st=initState(seed,mediaId),out=new Uint8Array(len),counter=0,p=0,x;
  while(p<len){
    x=nextWord(st,counter++);
    out[p++]=x&255;
    if(p<len)out[p++]=(x>>>8)&255;
    if(p<len)out[p++]=(x>>>16)&255;
    if(p<len)out[p++]=(x>>>24)&255;
  }
  return out;
}
function b64urlBytes(s){
  s=clean(s).replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  var bin=atob(s),out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
function decryptVideasy(payload,seed,mediaId){
  var r=b64urlBytes(payload),ks=keyStream(seed,mediaId,r.length);
  for(var i=0;i<r.length;i++)r[i]^=ks[i];
  for(i=0;i<VMAGIC.length;i++)if(r[i]!==VMAGIC[i])throw new Error("videasy bad seed");
  return new TextDecoder("utf-8").decode(r.subarray(VMAGIC.length));
}

function tmdbMeta(tmdbId,mediaType){
  var kind=mediaType==="tv"?"tv":"movie";
  var u="https://api.themoviedb.org/3/"+kind+"/"+encodeURIComponent(String(tmdbId))+
    "?api_key="+encodeURIComponent(VIDEASY_TMDB_KEY)+"&language=en-US";
  if(kind==="tv")u+="&append_to_response=external_ids";
  return fetch(u,{headers:{"User-Agent":UA,"Accept":"application/json"}}).then(function(r){
    if(!r.ok)throw new Error("TMDB "+r.status);
    return r.json();
  }).then(function(j){
    if(!j)throw new Error("TMDB empty");
    if(kind==="movie"){
      return {title:clean(j.title||j.original_title),year:clean(j.release_date).slice(0,4),imdbId:clean(j.imdb_id),totalSeasons:""};
    }
    return {title:clean(j.name||j.original_name),year:clean(j.first_air_date).slice(0,4),imdbId:clean(j.external_ids&&j.external_ids.imdb_id),totalSeasons:clean(j.number_of_seasons)};
  });
}
function q(v){return encodeURIComponent(String(v==null?"":v));}
function speedUrl(path,meta,tmdbId,mediaType,season,episode,seed){
  var parts=[];
  parts.push("title="+q(encodeURIComponent(meta.title)));
  parts.push("mediaType="+q(mediaType==="tv"?"tv":"movie"));
  parts.push("year="+q(meta.year));
  if(mediaType==="tv"){
    parts.push("totalSeasons="+q(meta.totalSeasons));
    parts.push("episodeId="+q(episode||1));
    parts.push("seasonId="+q(season||1));
  }
  parts.push("tmdbId="+q(tmdbId));
  parts.push("imdbId="+q(meta.imdbId));
  parts.push("enc=2");
  parts.push("seed="+q(seed));
  return SPEED+path+"?"+parts.join("&");
}
function resolveVideasy(tmdbId,mediaType,season,episode){
  var h={"Accept":"*/*","Origin":"https://player.videasy.to","Referer":"https://player.videasy.to/","User-Agent":UA};
  return tmdbMeta(tmdbId,mediaType).then(function(meta){
    return fetch(SPEED+"/seed?mediaId="+q(tmdbId),{headers:h}).then(function(r){
      if(!r.ok)throw new Error("seed "+r.status);
      return r.json();
    }).then(function(seedObj){
      var seed=clean(seedObj&&seedObj.seed);
      if(!seed)throw new Error("seed missing");
      var paths=["/vsrc/sources-with-title","/cdn/sources-with-title"],i=0;
      function next(){
        if(i>=paths.length)return Promise.resolve([]);
        var path=paths[i++],u=speedUrl(path,meta,tmdbId,mediaType,season,episode,seed);
        return fetch(u,{headers:h}).then(function(r){
          if(!r.ok)throw new Error("videasy "+r.status);
          return r.text();
        }).then(function(enc){
          var dec=decryptVideasy(enc,seed,parseInt(tmdbId,10));
          var data=JSON.parse(dec),rows=[];
          addRows(rows,data,"Videasy");
          if(rows.length){
            var subs=data&&Array.isArray(data.subtitles)?data.subtitles:[];
            if(subs.length)rows.forEach(function(row){
              row.subtitles=subs.filter(function(s){return s&&(s.url||s.file);}).slice(0,12).map(function(s){
                return {url:clean(s.url||s.file),language:clean(s.language||s.lang||"en"),name:clean(s.label||s.name||s.language||"Subtitle")};
              });
            });
            return rows;
          }
          return next();
        }).catch(function(){return next();});
      }
      return next();
    });
  }).catch(function(e){
    console.log("[OnlyFlix/NontonGo/Videasy] "+(e&&e.message?e.message:e));
    return[];
  });
}

function utf8VidNest(bytes){
  var out="",i=0;
  while(i<bytes.length){
    var c=bytes[i++];
    if(c<128){out+=String.fromCharCode(c);continue;}
    if((c&224)===192&&i<bytes.length){var c2=bytes[i++];out+=String.fromCharCode(((c&31)<<6)|(c2&63));continue;}
    if((c&240)===224&&i+1<bytes.length){var c2b=bytes[i++],c3=bytes[i++];out+=String.fromCharCode(((c&15)<<12)|((c2b&63)<<6)|(c3&63));continue;}
    if((c&248)===240&&i+2<bytes.length){var c2c=bytes[i++],c3b=bytes[i++],c4=bytes[i++],cp=((c&7)<<18)|((c2c&63)<<12)|((c3b&63)<<6)|(c4&63);cp-=65536;out+=String.fromCharCode(55296+(cp>>10),56320+(cp&1023));}
  }
  return out;
}
function decryptVidNest(data){
  data=clean(data);if(!data)return null;
  var lookup={},i;for(i=0;i<VIDNEST_ALPH.length;i++)lookup[VIDNEST_ALPH.charAt(i)]=i;
  var bytes=[];
  for(i=0;i<data.length;i+=4){
    var chunk=(data.slice(i,i+4)+"====").slice(0,4),v=[];
    for(var j=0;j<4;j++)v[j]=Object.prototype.hasOwnProperty.call(lookup,chunk.charAt(j))?lookup[chunk.charAt(j)]:64;
    bytes.push(((v[0]<<2)|(v[1]>>4))&255);
    if(v[2]!==64)bytes.push((((v[1]&15)<<4)|(v[2]>>2))&255);
    if(v[3]!==64)bytes.push((((v[2]&3)<<6)|v[3])&255);
  }
  var text=utf8VidNest(bytes);
  try{return JSON.parse(text);}catch(e){
    var m=text.match(/\{[\s\S]*\}/);
    if(m)try{return JSON.parse(m[0]);}catch(_){}
    return null;
  }
}

function absolutize(base,ref){
  ref=clean(ref);
  if(/^https?:\/\//i.test(ref))return ref;
  try{return new URL(ref,base).toString();}catch(e){return ref;}
}
function stdQualityFromSize(w,h){
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
function parseMasterVariants(text,baseUrl){
  var lines=String(text||"").replace(/\r/g,"").split("\n"),out=[];
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var rm=line.match(/RESOLUTION=(\d+)x(\d+)/i),bm=line.match(/BANDWIDTH=(\d+)/i),uri="";
    for(var j=i+1;j<lines.length;j++){
      var n=lines[j].trim();
      if(!n)continue;
      if(n.charAt(0)==="#")continue;
      uri=n;break;
    }
    if(!uri)continue;
    var w=rm?parseInt(rm[1],10):0,h=rm?parseInt(rm[2],10):0;
    out.push({
      url:absolutize(baseUrl,uri),
      width:w,
      height:h,
      bandwidth:bm?parseInt(bm[1],10):0,
      quality:stdQualityFromSize(w,h)
    });
  }
  out.sort(function(a,b){
    var ah=a.height||0,bh=b.height||0;
    if(ah!==bh)return bh-ah;
    return (b.bandwidth||0)-(a.bandwidth||0);
  });
  return out;
}
function unwrapStreamvault(url){
  url=clean(url);
  if(url.indexOf("https://streamvaultsrc.click/stream-proxy/")!==0)return url;
  try{
    var u=new URL(url),raw=u.searchParams.get("u");
    return raw?decodeURIComponent(raw):url;
  }catch(e){
    var m=url.match(/[?&]u=([^&]+)/);
    if(!m)return url;
    try{return decodeURIComponent(m[1]);}catch(_){return url;}
  }
}
function rewriteUriAttribute(line,baseUrl){
  return String(line||"").replace(/URI="([^"]+)"/g,function(_,uri){
    var absolute=absolutize(baseUrl,uri);
    return 'URI="'+unwrapStreamvault(absolute)+'"';
  });
}
function rewriteMediaPlaylist(text,baseUrl){
  var lines=String(text||"").replace(/\r/g,"").split("\n"),out=[],first="";
  for(var i=0;i<lines.length;i++){
    var raw=lines[i],t=raw.trim();
    if(!t){out.push(raw);continue;}
    if(t.charAt(0)==="#"){
      out.push(rewriteUriAttribute(raw,baseUrl));
      continue;
    }
    var absolute=absolutize(baseUrl,t);
    var direct=unwrapStreamvault(absolute);
    if(!first)first=direct;
    out.push(direct);
  }
  return {text:out.join("\n"),first:first};
}
function asciiDataUri(text){
  try{
    return "data:application/vnd.apple.mpegurl;base64,"+btoa(String(text||""));
  }catch(e){
    return "";
  }
}
function repairAnimangaRow(row,label){
  if(!row||!row.url||row.url.indexOf("https://tiktoks.animanga.fun/hls/")!==0)return Promise.resolve([]);
  var sourceHeaders=row.headers||{};
  return fetch(row.url,{headers:sourceHeaders}).then(function(r){
    if(!r.ok)throw new Error("animanga master "+r.status);
    return r.text();
  }).then(function(master){
    var vars=parseMasterVariants(master,row.url);
    if(!vars.length)throw new Error("animanga variants missing");
    var v=vars[0];
    return fetch(v.url,{headers:sourceHeaders}).then(function(r){
      if(!r.ok)throw new Error("variant "+r.status);
      return r.text();
    }).then(function(media){
      var rw=rewriteMediaPlaylist(media,v.url);
      if(!rw.first||rw.first.indexOf("https://streamvaultsrc.click/")===0)throw new Error("direct segment missing");
      return fetch(rw.first,{method:"HEAD",headers:{"User-Agent":UA}}).then(function(sr){
        if(!sr.ok)throw new Error("segment "+sr.status);
        var dataUrl=asciiDataUri(rw.text);
        if(!dataUrl)throw new Error("data playlist failed");
        var detail=v.width&&v.height?v.quality+" ("+v.width+"×"+v.height+")":v.quality;
        var name="OnlyFlix · NontonGo · "+label+" · "+detail;
        return [{
          name:name,
          title:name,
          url:dataUrl,
          quality:v.quality,
          type:"hls",
          provider:"onlyflix-nontongo",
          headers:{"User-Agent":UA},
          subtitles:row.subtitles||[]
        }];
      });
    });
  }).catch(function(e){
    console.log("[OnlyFlix/NontonGo/repair] "+(e&&e.message?e.message:e));
    return[];
  });
}
function repairVidNestRows(rows,backend){
  rows=rows||[];
  if(backend!=="videasy")return Promise.resolve(rows);
  var animanga=rows.filter(function(r){return r&&r.url&&r.url.indexOf("https://tiktoks.animanga.fun/hls/")===0;});
  if(!animanga.length)return Promise.resolve(rows);
  return repairAnimangaRow(animanga[0],"VidNest/videasy-direct").then(function(fixed){
    if(fixed.length)return fixed;
    return[];
  });
}

function resolveVidNest(tmdbId,mediaType,season,episode){
  var list=mediaType==="tv"?["klikxxi","videasy","hollymoviehd"]:["videasy","hollymoviehd"],i=0;
  function next(){
    if(i>=list.length)return Promise.resolve([]);
    var b=list[i++],path=mediaType==="tv"
      ?"/"+b+"/tv/"+q(tmdbId)+"/"+q(season||1)+"/"+q(episode||1)
      :"/"+b+"/movie/"+q(tmdbId);
    return fetch(VIDNEST+path,{headers:{
      "User-Agent":"Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0",
      "Accept":"application/json, */*","Origin":"https://vidnest.fun","Referer":"https://vidnest.fun/"
    }}).then(function(r){
      if(!r.ok)throw new Error("vidnest "+r.status);
      return r.json();
    }).then(function(j){
      var data=j&&j.encrypted?decryptVidNest(j.data):j,rows=[];
      addRows(rows,data,"VidNest/"+b);
      if(!rows.length)return next();
      return repairVidNestRows(rows,b).then(function(fixed){
        return fixed&&fixed.length?fixed:next();
      });
    }).catch(function(){return next();});
  }
  return next();
}
function firstNonEmpty(tasks,timeoutMs){
  return new Promise(function(resolve){
    var done=false,pending=tasks.length;
    function finish(rows){
      if(done)return;
      if(rows&&rows.length){done=true;resolve(rows);return;}
      pending--;
      if(pending<=0){done=true;resolve([]);}
    }
    tasks.forEach(function(fn){
      Promise.resolve().then(fn).then(finish).catch(function(){finish([]);});
    });
    setTimeout(function(){if(!done){done=true;resolve([]);}},timeoutMs);
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return firstNonEmpty([
    function(){return resolveVideasy(tmdbId,mediaType,season,episode);},
    function(){return resolveVidNest(tmdbId,mediaType,season,episode);}
  ],12000).then(function(rows){
    console.log("[OnlyFlix/NontonGo] race streams="+rows.length);
    if(rows&&rows.length)return rows;
    return [{
      name:"OnlyFlix · NontonGo · No stream (diagnostic)",
      title:"OnlyFlix · NontonGo · No stream (diagnostic)",
      url:"about:error",
      quality:"Status",
      type:"diagnostic",
      provider:"onlyflix-nontongo",
      headers:{},
      subtitles:[]
    }];
  }).catch(function(){
    return [{
      name:"OnlyFlix · NontonGo · Error (diagnostic)",
      title:"OnlyFlix · NontonGo · Error (diagnostic)",
      url:"about:error",
      quality:"Status",
      type:"diagnostic",
      provider:"onlyflix-nontongo",
      headers:{},
      subtitles:[]
    }];
  });
}
module.exports={getStreams:getStreams};

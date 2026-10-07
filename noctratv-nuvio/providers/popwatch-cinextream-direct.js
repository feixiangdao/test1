// NoctraTV · PopWatch · CineXtream — direct local resolver
// Bypasses the currently broken Noctra/MZone standalone dependency.
// Public CineXtream API: https://cinextream.cc/api/proxy
// Payload encryption: SHA-256(tmdb + fixed salt), bytewise XOR. No iframe fallback.

var BASE="https://cinextream.cc";
var API=BASE+"/api/proxy";
var SALT="c1n3t4r-0bf5c4t10n-s4lt-v1-2024-09";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
var SERVERS=[
  {name:"Nest",movie:true,tv:true}
];

function clean(v){return v==null?"":String(v).trim();}
function headers(extra){
  var h={
    "User-Agent":UA,
    "Referer":BASE+"/",
    "Origin":BASE,
    "Accept":"application/json,text/plain,*/*"
  };
  Object.keys(extra||{}).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function b64bytes(s){
  var x=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  while(x.length%4)x+="=";
  var bin=atob(x),out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
function sha256Bytes(s){
  return globalThis.crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(s)))
    .then(function(b){return new Uint8Array(b);});
}
function decryptPayload(root,tmdbId){
  if(!root||typeof root!=="object"||!root.enc)return Promise.resolve(root);
  return sha256Bytes(String(tmdbId)+SALT).then(function(key){
    var src=b64bytes(root.enc),out=new Uint8Array(src.length);
    for(var i=0;i<src.length;i++){
      out[i]=src[i]^key[i%32]^((i*7+13)&255);
    }
    var txt=new TextDecoder("utf-8").decode(out);
    return JSON.parse(txt);
  });
}
function apiUrl(server,tmdbId,mediaType,season,episode){
  var q=[
    "server="+encodeURIComponent(server),
    "tmdb="+encodeURIComponent(String(tmdbId)),
    "type="+encodeURIComponent(mediaType==="tv"?"series":"movie")
  ];
  if(mediaType==="tv"){
    q.push("season="+encodeURIComponent(String(season||1)));
    q.push("episode="+encodeURIComponent(String(episode||1)));
  }
  return API+"?"+q.join("&");
}
function collect(value,inherit,out){
  inherit=inherit||{};
  if(value==null)return;
  if(typeof value==="string"){
    var u=clean(value);
    if(/^https?:\/\//i.test(u)&&!(/\.(?:jpg|jpeg|png|webp|gif|vtt|srt)(?:[?#]|$)/i.test(u))){
      out.push({url:u,headers:inherit});
    }
    return;
  }
  if(Array.isArray(value)){
    value.forEach(function(x){collect(x,inherit,out);});
    return;
  }
  if(typeof value==="object"){
    var hh=inherit;
    if(value.headers&&typeof value.headers==="object"){
      hh={};
      Object.keys(inherit).forEach(function(k){hh[k]=inherit[k];});
      Object.keys(value.headers).forEach(function(k){
        if(typeof value.headers[k]==="string")hh[k]=value.headers[k];
      });
    }
    var direct=clean(value.url||value.file||value.src||value.link||value.playlist);
    if(/^https?:\/\//i.test(direct)&&!(/\.(?:jpg|jpeg|png|webp|gif|vtt|srt)(?:[?#]|$)/i.test(direct))){
      out.push({
        url:direct,
        headers:hh,
        quality:clean(value.quality||value.label||value.resolution),
        type:clean(value.type||value.format)
      });
    }
    Object.keys(value).forEach(function(k){
      if(k==="headers"||k==="url"||k==="file"||k==="src"||k==="link"||k==="playlist")return;
      collect(value[k],hh,out);
    });
  }
}
function qnum(v){
  var s=String(v||"").toLowerCase();
  if(/2160|4k/.test(s))return 2160;
  var m=s.match(/(1440|1080|720|576|540|480|360)/);
  return m?parseInt(m[1],10):0;
}
function qualityLabel(q,url,body){
  var n=qnum(q)||qnum(url);
  if(body){
    var m,re=/RESOLUTION=\d+x(\d+)/ig,max=0;
    while((m=re.exec(String(body)))!==null)max=Math.max(max,parseInt(m[1],10)||0);
    n=Math.max(n,max);
  }
  if(n>=2160)return"4K";
  return n?n+"p":"Auto";
}
function absUrl(u,base){
  try{return new URL(u,base).toString();}catch(_){return clean(u);}
}
function firstMediaLine(body){
  var lines=String(body||"").split(/\r?\n/);
  for(var i=0;i<lines.length;i++){
    var q=lines[i].trim();
    if(q&&q.charAt(0)!=="#")return q;
  }
  return "";
}
function bestVariant(body,base){
  var lines=String(body||"").split(/\r?\n/),best=null;
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var m=/RESOLUTION=\d+x(\d+)/i.exec(line),h=m?parseInt(m[1],10)||0:0;
    var uri="";
    for(var j=i+1;j<lines.length;j++){
      var x=lines[j].trim();
      if(x&&x.charAt(0)!=="#"){uri=absUrl(x,base);break;}
    }
    if(uri&&(!best||h>best.height))best={url:uri,height:h};
  }
  return best;
}
function probeSegment(url,h){
  return fetch(url,{headers:Object.assign({},h,{"Range":"bytes=0-65535"})}).then(function(r){
    if(!(r.ok||r.status===206))throw new Error("segment HTTP "+r.status);
    var ct=clean(r.headers.get("content-type")).toLowerCase();
    if(/text\/html|application\/json/.test(ct))throw new Error("segment is error page");
    return r.arrayBuffer();
  }).then(function(b){
    if(!b||!b.byteLength)throw new Error("empty segment");
    return true;
  });
}
function validate(row){
  var u=clean(row&&row.url);
  if(!/^https?:\/\//i.test(u))return Promise.resolve(null);
  var h=headers(row.headers||{});
  var type=clean(row.type).toLowerCase();
  if(type==="mp4"||/\.mp4(?:[?#]|$)/i.test(u)){
    return fetch(u,{headers:Object.assign({},h,{"Range":"bytes=0-65535"})}).then(function(r){
      if(!(r.ok||r.status===206))throw new Error("MP4 HTTP "+r.status);
      var ct=clean(r.headers.get("content-type")).toLowerCase();
      if(/text\/html|application\/json/.test(ct))throw new Error("not media");
      return{url:u,type:"mp4",quality:qualityLabel(row.quality,u),headers:h};
    });
  }
  return fetch(u,{headers:h}).then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text().then(function(body){return{body:body,finalUrl:r.url||u};});
  }).then(function(x){
    var body=String(x.body||"");
    if(body.indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    var masterQuality=qualityLabel(row.quality,u,body);
    var v=bestVariant(body,x.finalUrl);
    if(v){
      return fetch(v.url,{headers:h}).then(function(r){
        if(!r.ok)throw new Error("variant HTTP "+r.status);
        return r.text().then(function(child){return{child:child,finalUrl:r.url||v.url};});
      }).then(function(y){
        if(String(y.child||"").indexOf("#EXTM3U")!==0)throw new Error("bad variant HLS");
        var first=firstMediaLine(y.child);
        if(!first)throw new Error("variant has no media");
        return probeSegment(absUrl(first,y.finalUrl),h).then(function(){
          return{url:u,type:"hls",quality:v.height?qualityLabel(v.height+"p",u):masterQuality,headers:h};
        });
      });
    }
    var first=firstMediaLine(body);
    if(!first)throw new Error("HLS has no media");
    return probeSegment(absUrl(first,x.finalUrl),h).then(function(){
      return{url:u,type:"hls",quality:masterQuality,headers:h};
    });
  });
}
function one(server,tmdbId,mediaType,season,episode){
  return fetch(apiUrl(server.name,tmdbId,mediaType,season,episode),{headers:headers()})
    .then(function(r){
      if(!r.ok)throw new Error("API HTTP "+r.status);
      return r.json();
    })
    .then(function(root){return decryptPayload(root,tmdbId);})
    .then(function(decoded){
      var rows=[];
      collect(decoded&&decoded.data!=null?decoded.data:decoded,{},rows);
      var seen={},uniq=[];
      rows.forEach(function(x){
        if(!x.url||seen[x.url])return;
        seen[x.url]=1;uniq.push(x);
      });
      var i=0;
      function next(){
        if(i>=uniq.length)return Promise.resolve(null);
        var x=uniq[i++];
        return validate(x).then(function(v){
          if(!v)return next();
          var name="NoctraTV · PopWatch · CineXtream · "+server.name+" · "+v.quality;
          return{
            name:name,title:name,url:v.url,quality:v.quality,type:v.type,
            provider:"noctra-popwatch-cinextream-direct",
            headers:v.headers,
            subtitles:[]
          };
        }).catch(function(e){
          console.log("[Noctra/PopWatch/CineXtream] "+server.name+" candidate "+(e&&e.message?e.message:e));
          return next();
        });
      }
      return next();
    }).catch(function(e){
      console.log("[Noctra/PopWatch/CineXtream] "+server.name+" "+(e&&e.message?e.message:e));
      return null;
    });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var list=SERVERS.filter(function(s){return mediaType==="tv"?s.tv:s.movie;});
  var out=[],i=0;
  function next(){
    if(i>=list.length)return Promise.resolve(out);
    var s=list[i++];
    return one(s,tmdbId,mediaType,season,episode).then(function(x){
      if(x)out.push(x);
      return next();
    });
  }
  return next().then(function(rows){
    console.log("[Noctra/PopWatch/CineXtream] "+mediaType+" "+tmdbId+" streams="+rows.length);
    return rows;
  }).catch(function(e){
    console.log("[Noctra/PopWatch/CineXtream] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

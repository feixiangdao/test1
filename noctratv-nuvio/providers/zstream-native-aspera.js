// NoctraTV research · ZStream Native · Aspera
// Reconstructs the current native Aspera resolver from ZStreamNativeSources.
// Protocol: enc-dec VidLink TMDB token -> vidlink.pro /api/b/{movie|tv} -> direct HLS/file.
// Research-only until NoctraTV Apollo/Vienna/Chase alias mapping is proven.

var ENC="https://enc-dec.app/api/enc-vidlink?text=";
var BASE="https://vidlink.pro";
var FILE_PROXY="https://tokyo.fontaine.lol/mp4-proxy.mp4";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function hdr(extra){
  var h={"User-Agent":UA,"Origin":BASE,"Referer":BASE+"/","Accept":"application/json,text/plain,*/*"};
  if(extra)Object.keys(extra).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function timeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false,t=setTimeout(function(){if(done)return;done=true;reject(new Error(label+" timeout"));},ms);
    Promise.resolve(p).then(function(v){if(done)return;done=true;clearTimeout(t);resolve(v);},function(e){if(done)return;done=true;clearTimeout(t);reject(e);});
  });
}
function encId(tmdbId){
  return timeout(fetch(ENC+encodeURIComponent(String(tmdbId)),{headers:{"User-Agent":UA,"Accept":"application/json"}}),10000,"enc")
    .then(function(r){if(!r.ok)throw new Error("enc HTTP "+r.status);return r.json();})
    .then(function(j){var x=clean(j&&j.result);if(!x)throw new Error("enc result missing");return x;});
}
function apiUrl(enc,mediaType,season,episode){
  if(mediaType==="tv")return BASE+"/api/b/tv/"+encodeURIComponent(enc)+"/"+Number(season||1)+"/"+Number(episode||1)+"?multiLang=0";
  return BASE+"/api/b/movie/"+encodeURIComponent(enc)+"?multiLang=0";
}
function qualityFrom(s){
  s=String(s||"").toLowerCase();
  if(/2160|4k/.test(s))return"4K";
  if(/1440/.test(s))return"1440p";
  if(/1080/.test(s))return"1080p";
  if(/720/.test(s))return"720p";
  if(/480/.test(s))return"480p";
  if(/360/.test(s))return"360p";
  return"Auto";
}
function abs(u,b){try{return new URL(u,b).toString();}catch(_){return clean(u);}}
function mediaRows(j){
  var st=j&&j.stream?j.stream:j&&j.result&&j.result.stream?j.result.stream:null;
  if(!st)return[];
  var rows=[];
  function add(url,q,type){
    url=clean(url);if(!/^https?:\/\//i.test(url))return;
    rows.push({url:url,quality:clean(q)||qualityFrom(url),type:type||(/\.mpd(?:[?#]|$)/i.test(url)?"dash":/\.mp4(?:[?#]|$)/i.test(url)?"file":"hls")});
  }
  if(st.playlist)add(st.playlist,st.quality,"hls");
  if(st.url)add(st.url,st.quality,st.type);
  var q=st.qualities&&typeof st.qualities==="object"?st.qualities:{};
  Object.keys(q).forEach(function(k){
    var x=q[k];if(typeof x==="string")add(x,k);else if(x)add(x.url||x.file,k,x.type);
  });
  var src=Array.isArray(st.sources)?st.sources:[];
  src.forEach(function(x){if(x)add(x.url||x.file,x.quality||x.label,x.type);});
  var seen={};return rows.filter(function(x){if(seen[x.url])return false;seen[x.url]=1;return true;});
}
function proxyFileUrl(url){
  var ph={
    "User-Agent":UA,
    "Referer":"https://vidlink.pro/",
    "Origin":"https://vidlink.pro"
  };
  return FILE_PROXY+"?url="+encodeURIComponent(String(url))+
    "&headers="+encodeURIComponent(JSON.stringify(ph));
}
function verifyDirectFile(x){
  var h={
    "User-Agent":UA,
    "Referer":"https://vidlink.pro/",
    "Origin":"https://vidlink.pro",
    "Range":"bytes=0-4095"
  };
  return timeout(fetch(x.url,{headers:h}),10000,"direct file").then(function(r){
    if(!(r.ok||r.status===206))throw new Error("direct file HTTP "+r.status);
    var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
    if(/text\/html|application\/json/.test(ct))throw new Error("not media");
    return r.arrayBuffer().then(function(b){
      if(!b||!b.byteLength)throw new Error("empty media");
      x.type="file";
      x.headers={
        "User-Agent":UA,
        "Referer":"https://vidlink.pro/",
        "Origin":"https://vidlink.pro"
      };
      return x;
    });
  });
}
function verifyProxyFile(x){
  var pu=proxyFileUrl(x.url);
  return timeout(fetch(pu,{headers:{"User-Agent":UA,"Range":"bytes=0-4095"}}),12000,"file proxy").then(function(r){
    if(!(r.ok||r.status===206))throw new Error("file proxy HTTP "+r.status);
    var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
    if(/text\/html|application\/json/.test(ct))throw new Error("not media");
    return r.arrayBuffer().then(function(b){
      if(!b||!b.byteLength)throw new Error("empty media");
      x.url=pu;
      x.type="file";
      x.headers={"User-Agent":UA};
      return x;
    });
  });
}
function verify(x){
  if(x.type==="file"||/\.mp4(?:[?#]|$)/i.test(x.url)){
    return verifyDirectFile(x).catch(function(e){
      console.log("[Noctra/ZStream/Aspera] direct file "+(e&&e.message?e.message:e));
      return verifyProxyFile(x);
    });
  }
  if(x.type==="dash"||/\.mpd(?:[?#]|$)/i.test(x.url)){
    return timeout(fetch(x.url,{headers:hdr()}),10000,"mpd").then(function(r){
      if(!r.ok)throw new Error("MPD HTTP "+r.status);return r.text();
    }).then(function(t){if(!/<MPD[\s>]/i.test(t))throw new Error("not MPD");return x;});
  }
  return timeout(fetch(x.url,{headers:hdr()}),10000,"hls").then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);return r.text();
  }).then(function(t){
    if(String(t||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    var m,max=0,re=/RESOLUTION=\d+x(\d+)/ig;while((m=re.exec(t))!==null){var h=parseInt(m[1],10)||0;if(h>max)max=h;}
    if(max)x.quality=qualityFrom(String(max));
    return x;
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return encId(tmdbId).then(function(enc){
    return timeout(fetch(apiUrl(enc,mediaType,season,episode),{headers:hdr()}),12000,"VidLink API");
  }).then(function(r){if(!r.ok)throw new Error("VidLink HTTP "+r.status);return r.json();})
    .then(function(j){
      var rows=mediaRows(j);
      rows.slice(0,8).forEach(function(x,idx){
        try{
          var u=new URL(x.url);
          console.log("[Noctra/ZStream/Aspera] candidate "+idx+
            " type="+x.type+
            " quality="+x.quality+
            " host="+u.hostname+
            " path="+u.pathname);
        }catch(_){}
      });
      var out=[],i=0;
      function next(){
        if(i>=rows.length||out.length>=4)return Promise.resolve(out);
        var x=rows[i++];
        return verify(x).then(function(v){
          var name="NoctraTV · ZStream Native · Aspera · "+v.quality;
          out.push({name:name,title:name,url:v.url,quality:v.quality,type:v.type,provider:"noctra-zstream-native-aspera",headers:v.headers||hdr(),subtitles:[]});
          return next();
        }).catch(function(e){console.log("[Noctra/ZStream/Aspera] verify "+(e&&e.message?e.message:e));return next();});
      }
      return next();
    }).then(function(out){
      console.log("[Noctra/ZStream/Aspera] "+mediaType+" "+tmdbId+" streams="+out.length);
      return out;
    }).catch(function(e){console.log("[Noctra/ZStream/Aspera] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

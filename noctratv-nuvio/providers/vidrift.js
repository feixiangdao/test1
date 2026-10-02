// NoctraTV · VidRift — direct selfhost + relay resolver.
// Public protocol from embed.vidrift.in. No iframe fallback.
var EMBED="https://embed.vidrift.in";
var PARENT="https://cinezo.org/";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/146 Mobile Safari/537.36";
var RELAYS=["vaplayer","vidlove","cinepro"];

function clean(v){return v==null?"":String(v).trim();}
function pad2(n){n=String(Number(n)||0);return n.length<2?"0"+n:n;}
function hdr(extra){
  var h={"User-Agent":UA,"Accept":"*/*","Referer":EMBED+"/"};
  if(extra)Object.keys(extra).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function fetchText(url,headers){
  return fetch(url,{headers:hdr(headers)}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.text();
  });
}
function parseMeta(html){
  var m=clean(html).match(/var\s+embedMeta\s*=\s*(\{[\s\S]*?\});/);
  if(!m)return null;
  try{return JSON.parse(m[1]);}catch(_){return null;}
}
function parseSubs(html){
  var m=clean(html).match(/var\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(\[\s*\{\s*"code"[\s\S]*?\}\s*\]);/);
  if(!m)return[];
  try{
    var a=JSON.parse(m[1]);if(!Array.isArray(a))return[];
    return a.filter(function(x){return x&&x.url;}).slice(0,20).map(function(x){
      var l=clean(x.label||x.code)||"Subtitle";
      return{url:x.url,language:l,name:l};
    });
  }catch(_){return[];}
}
function sourcePath(id,type,s,e){
  return type==="tv"?"tv/"+id+"/"+Number(s)+"/"+Number(e):"movie/"+id;
}
function embedPath(id,type,s,e){
  return type==="tv"?"/embed/tv/"+id+"/"+Number(s)+"/"+Number(e):"/embed/movie/"+id;
}
function inferType(u){
  if(/\.mp4(?:[?#]|$)/i.test(u))return"mp4";
  if(/\.mpd(?:[?#]|$)/i.test(u))return"dash";
  return"hls";
}
function qFrom(v,u){
  var s=clean(v)+" "+clean(u),m=s.match(/(2160|1440|1080|720|480|360)\s*p?/i);
  if(m)return m[1]==="2160"?"4K":m[1]+"p";
  return"Auto";
}
function make(label,u,q,subs,headers){
  u=clean(u);if(!/^https?:\/\//i.test(u))return null;
  var quality=qFrom(q,u);
  var name="NoctraTV · VidRift · "+label+" · "+quality;
  return{name:name,title:name,url:u,quality:quality,type:inferType(u),
    provider:"noctra-vidrift",headers:hdr(headers),subtitles:subs||[]};
}
function probeHls(url,headers){
  if(!/^https?:\/\//i.test(clean(url)))return Promise.resolve(false);
  return fetch(url,{headers:hdr(Object.assign({"Range":"bytes=0-4095"},headers||{}))})
    .then(function(r){if(!r.ok)return false;return r.text().then(function(t){return t.indexOf("#EXTM3U")>=0;});})
    .catch(function(){return false;});
}
function deterministic(id,type,s,e){
  var path;
  if(type==="tv"){
    path="tv_"+id+"/Season%20"+Number(s)+"/S"+pad2(s)+"E"+pad2(e)+"/vod.m3u8";
  }else path="movie_"+id+"/vod.m3u8";
  var urls=["https://cdn.vidrift.net/"+path,"https://media.vidrift.in/"+path];
  var out=[];
  return urls.reduce(function(p,u){
    return p.then(function(){
      return probeHls(u).then(function(ok){
        if(ok){var x=make("Direct",u,"Auto",[],{"Referer":EMBED+"/"});if(x)out.push(x);}
      });
    });
  },Promise.resolve()).then(function(){return out;});
}
function relay(id,type,s,e,token,provider,subs){
  var url=EMBED+"/api/source/"+sourcePath(id,type,s,e)+"?token="+encodeURIComponent(token)+"&provider="+encodeURIComponent(provider);
  return fetchText(url,{"Accept":"application/json"}).then(function(t){
    var j=JSON.parse(t),a=Array.isArray(j&&j.streams)?j.streams:[];
    return a.map(function(st,idx){
      var u=clean(st&&(st.proxyUrl||st.url));
      if(u.charAt(0)==="/")u=EMBED+u;
      return make(clean(j.source||provider)+" "+(idx+1),u,clean(j.quality||st&&st.type),subs,{"Referer":EMBED+"/"});
    }).filter(Boolean);
  }).catch(function(err){
    console.log("[Noctra/VidRift] "+provider+" "+(err&&err.message?err.message:err));return[];
  });
}
function dedupe(groups){
  var out=[],seen={};(groups||[]).forEach(function(g){(g||[]).forEach(function(x){
    if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
  });});return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var id=String(tmdbId),s=Number(season||1),e=Number(episode||1);
  var path=embedPath(id,mediaType,s,e);
  return deterministic(id,mediaType,s,e).then(function(direct){
    return fetchText(EMBED+path,{"Accept":"text/html,application/xhtml+xml,*/*;q=0.8","Referer":PARENT})
      .then(function(html){
        var meta=parseMeta(html),subs=parseSubs(html),groups=[direct];
        if(meta&&meta.selfhostUrl){
          groups.push([make("Selfhost",meta.selfhostUrl,meta.selfhostKind,subs,{"Referer":EMBED+"/"})].filter(Boolean));
        }
        if(meta&&meta.playbackToken){
          return Promise.all(RELAYS.map(function(p){return relay(id,mediaType,s,e,meta.playbackToken,p,subs);}))
            .then(function(rs){return dedupe(groups.concat(rs));});
        }
        return dedupe(groups);
      }).catch(function(err){
        // Cloudflare may reject Node/undici TLS while Android native fetch works.
        console.log("[Noctra/VidRift] embed "+(err&&err.message?err.message:err));
        return direct;
      });
  }).then(function(out){
    console.log("[Noctra/VidRift] "+mediaType+" "+id+" streams="+out.length);
    return out;
  }).catch(function(err){
    console.log("[Noctra/VidRift] "+(err&&err.message?err.message:err));return[];
  });
}
module.exports={getStreams:getStreams};

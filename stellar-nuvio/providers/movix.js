var API_BASE="https://api.movix.cash";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}

function endpoint(tmdbId,mediaType,season,episode){
  if(mediaType==="tv"){
    return API_BASE+"/api/purstream/tv/"+encodeURIComponent(String(tmdbId))+
      "/stream?season="+encodeURIComponent(String(season||1))+
      "&episode="+encodeURIComponent(String(episode||1));
  }
  return API_BASE+"/api/purstream/movie/"+encodeURIComponent(String(tmdbId))+"/stream";
}

function collect(payload){
  var out=[],seen={};
  function add(x){
    if(!x)return;
    if(typeof x==="string")x={url:x};
    if(typeof x!=="object")return;
    var u=clean(x.url||x.link||x.file||x.src);
    if(!/^https?:\/\//i.test(u)||seen[u])return;
    seen[u]=1;
    out.push({url:u,label:clean(x.name||x.title||x.quality||x.label)});
  }
  if(Array.isArray(payload))payload.forEach(add);
  if(payload&&typeof payload==="object"){
    [payload.streams,payload.links,payload.sources,
     payload.data&&payload.data.streams,payload.data&&payload.data.links,payload.data&&payload.data.sources]
      .forEach(function(a){if(Array.isArray(a))a.forEach(add);});
  }
  return out;
}

function inspectHls(url){
  return fetch(url,{headers:{"User-Agent":UA,"Accept":"application/vnd.apple.mpegurl, */*"}})
    .then(function(r){
      if(!r.ok)return null;
      return r.text().then(function(body){
        if(body.indexOf("#EXTM3U")!==0)return null;
        var max=0,m,re=/RESOLUTION=\d+x(\d+)/gi;
        while((m=re.exec(body))!==null)max=Math.max(max,parseInt(m[1],10)||0);
        var langs=[],ar=/#EXT-X-MEDIA:[^\n]*TYPE=AUDIO[^\n]*LANGUAGE="([^"]+)"/gi;
        while((m=ar.exec(body))!==null)if(langs.indexOf(m[1])<0)langs.push(m[1]);
        return{quality:max?max+"p":"Auto",langs:langs};
      });
    }).catch(function(){return null;});
}

function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return fetch(endpoint(tmdbId,mediaType,season,episode),{
    headers:{"Accept":"application/json, text/plain, */*","User-Agent":UA}
  }).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(data){
    var items=collect(data);
    return Promise.all(items.slice(0,8).map(function(x,i){
      return inspectHls(x.url).then(function(info){
        if(!info)return null;
        var lang=info.langs.length?info.langs.join("/"):"Multi";
        var name="Movix · HLS "+(i+1)+" · "+info.quality+" · "+lang;
        return{name:name,title:name,url:x.url,quality:info.quality,provider:"stellar-movix",
          headers:{"User-Agent":UA},subtitles:[]};
      });
    }));
  }).then(function(rows){return rows.filter(Boolean);})
    .catch(function(e){console.error("[Stellar/Movix] "+(e&&e.message?e.message:e));return[];});
}

module.exports={getStreams:getStreams,endpoint:endpoint,collect:collect};
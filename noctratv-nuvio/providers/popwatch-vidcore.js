// NoctraTV · PopWatch · VidCore — Nuvio local scraper
// NoctraTV UI maps this family through "vidsuper-castle".
// Current VidCore headless flow: page token -> enc-vidcore -> encrypted server catalog
// -> per-server stream -> dec-vidcore. No iframe/WebView fallback.

var VIDCORE="https://vidcore.io";
var ENCDEC="https://enc-dec.app/api";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function parseJson(t){try{return JSON.parse(t);}catch(_){return null;}}
function resultOf(o){return o&&o.result!=null?o.result:null;}
function baseHeaders(){
  return {
    "User-Agent":UA,
    "Referer":VIDCORE+"/",
    "X-Requested-With":"XMLHttpRequest",
    "Accept":"*/*"
  };
}
function post(url,payload,headers){
  var h=Object.assign({},headers||{}),body;
  if(payload!=null){
    h["Content-Type"]="application/json";
    body=JSON.stringify(payload);
  }
  return fetch(url,{method:"POST",headers:h,body:body}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.text();
  });
}
function tokenFrom(html){
  var t=String(html||"");
  var m=/\\?"(?:en|token)\\?"\s*:\s*\\?"([^"\\]+)\\?"/.exec(t);
  if(m)return m[1];
  m=/(?:en|token)\s*[:=]\s*["']([^"']+)["']/.exec(t);
  return m?m[1]:null;
}
function decrypt(text,headers){
  return post(ENCDEC+"/dec-vidcore",{text:text},headers||null).then(parseJson);
}
function qualityFrom(server,data){
  var s=(clean(server&&server.description)+" "+clean(server&&server.name)+" "+clean(data&&data.quality)).toLowerCase();
  if(/2160|4k/.test(s))return "4K";
  if(/1080|fhd/.test(s))return "1080p";
  if(/720|\bhd\b/.test(s))return "720p";
  if(/480/.test(s))return "480p";
  return "Auto";
}
function resolveServer(server,streamBase,headers){
  if(!server||!server.data)return Promise.resolve([]);
  var endpoint=String(streamBase).replace(/\/$/,"")+"/"+encodeURIComponent(String(server.data));
  return post(endpoint,null,headers)
    .then(function(enc){return enc?decrypt(enc,null):null;})
    .then(function(dec){
      var data=resultOf(dec);
      if(!data||!data.url)return [];
      var url=clean(data.url);
      if(!/^https?:\/\//i.test(url))return [];
      var label=clean(server.name||server.label||server.id||"Server");
      var q=qualityFrom(server,data);
      var h={"User-Agent":UA,"Referer":VIDCORE+"/"};
      if(data.headers&&typeof data.headers==="object"){
        Object.keys(data.headers).forEach(function(k){
          var v=clean(data.headers[k]); if(v)h[k]=v;
        });
      }
      return [{
        name:"NoctraTV · PopWatch · VidCore",
        title:"PopWatch · VidCore · "+label+" · "+q,
        url:url,
        quality:q,
        provider:"noctra-popwatch-vidcore",
        format:/\.m3u8(?:\?|$)/i.test(url)?"m3u8":(/\.mpd(?:\?|$)/i.test(url)?"mpd":"video"),
        headers:h,
        subtitles:Array.isArray(data.tracks)?data.tracks:[]
      }];
    })
    .catch(function(e){
      console.log("[Noctra/PopWatch/VidCore] server "+clean(server&&server.name)+" "+(e&&e.message?e.message:e));
      return[];
    });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(tmdbId==null)return Promise.resolve([]);
  var isTv=mediaType==="tv";
  var page=isTv
    ?VIDCORE+"/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season||1))+"/"+encodeURIComponent(String(episode||1))
    :VIDCORE+"/movie/"+encodeURIComponent(String(tmdbId));

  return fetch(page,{headers:{"User-Agent":UA,"Accept":"text/html,*/*"}})
    .then(function(r){
      if(!r.ok)throw new Error("page HTTP "+r.status);
      return r.text();
    })
    .then(function(html){
      var token=tokenFrom(html);
      if(!token)throw new Error("page token missing");
      return fetch(ENCDEC+"/enc-vidcore?text="+encodeURIComponent(token),{
        headers:{"User-Agent":UA,"Accept":"application/json,*/*"}
      }).then(function(r){
        if(!r.ok)throw new Error("enc HTTP "+r.status);
        return r.text();
      });
    })
    .then(function(t){
      var initial=resultOf(parseJson(t));
      if(!initial||!initial.servers||!initial.stream||!initial.token)throw new Error("bootstrap incomplete");
      var h=Object.assign({},baseHeaders(),{"X-CSRF-Token":String(initial.token)});
      return post(initial.servers,null,h).then(function(enc){
        return decrypt(enc,h);
      }).then(function(dec){
        var servers=resultOf(dec);
        if(!Array.isArray(servers))throw new Error("server catalog invalid");
        console.log("[Noctra/PopWatch/VidCore] catalog="+servers.map(function(s){
          return clean(s&&(s.name||s.label||s.id||s.data));
        }).join(","));
        return Promise.all(servers.map(function(s){
          return resolveServer(s,initial.stream,h);
        }));
      });
    })
    .then(function(groups){
      var out=[],seen={};
      (groups||[]).forEach(function(g){
        (g||[]).forEach(function(x){
          if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
        });
      });
      console.log("[Noctra/PopWatch/VidCore] "+mediaType+" "+tmdbId+" streams="+out.length);
      return out;
    })
    .catch(function(e){
      console.log("[Noctra/PopWatch/VidCore] "+(e&&e.message?e.message:e));
      return[];
    });
}
module.exports={getStreams:getStreams};

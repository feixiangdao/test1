// OnlyFlix · CDNM — device-side direct resolver for Nuvio.
//
// IMPORTANT:
// CDNM HLS signatures are bound to the IP that requested the PlayerJS page.
// Therefore this scraper MUST fetch the CDNM page on the Android device itself.
// Vercel is used only for TMDB -> IMDb mapping.

var MAP_API="https://onlyflix-resolver-feixiangdao.vercel.app/api/resolve";
var HOSTS=[
  "https://cdnmovies-stream.online",
  "https://api.cdnmovies-stream.online",
  "https://player.cdnmovies-stream.online",
  "https://ugly-turkey.cdnmovies-stream.online"
];
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
var MARKERS=[
  "UnlUd3RmMTVfR0xFc1h4bnBVNExqamQwUmVZLVZI",
  "Ni14UVdNaDdlcnRMcDh0X005aHVVRGsxTTBWcllK",
  "a3p1T1lRcUJfUVNPTC14ek5fS3oza2tna0hoSGl0",
  "bWQtT2QyRzlSV09nU2E1SG9CU1NiV3JDeUlxUXlZ",
  "d05wMndCVE5jUFJRdlRDMF9DcHhDc3FfOFQxdTlR"
];

function clean(v){return v==null?"":String(v).trim();}

function mapImdb(tmdbId,mediaType,season,episode){
  var u=MAP_API+"?tmdb="+encodeURIComponent(String(tmdbId))+
    "&type="+encodeURIComponent(mediaType==="tv"?"tv":"movie")+
    "&maponly=1";
  if(mediaType==="tv"){
    u+="&season="+encodeURIComponent(String(season||1))+
      "&episode="+encodeURIComponent(String(episode||1));
  }
  return fetch(u,{headers:{"Accept":"application/json","User-Agent":UA}})
    .then(function(r){
      if(!r.ok)throw new Error("IMDb map HTTP "+r.status);
      return r.json();
    })
    .then(function(j){
      var id=clean(j&&(j.imdb||(j.data&&j.data.imdb_id)));
      if(!/^tt\d+$/i.test(id))throw new Error("IMDb id missing");
      return id;
    });
}

function decodeFile(raw){
  var a=clean(raw);
  if(a.indexOf("#2")!==0)return"";
  a=a.slice(2);
  for(var i=MARKERS.length-1;i>=0;i--){
    a=a.replace("//"+MARKERS[i],"");
  }
  try{return atob(a);}catch(e){return"";}
}

function collectFiles(node,out){
  if(node==null)return;
  if(typeof node==="string"){
    out.push(node);
    return;
  }
  if(Array.isArray(node)){
    node.forEach(function(x){collectFiles(x,out);});
    return;
  }
  if(typeof node==="object"){
    if(typeof node.file==="string")out.push(node.file);
    Object.keys(node).forEach(function(k){
      if(k==="file")return;
      var v=node[k];
      if(v&&typeof v==="object")collectFiles(v,out);
    });
  }
}

function parseStreams(decoded,pageUrl){
  var texts=[String(decoded||"")];
  try{
    var obj=JSON.parse(decoded);
    var nested=[];
    collectFiles(obj,nested);
    texts=texts.concat(nested);
  }catch(e){}

  var out=[],seen={};
  texts.forEach(function(text){
    var re=/\[(\d{3,4}p)\](https?:\/\/[^,\s]+)/g,m;
    while((m=re.exec(String(text||"")))!==null){
      var q=clean(m[1]),url=clean(m[2]);
      if(!url||seen[url])continue;
      seen[url]=1;
      var name="OnlyFlix · CDNM · "+q;
      out.push({
        name:name,
        title:name,
        url:url,
        quality:q,
        type:"hls",
        provider:"onlyflix-cdnm",
        headers:{
          "User-Agent":UA,
          "Referer":pageUrl
        },
        subtitles:[]
      });
    }
  });

  out.sort(function(a,b){
    return parseInt(String(b.quality||"0"),10)-parseInt(String(a.quality||"0"),10);
  });
  return out;
}

function pageUrl(base,imdb,mediaType,season,episode){
  var u=base+"/imdb/"+encodeURIComponent(imdb)+"/iframe";
  var qs=[
    "translation_id=145",
    "ftp_server_id=5"
  ];
  if(mediaType==="tv"){
    qs.push("season="+encodeURIComponent(String(season||1)));
    qs.push("episode="+encodeURIComponent(String(episode||1)));
  }
  qs.push("_cb="+Date.now());
  return u+"?"+qs.join("&");
}

function tryHost(i,imdb,mediaType,season,episode){
  if(i>=HOSTS.length)return Promise.resolve([]);
  var u=pageUrl(HOSTS[i],imdb,mediaType,season,episode);
  return fetch(u,{
    headers:{
      "User-Agent":UA,
      "Referer":"https://share.cdnm.ink/",
      "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":"en-US,en;q=0.9"
    }
  }).then(function(r){
    if(!r.ok)throw new Error("CDNM page HTTP "+r.status);
    return r.text();
  }).then(function(html){
    var m=String(html||"").match(/file:\s*'(#2[^']+)'/);
    if(!m)throw new Error("CDNM encoded file missing");
    var decoded=decodeFile(m[1]);
    if(!decoded)throw new Error("CDNM decode failed");
    var rows=parseStreams(decoded,u);
    if(!rows.length)throw new Error("CDNM streams missing");
    return rows;
  }).catch(function(e){
    console.log("[OnlyFlix/CDNM] "+HOSTS[i]+" failed: "+(e&&e.message?e.message:e));
    return tryHost(i+1,imdb,mediaType,season,episode);
  });
}

function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);

  return mapImdb(tmdbId,mediaType,season,episode)
    .then(function(imdb){
      return tryHost(0,imdb,mediaType,season,episode);
    })
    .then(function(rows){
      console.log("[OnlyFlix/CDNM] device-side streams="+(rows||[]).length);
      return rows||[];
    })
    .catch(function(e){
      console.error("[OnlyFlix/CDNM] "+(e&&e.message?e.message:e));
      return[];
    });
}

module.exports={getStreams:getStreams};

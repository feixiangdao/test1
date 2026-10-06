// NoctraTV · Velora · Yoru
// ZStream native binary identifies this family as Magnolia.
// Magnolia has two current branches:
//   magnolia-astral -> /cdn/sources-with-title      ("Magnolia Bloom")
//   magnolia-neon   -> /neon2/sources-with-title   ("Magnolia Petal")
// Resolve both locally, decrypt with dec-videasy, validate media, then dedupe.

var DB="https://db.videasy.net/3";
var APIS=[
  {id:"astral",label:"Bloom",url:"https://api.videasy.net/cdn/sources-with-title"},
  {id:"neon",label:"Petal",url:"https://api.videasy.net/neon2/sources-with-title"}
];
var DEC="https://enc-dec.app/api/dec-videasy";
var PLAYER="https://player.videasy.net";
var META_KEY="ad301b7cc82ffe19273e55e4d4206885";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function qnum(v){
  var s=String(v||"").toLowerCase();
  if(/2160|4k/.test(s))return 2160;
  var m=s.match(/(1440|1080|720|480|360)/);
  return m?parseInt(m[1],10):0;
}
function qlabel(v){
  var n=qnum(v);
  return n===2160?"4K":(n?n+"p":"Auto");
}
function withTimeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false;
    var t=setTimeout(function(){
      if(done)return; done=true; reject(new Error(label+" timeout"));
    },ms);
    Promise.resolve(p).then(function(v){
      if(done)return; done=true; clearTimeout(t); resolve(v);
    },function(e){
      if(done)return; done=true; clearTimeout(t); reject(e);
    });
  });
}
function getJson(url,opts){
  return withTimeout(fetch(url,opts||{}),12000,"fetch").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.json();
  });
}
function getText(url,opts){
  return withTimeout(fetch(url,opts||{}),12000,"fetch").then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.text();
  });
}
function meta(tmdbId,mediaType){
  var t=mediaType==="tv"?"tv":"movie";
  var url=DB+"/"+t+"/"+encodeURIComponent(String(tmdbId))+
    "?append_to_response=external_ids&language=en&api_key="+encodeURIComponent(META_KEY);
  return getJson(url,{headers:{"User-Agent":UA,"Accept":"application/json"}}).then(function(d){
    var title=clean(t==="tv"?(d.name||d.original_name):(d.title||d.original_title));
    var date=clean(t==="tv"?d.first_air_date:d.release_date);
    return{
      title:title,
      year:date&&date.length>=4?date.slice(0,4):"",
      imdb:clean(d&&d.external_ids&&d.external_ids.imdb_id),
      id:d&&d.id?d.id:tmdbId,
      type:t
    };
  });
}
function buildUrl(api,m,season,episode){
  var isTv=m.type==="tv";
  var q=[
    "title="+encodeURIComponent(m.title||""),
    "mediaType="+encodeURIComponent(m.type),
    "year="+encodeURIComponent(m.year||""),
    "episodeId="+encodeURIComponent(String(isTv?(episode||1):1)),
    "seasonId="+encodeURIComponent(String(isTv?(season||1):1)),
    "tmdbId="+encodeURIComponent(String(m.id)),
    "imdbId="+encodeURIComponent(m.imdb||"")
  ];
  return api.url+"?"+q.join("&");
}
function mediaHeaders(){
  return{"User-Agent":UA,"Origin":PLAYER,"Referer":PLAYER+"/"};
}
function parseHeight(body){
  var m,max=0,re=/RESOLUTION=\d+x(\d+)/ig,s=String(body||"");
  while((m=re.exec(s))!==null){var h=parseInt(m[1],10)||0;if(h>max)max=h;}
  return max;
}
function verify(url,declared){
  url=clean(url);
  if(!/^https?:\/\//i.test(url))return Promise.resolve(null);
  var h=mediaHeaders();
  if(/\.m3u8(?:[?#]|$)/i.test(url)){
    return withTimeout(fetch(url,{headers:h}),10000,"HLS").then(function(r){
      if(!r.ok)throw new Error("HLS HTTP "+r.status);
      return r.text();
    }).then(function(body){
      if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
      var ph=parseHeight(body),q=ph?qlabel(ph+"p"):qlabel(declared+" "+url);
      return{url:url,quality:q,format:"m3u8"};
    });
  }
  if(/\.mpd(?:[?#]|$)/i.test(url)){
    return withTimeout(fetch(url,{headers:h}),10000,"DASH").then(function(r){
      if(!r.ok)throw new Error("DASH HTTP "+r.status);
      return r.text();
    }).then(function(body){
      if(!/<MPD\b/i.test(String(body||"")))throw new Error("not DASH");
      return{url:url,quality:qlabel(declared+" "+url),format:"mpd"};
    });
  }
  return withTimeout(fetch(url,{headers:Object.assign({"Range":"bytes=0-4095"},h)}),10000,"media").then(function(r){
    if(!(r.ok||r.status===206))throw new Error("media HTTP "+r.status);
    var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
    if(/text\/html|application\/json/.test(ct))throw new Error("not media");
    return r.arrayBuffer();
  }).then(function(b){
    if(!b||!b.byteLength)throw new Error("empty media");
    return{url:url,quality:qlabel(declared+" "+url),format:"video"};
  });
}
function decryptPayload(enc,tmdbId){
  return getJson(DEC,{
    method:"POST",
    headers:{
      "User-Agent":UA,
      "Content-Type":"application/json",
      "Accept":"application/json"
    },
    body:JSON.stringify({text:enc,id:String(tmdbId)})
  });
}
function resolveBranch(api,m,season,episode,tmdbId){
  return getText(buildUrl(api,m,season,episode),{
    headers:{
      "User-Agent":UA,
      "Accept":"*/*",
      "Origin":PLAYER,
      "Referer":PLAYER+"/",
      "Cache-Control":"no-cache"
    }
  }).then(function(enc){
    if(!clean(enc))throw new Error("encrypted payload empty");
    return decryptPayload(enc,tmdbId);
  }).then(function(dec){
    var r=dec&&dec.result||{};
    var srcs=Array.isArray(r.sources)?r.sources:[];
    var tasks=[];
    srcs.forEach(function(s){
      var u=clean(s&&(s.url||s.file));
      var rawQ=clean(s&&s.quality);
      if(!/^https?:\/\//i.test(u)||/HDR/i.test(rawQ))return;
      tasks.push(verify(u,rawQ).then(function(v){
        if(!v)return null;
        var title="Velora · Yoru · Magnolia "+api.label+" · "+(rawQ||v.quality);
        return{
          name:"NoctraTV · Velora · Yoru",
          title:title,
          url:v.url,
          quality:v.quality,
          provider:"noctra-velora-yoru",
          format:v.format,
          headers:mediaHeaders(),
          subtitles:Array.isArray(r.subtitles)?r.subtitles:[],
          _branch:api.id
        };
      }).catch(function(e){
        console.log("[Noctra/Velora/Yoru] "+api.id+" verify "+(e&&e.message?e.message:e));
        return null;
      }));
    });
    return Promise.all(tasks).then(function(rows){return rows.filter(Boolean);});
  }).catch(function(e){
    console.log("[Noctra/Velora/Yoru] "+api.id+" "+(e&&e.message?e.message:e));
    return[];
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(tmdbId==null)return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return meta(tmdbId,mediaType).then(function(m){
    return Promise.all(APIS.map(function(api){
      return resolveBranch(api,m,season,episode,tmdbId);
    }));
  }).then(function(groups){
    var rows=[].concat.apply([],groups||[]),out=[],seen={};
    rows.sort(function(a,b){return qnum(b.quality)-qnum(a.quality);});
    rows.forEach(function(x){
      if(!x||!x.url||seen[x.url])return;
      seen[x.url]=1;
      delete x._branch;
      out.push(x);
    });
    console.log("[Noctra/Velora/Yoru] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/Velora/Yoru] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

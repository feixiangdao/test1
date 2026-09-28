// Stellar · ZXCStreams — current 2026-09 source API
// Reverse-engineered from the current player.zxcprime.xyz frontend.
// Direct HLS/DASH only; dead Resshin MP4 CDN deliberately excluded.

var CryptoJS=require("crypto-js");
var BASE="https://player.zxcprime.xyz";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36";
var LINK_KEY="7f4c9e2a81d63b05c4f7a9e8126d3b50e1a8c7f23d9465ab0c6e9f1d4a7b832c";

var F={
  id:"a7f39c821d604e5b9c71f36e1547b",
  fToken:"e83c4b719a52d3136052479c1635a",
  ts:"61d9a5274c8e3b29afd6384c291e6",
  token:"c492f7a183d6502b1e7436c538a716d",
  title:"5e28c9147a306d1e829f3674b392a1",
  year:"b731e6c94f08269d725f8341c306e",
  season:"d8427b59ce30684a2f957c3613e85b",
  episode:"91c6e4a728503d1f785c92346b713d",
  imdbId:"f35a8c19d674b3265e871c4933a725f",
  path:"6b491e7253ad84d392e7561a9384c",
  mediaType:"c285f91ab306d28147a35632e816b",
  date:"e164932c50216a39e5814b3027",
  latestDate:"e16932c543416ad739e5814b3027"
};

var SERVERS=[
  {key:"daedalus",name:"Daedalus"},
  {key:"berkas",name:"Berkas"},
  {key:"alatreon",name:"Alatreon"},
  {key:"valstrax",name:"Valstrax"},
  {key:"atlas",name:"Atlas"}
];

function clean(v){return v==null?"":String(v).trim()}
function headers(extra){
  var h={"User-Agent":UA,Accept:"application/json,text/plain,*/*",Origin:BASE,Referer:BASE+"/"};
  Object.keys(extra||{}).forEach(function(k){h[k]=extra[k]});
  return h;
}
function tmdbMeta(id,type){
  var t=type==="tv"?"tv":"movie";
  var url=TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(TMDB_KEY)+"&language=en-US";
  return fetch(url,{headers:{"User-Agent":UA,Accept:"application/json"}}).then(function(r){
    if(!r.ok)throw new Error("TMDB "+r.status);
    return r.json();
  }).then(function(d){
    var date=clean(t==="tv"?d.first_air_date:d.release_date);
    var meta={
      id:String(id),type:t,
      title:clean(t==="tv"?d.name:d.title),
      year:date?date.slice(0,4):"",
      date:date,
      imdb:clean(d.imdb_id)
    };
    if(t==="tv"&&!meta.imdb){
      return fetch(TMDB+"/tv/"+encodeURIComponent(String(id))+"/external_ids?api_key="+encodeURIComponent(TMDB_KEY),{
        headers:{"User-Agent":UA,Accept:"application/json"}
      }).then(function(r){return r.ok?r.json():{}}).then(function(x){meta.imdb=clean(x&&x.imdb_id);return meta}).catch(function(){return meta});
    }
    return meta;
  });
}
function decryptLink(v){
  try{return CryptoJS.AES.decrypt(clean(v),LINK_KEY).toString(CryptoJS.enc.Utf8)}catch(_){return""}
}
function quality(v){
  var n=Number(v);
  if(isFinite(n)&&n>=240&&n<=4320)return n+"p";
  var s=clean(v).toLowerCase();
  var m=s.match(/(2160|1440|1080|720|576|540|480|360|240)/);
  return m?m[1]+"p":"Auto";
}
function kind(v,url){
  var s=clean(v).toLowerCase();
  if(s==="hls"||/\.m3u8(?:\?|$)/i.test(url))return"HLS";
  if(s==="dash"||/\.mpd(?:\?|$)/i.test(url))return"DASH";
  if(s==="mp4"||/\.mp4(?:\?|$)/i.test(url))return"MP4";
  return clean(v).toUpperCase()||"Stream";
}
function token(meta,server,season,episode){
  var body={};
  body[F.id]=meta.id;
  body[F.mediaType]=meta.type;
  body[F.path]=server;
  if(meta.type==="tv"){
    body[F.season]=String(Number(season)||1);
    body[F.episode]=String(Number(episode)||1);
  }
  return fetch(BASE+"/backend_/tigasmukha",{
    method:"POST",headers:headers({"Content-Type":"application/json"}),
    body:JSON.stringify(body)
  }).then(function(r){
    if(!r.ok)throw new Error("token "+r.status);
    return r.json();
  });
}
function source(meta,server,season,episode){
  return token(meta,server,season,episode).then(function(tok){
    if(!tok||tok.ts==null||!tok.token)throw new Error("token missing");
    var q=new URLSearchParams();
    q.set(F.id,meta.id);
    q.set(F.path,server);
    q.set(F.mediaType,meta.type);
    q.set(F.ts,String(tok.ts));
    q.set(F.token,String(tok.token));
    q.set(F.title,meta.title);
    q.set(F.year,meta.year||"");
    q.set(F.date,meta.date||"");
    if(meta.type==="tv"){
      q.set(F.season,String(Number(season)||1));
      q.set(F.episode,String(Number(episode)||1));
    }
    if(meta.imdb)q.set(F.imdbId,meta.imdb);
    return fetch(BASE+"/backend_/sources/"+encodeURIComponent(server)+"?"+q.toString(),{headers:headers()});
  }).then(function(r){
    if(!r.ok)throw new Error("source "+r.status);
    return r.json();
  }).then(function(data){
    return Array.isArray(data&&data.links)?data.links:[];
  });
}
function playbackHeaders(meta,season,episode){
  var ref=BASE+"/player/"+meta.type+"/"+meta.id;
  if(meta.type==="tv")ref+="/"+(Number(season)||1)+"/"+(Number(episode)||1);
  return{"User-Agent":UA,Referer:ref,Origin:BASE};
}
function convert(meta,serverObj,links,season,episode){
  var temp=[],urlCounts={};
  (links||[]).forEach(function(x){
    var u=decryptLink(x&&x.link);
    if(!/^https?:\/\//i.test(u))return;
    urlCounts[u]=(urlCounts[u]||0)+1;
    temp.push({u:u,x:x});
  });
  var best={},out=[];
  temp.forEach(function(item){
    var u=item.u,x=item.x||{};
    if(best[u]){
      // Same URL advertised under several resolutions is an upstream metadata artefact.
      best[u].quality="Auto";
      best[u].title="ZXC · "+serverObj.name+" · Auto · "+kind(x.type,u);
      best[u].name=best[u].title;
      return;
    }
    var q=urlCounts[u]>1?"Auto":quality(x.resolution);
    var k=kind(x.type,u);
    var label="ZXC · "+serverObj.name+" · "+q+" · "+k;
    var row={
      name:label,title:label,url:u,quality:q,
      provider:"stellar-zxcstreams",
      headers:playbackHeaders(meta,season,episode)
    };
    best[u]=row;out.push(row);
  });
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  var meta=null;
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tmdbMeta(tmdbId,mediaType).then(function(m){
    meta=m;
    return Promise.allSettled(SERVERS.map(function(s){
      return source(meta,s.key,season,episode).then(function(links){return convert(meta,s,links,season,episode)});
    }));
  }).then(function(results){
    var out=[],seen={};
    results.forEach(function(r){
      if(r.status!=="fulfilled")return;
      (r.value||[]).forEach(function(x){
        var key=x.url;
        if(seen[key])return;
        seen[key]=1;out.push(x);
      });
    });
    console.log("[Stellar/ZXCStreams] "+meta.title+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.error("[Stellar/ZXCStreams] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams,decryptLink:decryptLink,quality:quality};

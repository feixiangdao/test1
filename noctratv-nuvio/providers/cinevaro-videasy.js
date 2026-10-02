// NoctraTV · Cinevaro · Videasy (VidEasy) — Nuvio local scraper
// Promise-chain implementation for Hermes. Media is fetched by the client;
// enc-dec.app is used only to decrypt provider metadata.

var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var TMDB_BASE="https://api.themoviedb.org/3";
var DEC="https://enc-dec.app/api/dec-videasy";
var API="https://api.videasy.to";
var PLAYER="https://player.videasy.net";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var SERVERS=[
  {name:"Neon",path:"/myflixerzupcloud/sources-with-title",lang:"Original"},
  {name:"Yoru",path:"/cdn/sources-with-title",lang:"Original",moviesOnly:true},
  {name:"Sage",path:"/1movies/sources-with-title",lang:"Original"},
  {name:"Breach",path:"/m4uhd/sources-with-title",lang:"Original"},
  {name:"Killjoy",path:"/meine/sources-with-title",lang:"German",suffix:"?language=german"},
  {name:"Harbor",path:"/meine/sources-with-title",lang:"Italian",suffix:"?language=italian"},
  {name:"Chamber",path:"/meine/sources-with-title",lang:"French",suffix:"?language=french",moviesOnly:true},
  {name:"Omen",path:"/lamovie/sources-with-title",lang:"Spanish"},
  {name:"Raze",path:"/superflix/sources-with-title",lang:"Portuguese"}
];
function clean(v){return v==null?"":String(v).trim();}
function qnum(q){var s=String(q||"").toLowerCase();if(/4k|2160/.test(s))return 2160;var m=s.match(/(\d{3,4})/);return m?parseInt(m[1],10):0;}
function enc2(s){return encodeURIComponent(encodeURIComponent(String(s||"")));}
function req(url,opt){return fetch(url,opt||{}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r;});}
function info(id,type){
  var t=type==="tv"?"tv":"movie";
  var u=TMDB_BASE+"/"+t+"/"+id+"?api_key="+encodeURIComponent(TMDB_KEY)+"&append_to_response=external_ids";
  return req(u,{headers:{"User-Agent":UA,"Accept":"application/json"}}).then(function(r){return r.json();}).then(function(d){
    var date=clean(t==="tv"?d.first_air_date:d.release_date);
    return {
      title:clean(t==="tv"?d.name:d.title),
      year:date?date.slice(0,4):"",
      imdb:clean(d&&d.external_ids&&d.external_ids.imdb_id),
      type:t
    };
  });
}
function build(s,m,id,season,episode){
  var base=API+s.path+(s.suffix||"");
  var sep=base.indexOf("?")>=0?"&":"?";
  var p=[
    "title="+enc2(m.title),
    "mediaType="+encodeURIComponent(m.type),
    "year="+encodeURIComponent(m.year),
    "tmdbId="+encodeURIComponent(String(id)),
    "imdbId="+encodeURIComponent(m.imdb)
  ];
  if(m.type==="tv"){
    p.push("seasonId="+encodeURIComponent(String(season||1)));
    p.push("episodeId="+encodeURIComponent(String(episode||1)));
  }
  return base+sep+p.join("&");
}
function quality(src){
  var q=clean(src&&src.quality||"Unknown");
  if(/4k|2160/i.test(q))return"4K";
  var m=q.match(/(\d{3,4})/);if(m)return m[1]+"p";
  m=clean(src&&src.url).match(/(\d{3,4})p/i);if(m)return m[1]+"p";
  if(/auto|adaptive/i.test(q))return"Auto";
  if(/hd|high/i.test(q))return"720p";
  if(/sd|standard/i.test(q))return"480p";
  return"Unknown";
}
function decrypt(text,id){
  return req(DEC,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":UA},
    body:JSON.stringify({text:text,id:id})})
    .then(function(r){return r.json();})
    .then(function(d){return d&&d.result?d.result:null;});
}
function one(server,meta,id,season,episode){
  if(meta.type==="tv"&&server.moviesOnly)return Promise.resolve([]);
  return req(build(server,meta,id,season,episode),{headers:{
      "User-Agent":UA,"Accept":"*/*","Origin":PLAYER,"Referer":PLAYER+"/"
    }})
    .then(function(r){return r.text();})
    .then(function(t){if(!clean(t))throw new Error("empty");return decrypt(t,id);})
    .then(function(d){
      var a=d&&Array.isArray(d.sources)?d.sources:[];
      return a.map(function(src){
        var u=clean(src&&(src.url||src.file));
        if(!/^https?:\/\//i.test(u))return null;
        var q=quality(src);
        return{name:"NoctraTV · Cinevaro · Videasy",title:"Cinevaro · Videasy · "+server.name+" · "+server.lang+" · "+q,
          url:u,quality:q,language:server.lang,provider:"noctra-cinevaro-videasy",
          headers:{"User-Agent":UA,"Origin":PLAYER,"Referer":PLAYER+"/"},subtitles:[]};
      }).filter(Boolean);
    }).catch(function(e){console.log("[NoctraTV/Cinevaro/Videasy] "+server.name+" "+(e&&e.message?e.message:e));return[];});
}
function getStreams(tmdbId,mediaType,season,episode){
  return info(tmdbId,mediaType).then(function(meta){
    return Promise.all(SERVERS.map(function(s){return one(s,meta,tmdbId,season,episode);}));
  }).then(function(groups){
    var out=[],seen={};(groups||[]).forEach(function(g){(g||[]).forEach(function(x){
      if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
    });});
    out.sort(function(a,b){return qnum(b.quality)-qnum(a.quality);});
    console.log("[NoctraTV/Cinevaro/Videasy] streams="+out.length);return out;
  }).catch(function(e){console.error("[NoctraTV/Cinevaro/Videasy] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

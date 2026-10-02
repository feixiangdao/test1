// NoctraTV · PeeStream · Poseidon — local direct resolver
var BASE="https://providers.peestream.in";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function info(id,type){
  var t=type==="tv"?"tv":"movie";
  return fetch(TMDB+"/"+t+"/"+id+"?api_key="+TMDB_KEY+"&append_to_response=external_ids",{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
    .then(function(d){
      var date=clean(t==="tv"?d.first_air_date:d.release_date);
      return {
        type:t,
        title:clean(t==="tv"?d.name:d.title),
        year:date?date.slice(0,4):"",
        imdb:clean(d&&d.external_ids&&d.external_ids.imdb_id)
      };
    });
}
function qlabel(v){
  var s=clean(v); if(!s)return"Auto";
  var m=s.match(/(2160|1080|720|480|360)/); return m?m[1]+"p":s;
}
function make(url,quality,headers,sourceId){
  if(!/^https?:\/\//i.test(clean(url)))return null;
  return {
    name:"NoctraTV · PeeStream · Poseidon",
    title:"PeeStream · "+(sourceId||"Poseidon")+" · "+qlabel(quality),
    url:clean(url),
    quality:qlabel(quality),
    provider:"noctra-peestream-poseidon",
    headers:headers&&typeof headers==="object"?headers:{"User-Agent":UA},
    subtitles:[]
  };
}
function parseSse(body){
  var out=[];
  String(body||"").split(/\n\n+/).forEach(function(ev){
    if(ev.indexOf("event: completed")<0)return;
    var lines=ev.split(/\r?\n/),raw="";
    lines.forEach(function(line){if(line.indexOf("data:")===0)raw+=line.slice(5).trim();});
    if(!raw)return;
    try{
      var p=JSON.parse(raw);
      var sid=clean(p&&p.sourceId)||"Poseidon";
      if(sid.toLowerCase().indexOf("poseidon")<0)return;
      var st=p&&p.stream&&typeof p.stream==="object"?p.stream:null;
      if(!st)return;
      var u=clean(st.playlist||st.url||st.file);
      var h=st.headers&&typeof st.headers==="object"?st.headers:{"User-Agent":UA};
      var x=make(u,st.quality||"1080p",h,sid); if(x)out.push(x);
    }catch(_){}
  });
  return out;
}
function scrape(meta,id,season,episode){
  var p=["type="+encodeURIComponent(meta.type),"tmdbId="+encodeURIComponent(String(id)),"title="+encodeURIComponent(meta.title)];
  if(meta.year)p.push("releaseYear="+encodeURIComponent(meta.year));
  if(meta.imdb)p.push("imdbId="+encodeURIComponent(meta.imdb));
  if(meta.type==="tv"){p.push("season="+encodeURIComponent(String(season||1)));p.push("episode="+encodeURIComponent(String(episode||1)));}
  return fetch(BASE+"/scrape?"+p.join("&"),{headers:{"User-Agent":UA,"Accept":"text/event-stream","Referer":BASE+"/"}})
    .then(function(r){if(!r.ok)throw new Error("scrape HTTP "+r.status);return r.text();})
    .then(parseSse)
    .catch(function(){return[];});
}
function fallback(meta,id,season,episode){
  var p=["q="+encodeURIComponent(meta.title),"type="+encodeURIComponent(meta.type),"tmdbId="+encodeURIComponent(String(id))];
  if(meta.type==="tv"){p.push("season="+encodeURIComponent(String(season||1)));p.push("episode="+encodeURIComponent(String(episode||1)));}
  return fetch(BASE+"/api/search?"+p.join("&"),{headers:{"User-Agent":UA,"Accept":"application/json","Referer":BASE+"/"}})
    .then(function(r){if(!r.ok)throw new Error("search HTTP "+r.status);return r.json();})
    .then(function(d){
      var out=[],results=d&&Array.isArray(d.results)?d.results:[];
      results.forEach(function(res){
        var pn=clean(res&& (res.providerName||res.provider));
        var streams=res&&Array.isArray(res.streams)?res.streams:[];
        streams.forEach(function(st){
          var sn=clean(st&&(st.name||pn));
          var combined=(pn+" "+sn).toLowerCase();
          if(combined.indexOf("poseidon")<0)return;
          var x=make(st.url,st.quality||"1080p",{"User-Agent":UA},"Poseidon");
          if(x)out.push(x);
        });
      });
      return out;
    }).catch(function(){return[];});
}
function dedupe(a){var seen={},out=[];(a||[]).forEach(function(x){if(!x||!x.url||seen[x.url])return;seen[x.url]=1;out.push(x);});return out;}
function getStreams(tmdbId,mediaType,season,episode){
  return info(tmdbId,mediaType).then(function(meta){
    return scrape(meta,tmdbId,season,episode).then(function(a){
      if(a&&a.length)return dedupe(a);
      return fallback(meta,tmdbId,season,episode).then(dedupe);
    });
  }).then(function(out){
    console.log("[NoctraTV/PeeStream/Poseidon] streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[NoctraTV/PeeStream/Poseidon] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

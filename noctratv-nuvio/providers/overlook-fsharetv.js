// NoctraTV · Overlook · FshareTV — movie-only local resolver
var BASE="https://fsharetv.cc";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var TRAILER="Png81APqcxU";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function headers(json){
  var h={
    "User-Agent":UA,
    "Accept":json?"application/json, */*; q=0.01":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":"en-US,en;q=0.9",
    "Referer":BASE+"/"
  };
  if(json)h["X-Requested-With"]="XMLHttpRequest";
  return h;
}
function imdb(tmdbId){
  return fetch(TMDB+"/movie/"+encodeURIComponent(String(tmdbId))+"?api_key="+TMDB_KEY+"&append_to_response=external_ids",{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
    .then(function(d){return clean(d&&d.external_ids&&d.external_ids.imdb_id);});
}
function watchPath(imdbId){
  return fetch(BASE+"/movie/"+encodeURIComponent(imdbId),{headers:headers(false)})
    .then(function(r){if(!r.ok)throw new Error("movie HTTP "+r.status);return r.text();})
    .then(function(t){var m=t.match(/href=["'](\/w\/[^"']+)["']/i);return m?m[1]:"";});
}
function sourceId(path){
  return fetch(BASE+path,{headers:headers(false)})
    .then(function(r){if(!r.ok)throw new Error("watch HTTP "+r.status);return r.text();})
    .then(function(t){
      var pats=[
        /Movie\.setSource\(["']([^"']+)["']/,
        /setSource\(["']([^"']+)["']/,
        /["']source_id["']\s*:\s*["']([^"']+)["']/,
        /source_id\s*=\s*["']([^"']+)["']/,
        /file_id\s*=\s*["']([^"']+)["']/,
        /["']file_id["']\s*:\s*["']([^"']+)["']/
      ];
      for(var i=0;i<pats.length;i++){var m=t.match(pats[i]);if(m)return m[1];}
      return "";
    });
}
function api(id){
  var u=BASE+"/api/file/"+encodeURIComponent(id)+"/source?trailer="+encodeURIComponent(TRAILER)+"&type=watch";
  return fetch(u,{headers:headers(true)})
    .then(function(r){if(!r.ok)throw new Error("api HTTP "+r.status);return r.json();})
    .then(function(d){if(!d||d.status!=="ok")throw new Error("api status");return d;});
}
function qlabel(s){
  var l=clean(s&&s.label),q=clean(s&&s.quality);
  var m=(l+" "+q).match(/(2160|1080|720|480|360)/);
  if(m)return m[1]+"p";
  if(/4k/i.test(l+" "+q))return"4K";
  return q||l||"Auto";
}
function collect(d){
  var f=d&&d.data&&d.data.file?d.data.file:{};
  var all=[];
  if(Array.isArray(f.sources))all=all.concat(f.sources);
  if(Array.isArray(f.backups))all=all.concat(f.backups);
  if(Array.isArray(f.alternatives))f.alternatives.forEach(function(a){if(Array.isArray(a))all=all.concat(a);});
  var seen={},out=[];
  all.forEach(function(s){
    var u=clean(s&&s.src);if(!u)return;
    if(!/^https?:\/\//i.test(u))u=BASE+(u.charAt(0)==="/"?"":"/")+u;
    if(seen[u])return;seen[u]=1;
    var q=qlabel(s);
    out.push({
      name:"NoctraTV · Overlook · FshareTV",
      title:"Overlook · FshareTV · "+q,
      url:u,
      quality:q,
      provider:"noctra-overlook-fsharetv",
      headers:{"User-Agent":UA,"Referer":BASE+"/"},
      subtitles:[]
    });
  });
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  if(mediaType==="tv")return Promise.resolve([]);
  return imdb(tmdbId).then(function(id){if(!id)throw new Error("IMDb missing");return watchPath(id);})
    .then(function(p){if(!p)throw new Error("watch path missing");return sourceId(p);})
    .then(function(id){if(!id)throw new Error("source id missing");return api(id);})
    .then(collect)
    .then(function(out){console.log("[NoctraTV/Overlook/FshareTV] streams="+out.length);return out;})
    .catch(function(e){console.log("[NoctraTV/Overlook/FshareTV] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

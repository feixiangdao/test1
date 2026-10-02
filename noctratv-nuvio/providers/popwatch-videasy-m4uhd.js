// NoctraTV · PopWatch · Videasy / m4uhd
// Direct local resolver for the m4uhd branch of the current Videasy API.
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var TMDB="https://api.themoviedb.org/3";
var DEC="https://enc-dec.app/api/dec-videasy";
var BASES=["https://api.videasy.net","https://api.speedracelight.com","https://api.videasy.to"];
var PLAYER="https://player.videasy.net";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function meta(id,type){
  var t=type==="tv"?"tv":"movie";
  return fetch(TMDB+"/"+t+"/"+id+"?api_key="+TMDB_KEY+"&append_to_response=external_ids",{headers:{"User-Agent":UA}})
    .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
    .then(function(d){
      var date=clean(t==="tv"?d.first_air_date:d.release_date);
      return{type:t,title:clean(t==="tv"?d.name:d.title),year:date?date.slice(0,4):"",imdb:clean(d&&d.external_ids&&d.external_ids.imdb_id)};
    });
}
function build(base,m,id,s,e){
  var u=base+"/m4uhd/sources-with-title?title="+encodeURIComponent(encodeURIComponent(m.title))+
    "&mediaType="+encodeURIComponent(m.type)+
    "&year="+encodeURIComponent(m.year)+
    "&tmdbId="+encodeURIComponent(String(id))+
    "&imdbId="+encodeURIComponent(m.imdb);
  if(m.type==="tv"){
    u+="&seasonId="+encodeURIComponent(String(s||1))+"&episodeId="+encodeURIComponent(String(e||1));
  }
  return u;
}
function dec(t,id){
  return fetch(DEC,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":UA},
    body:JSON.stringify({text:t,id:String(id)})})
    .then(function(r){if(!r.ok)throw new Error("DEC "+r.status);return r.json();})
    .then(function(d){return d&&d.result?d.result:d;});
}
function oneBase(base,m,id,s,e){
  return fetch(build(base,m,id,s,e),{headers:{"User-Agent":UA,"Accept":"*/*","Origin":PLAYER,"Referer":PLAYER+"/"}})
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.text();})
    .then(function(t){if(!clean(t)||/^</.test(clean(t)))throw new Error("bad payload");return dec(t,id);})
    .then(function(d){
      var a=d&&Array.isArray(d.sources)?d.sources:[];
      return a.map(function(x){
        var u=clean(x&&(x.url||x.file));if(!/^https?:\/\//i.test(u))return null;
        var q=clean(x.quality)||"Auto";
        var name="NoctraTV · PopWatch · Videasy m4uhd · "+q;
        return{name:name,title:name,url:u,quality:q,provider:"noctra-popwatch-videasy-m4uhd",
          headers:{"User-Agent":UA,"Origin":PLAYER,"Referer":PLAYER+"/"},subtitles:[]};
      }).filter(Boolean);
    });
}
function getStreams(tmdbId,mediaType,season,episode){
  return meta(tmdbId,mediaType).then(function(m){
    var i=0;
    function next(){
      if(i>=BASES.length)return[];
      var b=BASES[i++];
      return oneBase(b,m,tmdbId,season,episode).then(function(a){return a&&a.length?a:next();})
        .catch(function(e){console.log("[Noctra/PopWatch/Videasy/m4uhd] "+b+" "+(e&&e.message?e.message:e));return next();});
    }
    return next();
  }).then(function(out){
    console.log("[Noctra/PopWatch/Videasy/m4uhd] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/PopWatch/Videasy/m4uhd] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

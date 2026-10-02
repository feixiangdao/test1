// NoctraTV · Hexa — direct local resolver
var DEC_BASE="https://enc-dec.app/api";
var DOMAINS=["hexa.su","flixer.su"];
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function randHex(n){
  var s="";
  while(s.length<n){
    var x=Math.floor(Math.random()*0x100000000).toString(16);
    s+=("00000000"+x).slice(-8);
  }
  return s.slice(0,n);
}
function getChallenge(){
  return fetch(DEC_BASE+"/enc-hexa",{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("challenge HTTP "+r.status);return r.json();})
    .then(function(d){
      var t=clean(d&&d.result&&d.result.token);
      if(!t)throw new Error("challenge token missing");
      return t;
    });
}
function encrypted(domain,id,type,season,episode,key,token){
  var path=type==="tv"
    ?"/api/tmdb/tv/"+encodeURIComponent(String(id))+"/season/"+encodeURIComponent(String(season||1))+"/episode/"+encodeURIComponent(String(episode||1))+"/images"
    :"/api/tmdb/movie/"+encodeURIComponent(String(id))+"/images";
  var u="https://theemoviedb."+domain+path;
  return fetch(u,{headers:{
    "User-Agent":UA,
    "Referer":"https://"+domain+"/",
    "Accept":"text/plain",
    "X-Fingerprint-Lite":"e9136c41504646444",
    "X-Api-Key":key,
    "X-Cap-Token":token
  }}).then(function(r){
    if(!r.ok)throw new Error(domain+" HTTP "+r.status);
    return r.text();
  }).then(function(t){
    if(!clean(t))throw new Error(domain+" empty");
    return t;
  });
}
function decrypt(text,key){
  return fetch(DEC_BASE+"/dec-hexa",{
    method:"POST",
    headers:{"Content-Type":"application/json","User-Agent":UA,"Accept":"application/json"},
    body:JSON.stringify({text:text,key:key})
  }).then(function(r){
    if(!r.ok)throw new Error("decrypt HTTP "+r.status);
    return r.json();
  }).then(function(d){
    var x=d&&d.result&&typeof d.result==="object"?d.result:null;
    if(!x||!Array.isArray(x.sources))throw new Error("decrypt sources missing");
    return x;
  });
}
function oneDomain(domain,id,type,season,episode,key,token){
  return encrypted(domain,id,type,season,episode,key,token)
    .then(function(t){return decrypt(t,key);})
    .catch(function(e){
      console.log("[NoctraTV/Hexa] "+domain+" "+(e&&e.message?e.message:e));
      return null;
    });
}
function qlabel(v){
  var s=clean(v),m=s.match(/(2160|1440|1080|720|480|360)/);
  if(m)return m[1]==="2160"?"4K":m[1]+"p";
  return s||"Auto";
}
function collect(result,domain){
  var out=[],seen={};
  var a=result&&Array.isArray(result.sources)?result.sources:[];
  a.forEach(function(src){
    if(!src||typeof src!=="object")return;
    var u=clean(src.url||src.file);
    if(!/^https?:\/\//i.test(u)||seen[u])return;
    seen[u]=1;
    var server=clean(src.name||src.server)||"Server";
    var q=qlabel(src.quality);
    out.push({
      name:"NoctraTV · Hexa",
      title:"Hexa · "+server+" · "+q,
      url:u,
      quality:q,
      provider:"noctra-hexa",
      headers:{"User-Agent":UA,"Referer":"https://"+domain+"/"},
      subtitles:[]
    });
  });
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie";
  return getChallenge().then(function(token){
    var key=randHex(64),i=0;
    function next(){
      if(i>=DOMAINS.length)return[];
      var domain=DOMAINS[i++];
      return oneDomain(domain,tmdbId,type,season,episode,key,token).then(function(res){
        var out=collect(res,domain);
        return out.length?out:next();
      });
    }
    return next();
  }).then(function(out){
    console.log("[NoctraTV/Hexa] "+type+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[NoctraTV/Hexa] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

// NoctraTV · VidNest (VidNest) — Nuvio local scraper
// VidNest encrypts API responses with AES-GCM. Known VidNest deployments use a
// lightweight decrypt endpoint for that metadata. Final media URLs remain direct.

var CONFIGS=[
  {base:"https://first.vidnest.fun",pass:"A7kP9mQeXU2BWcD4fRZV+Sg8yN0/M5tLbC1HJQwYe6o="},
  {base:"https://backend.vidnest.fun",pass:"T8c8PQlSQVU4mBuW4CbE/g57VBbM5009QHd+ym93aZZ5pEeVpToY6OdpYPvRMVYp"}
];
var DEC="https://aesdec.nuvioapp.space/decrypt";
var FRONT="https://vidnest.fun";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var SERVERS=["hollymoviehd","primesrc","ophim","flixhq","vidlink","rogflix","allmovies"];
function clean(v){return v==null?"":String(v).trim();}
function qfrom(u,q){var s=clean(q);if(/4k|2160/i.test(s))return"4K";var m=s.match(/(\d{3,4})/);if(m)return m[1]+"p";m=String(u||"").match(/(\d{3,4})p/i);return m?m[1]+"p":(/\.m3u8/i.test(u)?"Auto":"HD");}
function decrypt(data,pass){
  return fetch(DEC,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({encryptedData:data,passphrase:pass})})
    .then(function(r){if(!r.ok)throw new Error("decrypt "+r.status);return r.json();})
    .then(function(j){if(j&&j.error)throw new Error(j.error);return j&&j.decrypted?j.decrypted:"";});
}
function normalize(d,server){
  var src=[];
  if(d&&Array.isArray(d.sources))src=d.sources;
  else if(d&&Array.isArray(d.streams))src=d.streams;
  else if(d&&typeof d.url==="string")src=[d];
  else if(d&&typeof d.data==="string"&&/^https?:\/\//i.test(d.data))src=[{url:d.data}];
  return src.map(function(s){
    var u=clean(s&&(s.file||s.url||s.src||s.link));if(!/^https?:\/\//i.test(u))return null;
    var q=qfrom(u,s.quality||s.label);
    var hh={};
    if(s.headers&&typeof s.headers==="object")Object.keys(s.headers).forEach(function(k){hh[k]=String(s.headers[k]);});
    if(!hh["User-Agent"])hh["User-Agent"]=UA;
    if(!hh["Referer"])hh["Referer"]=FRONT+"/";
    var subs=(Array.isArray(s.subtitles)?s.subtitles:[]).map(function(t){
      var su=clean(t&&(t.url||t.file||t.src));if(!su)return null;
      return{url:su,language:clean(t.language||t.lang||t.label||"en"),name:clean(t.label||t.language||"Subtitle")};
    }).filter(Boolean).slice(0,8);
    return{name:"NoctraTV · VidNest",title:"VidNest · "+server+" · "+q,
      url:u,quality:q,provider:"noctratv-vidnest",headers:hh,subtitles:subs};
  }).filter(Boolean);
}
function one(cfg,server,id,type,season,episode){
  var u=cfg.base+"/"+server+"/"+type+"/"+id;
  if(type==="tv")u+="/"+(season||1)+"/"+(episode||1);
  if(server==="flixhq")u+="?server=upcloud";
  return fetch(u,{headers:{
    "User-Agent":UA,"Accept":"application/json, text/plain, */*",
    "Origin":FRONT,"Referer":FRONT+"/"
  }}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.text();})
    .then(function(txt){
      var d=JSON.parse(txt);
      if(d&&d.encrypted&&d.data){
        return decrypt(d.data,cfg.pass).then(function(plain){return JSON.parse(plain);});
      }
      return d;
    }).then(function(d){return normalize(d,server);})
    .catch(function(){return[];});
}
function runConfig(cfg,id,type,season,episode){
  return Promise.all(SERVERS.map(function(s){return one(cfg,s,id,type,season,episode);}))
    .then(function(gs){var out=[];gs.forEach(function(g){out=out.concat(g||[]);});return out;});
}
function tryConfig(i,id,type,season,episode){
  if(i>=CONFIGS.length)return Promise.resolve([]);
  return runConfig(CONFIGS[i],id,type,season,episode)
    .then(function(o){return o.length?o:tryConfig(i+1,id,type,season,episode);})
    .catch(function(){return tryConfig(i+1,id,type,season,episode);});
}
function getStreams(tmdbId,mediaType,season,episode){
  return tryConfig(0,tmdbId,mediaType==="tv"?"tv":"movie",season,episode).then(function(rows){
    var out=[],seen={};(rows||[]).forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}});
    console.log("[Cinejoy/VidNest] streams="+out.length);return out;
  }).catch(function(e){console.error("[Cinejoy/VidNest] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

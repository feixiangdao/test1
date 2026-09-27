// Cinejoy · Astral Core 9 (VidCore) — Nuvio local scraper
// API-first collection with skip rounds; falls back across known VidCore domains.

var BASES = ["https://vidcore.org","https://www.vidcore.org","https://vidcore.io"];
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function qs(o){var a=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=="")a.push(encodeURIComponent(k)+"="+encodeURIComponent(String(o[k])));});return a.join("&");}
function qnum(q){var s=String(q||"").toLowerCase();if(/4k|2160/.test(s))return 2160;var m=s.match(/(\d{3,4})/);return m?parseInt(m[1],10):0;}
function fetchRound(base,p){
  var u=base+"/api/sources?"+qs(p);
  return fetch(u,{headers:{"User-Agent":UA,"Referer":base+"/","Origin":base,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
    .catch(function(){return null;});
}
function collect(sources,base,out,seen,labels){
  (sources||[]).forEach(function(o){
    if(!o||typeof o!=="object")return;
    var label=clean(o.label||o.provider||o.server||"VidCore");
    if(o.label!=null) labels[clean(o.label)]=1;
    var inn=[];
    if(o.data&&Array.isArray(o.data.sources))inn=o.data.sources;
    else if(Array.isArray(o.sources))inn=o.sources;
    else if(o.url||o.file)inn=[o];
    inn.forEach(function(s){
      var url=clean(s&&(s.url||s.file));
      if(!/^https?:\/\//i.test(url)||seen[url])return;
      seen[url]=1;
      var q=clean(s.quality||o.quality||"Auto");
      out.push({
        name:"Cinejoy · Astral Core 9",
        title:"Astral Core 9 · "+label+" · "+q,
        url:url,quality:q,provider:"cinejoy-vidcore",
        headers:{"User-Agent":UA,"Referer":base+"/"},
        subtitles:[]
      });
    });
  });
}
function runBase(base,tmdbId,mediaType,season,episode){
  var p={id:String(tmdbId),type:mediaType==="tv"?"tv":"movie"};
  if(mediaType==="tv"){p.season=season||1;p.episode=episode||1;}
  var out=[],seen={},labels={},round=0;
  function next(){
    var p2={};Object.keys(p).forEach(function(k){p2[k]=p[k];});
    var ls=Object.keys(labels); if(ls.length)p2.skip=ls.join(",");
    return fetchRound(base,p2).then(function(d){
      if(!d||!Array.isArray(d.sources)||!d.sources.length)return out;
      collect(d.sources,base,out,seen,labels);
      round++;
      if(round<4 && Object.keys(labels).length<12)return next();
      return out;
    });
  }
  return next();
}
function tryBase(i,tmdbId,mediaType,season,episode){
  if(i>=BASES.length)return Promise.resolve([]);
  return runBase(BASES[i],tmdbId,mediaType,season,episode)
    .then(function(out){return out.length?out:tryBase(i+1,tmdbId,mediaType,season,episode);})
    .catch(function(){return tryBase(i+1,tmdbId,mediaType,season,episode);});
}
function getStreams(tmdbId,mediaType,season,episode){
  return tryBase(0,tmdbId,mediaType,season,episode).then(function(out){
    out.sort(function(a,b){return qnum(b.quality)-qnum(a.quality);});
    console.log("[Cinejoy/VidCore] streams="+out.length);return out;
  }).catch(function(e){console.error("[Cinejoy/VidCore] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

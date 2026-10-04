// NoctraTV · Aether — direct JSON source family.
// Maps current noctratv.com Aether family, using Aether's public direct APIs.
// No iframe fallback.
var SITE="https://aether.ist";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/146 Mobile Safari/537.36";
var SIMPLE=[
  {name:"Link",base:"https://link.aether.cx",field:"stream",tvSeg:"tv"},
  {name:"Lul",base:"https://lul.aether.cx",field:"stream",tvSeg:"tv"}
];
var MERIDIAN="https://meridian.aether.cx";
var SUBTITULADO="https://le.aether.cx";
var GALLIC="https://api.pope-walrus-spiffy.workers.dev";

function clean(v){return v==null?"":String(v).trim();}
function headers(extra){
  var h={"User-Agent":UA,"Accept":"application/json,text/plain,*/*","Referer":SITE+"/","Origin":SITE};
  if(extra)Object.keys(extra).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function getJson(url,h){
  return fetch(url,{headers:headers(h)}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.text();
  }).then(function(t){
    if(!clean(t))throw new Error("empty");
    return JSON.parse(t);
  });
}
function inferType(u){
  if(/\.mpd(?:[?#]|$)/i.test(u))return"dash";
  if(/\.mp4(?:[?#]|$)/i.test(u))return"mp4";
  return"hls";
}
function quality(raw,u){
  var s=clean(raw)+" "+clean(u),m=s.match(/(2160|1440|1080|720|480|360)\s*p?/i);
  if(m)return m[1]==="2160"?"4K":m[1]+"p";
  if(/\b4k\b/i.test(s))return"4K";
  return"Auto";
}
function subs(list,label){
  if(!Array.isArray(list))return[];
  return list.filter(function(x){return x&&(x.url||x.file);}).slice(0,12).map(function(x){
    var lang=clean(x.language||x.lang||x.label)||"Subtitle";
    return{url:x.url||x.file,language:lang,name:lang+" ["+label+"]"};
  });
}
function normalizeUrl(u){
  u=clean(u);
  if(!/^https?:\/\//i.test(u))return null;
  if(/cdn\.neuronix\.sbs/i.test(u)&&!/\.m3u8(?:[?#]|$)/i.test(u)){
    u+=u.indexOf("?")>=0?"&type=.m3u8":"?type=.m3u8";
  }
  return u;
}
function make(label,u,rawQuality,h,subtitleList){
  u=normalizeUrl(u); if(!u)return null;
  var q=quality(rawQuality,u);
  var name="NoctraTV · Aether · "+label+" · "+q;
  var hh=headers(h);
  if(/cdn\.neuronix\.sbs/i.test(u)){
    hh["Origin"]="https://cdn.neuronix.sbs";
    hh["Referer"]="https://cdn.neuronix.sbs/";
  }
  return{name:name,title:name,url:u,quality:q,type:inferType(u),provider:"noctra-aether",headers:hh,subtitles:subtitleList||[]};
}
function mediaPath(type,id,s,e,tvSeg){
  return type==="tv"?"/"+(tvSeg||"tv")+"/"+id+"/"+Number(s||1)+"/"+Number(e||1):"/movie/"+id;
}
function simpleOne(p,id,type,s,e){
  var url=p.base+mediaPath(type,id,s,e,p.tvSeg);
  return getJson(url).then(function(j){
    var raw=j&&j[p.field];
    if(Array.isArray(raw))raw=raw.length?(raw[0].url||raw[0].file||raw[0]):null;
    var x=make(p.name,raw,j&&(j.quality||j.label),null,subs(j&&j.subtitles,p.name));
    return x?[x]:[];
  }).catch(function(err){
    console.log("[Noctra/Aether] "+p.name+" "+(err&&err.message?err.message:err));return[];
  });
}
function meridian(id,type,s,e){
  var url=MERIDIAN+mediaPath(type,id,s,e,"show");
  return getJson(url).then(function(j){
    var x=make("Meridian",j&&j.url,j&&(j.quality||j.label),null,subs(j&&j.subtitles,"Meridian"));
    return x?[x]:[];
  }).catch(function(err){
    console.log("[Noctra/Aether] Meridian "+(err&&err.message?err.message:err));return[];
  });
}

function subtitulado(id,type,s,e){
  var path=type==="tv"?"/tv/"+id+"/"+Number(s||1)+"/"+Number(e||1)+"?ser=tik":"/movie/"+id+"?lang=sub";
  return getJson(SUBTITULADO+path).then(function(j){
    var x=make("Subtitulado",j&&j.url,j&&(j.quality||j.label),null,subs(j&&j.subtitles,"Subtitulado"));
    if(x)x.language="Spanish";
    return x?[x]:[];
  }).catch(function(err){
    console.log("[Noctra/Aether] Subtitulado "+(err&&err.message?err.message:err));return[];
  });
}
function gallic(id,type,s,e){
  var path=type==="tv"?"/tv/"+id+"/"+Number(s||1)+"/"+Number(e||1):"/movie/"+id;
  return getJson(GALLIC+path).then(function(j){
    var a=j&&j.success&&Array.isArray(j.streams)?j.streams:[];
    return a.map(function(row){
      var x=make("Gallic"+(row&&row.provider?" / "+row.provider:""),row&&(row.url||row.file),row&&(row.quality||row.title),null,[]);
      if(x)x.language="French";
      return x;
    }).filter(Boolean);
  }).catch(function(err){
    console.log("[Noctra/Aether] Gallic "+(err&&err.message?err.message:err));return[];
  });
}
function dedupe(groups){
  var out=[],seen={};
  (groups||[]).forEach(function(g){(g||[]).forEach(function(x){
    if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
  });});
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var tasks=SIMPLE.map(function(p){return simpleOne(p,tmdbId,mediaType,season,episode);});
  tasks.push(meridian(tmdbId,mediaType,season,episode));
  tasks.push(subtitulado(tmdbId,mediaType,season,episode));
  tasks.push(gallic(tmdbId,mediaType,season,episode));
  return Promise.all(tasks).then(function(groups){
    var out=dedupe(groups);
    console.log("[Noctra/Aether] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/Aether] "+(e&&e.message?e.message:e));return[];
  });
}
module.exports={getStreams:getStreams};

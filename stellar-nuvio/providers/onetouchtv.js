// Stellar · OneTouchTV — strict-match local HLS provider
// API payloads are AES-256-CBC encrypted. False matches are deliberately rejected.

var CryptoJS=require("crypto-js");
var BASE="https://api3.devcorp.me";
var SITE="https://onetouchtv.xyz";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var UA="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var KEY=CryptoJS.enc.Utf8.parse("im72charPasswordofdInitVectorStm");
var IV=CryptoJS.enc.Utf8.parse("im72charPassword");

function clean(v){return v==null?"":String(v).trim()}
function norm(v){return clean(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"")}
function stripYear(v){return clean(v).replace(/\s*\((?:19|20)\d{2}\)\s*$/,"").trim()}
function yearNum(v){var m=clean(v).match(/(?:19|20)\d{2}/);return m?Number(m[0]):0}
function hdr(extra){var h={"User-Agent":UA,Accept:"application/json,text/plain,*/*",Referer:SITE+"/"};Object.keys(extra||{}).forEach(function(k){h[k]=extra[k]});return h}

function b64WordArray(s){
  s=clean(s).replace(/-_\./g,"/").replace(/@/g,"+").replace(/\s+/g,"");
  while(s.length%4)s+="=";
  return CryptoJS.enc.Base64.parse(s);
}
function decryptEnvelope(text){
  var cp=CryptoJS.lib.CipherParams.create({ciphertext:b64WordArray(text)});
  var out=CryptoJS.AES.decrypt(cp,KEY,{iv:IV,mode:CryptoJS.mode.CBC,padding:CryptoJS.pad.Pkcs7});
  var json=CryptoJS.enc.Utf8.stringify(out);
  if(!json)throw new Error("OneTouch decrypt empty");
  var parsed=JSON.parse(json);
  return parsed&&Object.prototype.hasOwnProperty.call(parsed,"result")?parsed.result:parsed;
}
function encrypted(path){
  return fetch(BASE+path,{headers:hdr()}).then(function(r){
    return r.text().then(function(t){
      if(!r.ok)throw new Error("OneTouch HTTP "+r.status);
      return decryptEnvelope(t);
    });
  });
}
function tmdbMeta(id,type){
  var t=type==="tv"?"tv":"movie";
  var url=TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(TMDB_KEY)+"&language=en-US";
  return fetch(url,{headers:{"User-Agent":UA,Accept:"application/json"}}).then(function(r){
    if(!r.ok)throw new Error("TMDB "+r.status);
    return r.json();
  }).then(function(d){
    var date=clean(t==="tv"?d.first_air_date:d.release_date);
    return{
      title:clean(t==="tv"?d.name:d.title),
      originalTitle:clean(t==="tv"?d.original_name:d.original_title),
      year:date?Number(date.slice(0,4))||0:0
    };
  });
}
function typeOK(row,type){
  var t=clean(row&&row.type).toLowerCase();
  return type==="movie"?t==="movie":t!==""&&t!=="movie";
}
function titleExact(row,wanted){
  return norm(stripYear(row&&row.title))===norm(wanted);
}
function chooseMovie(rows,meta){
  var titles=[meta.title,meta.originalTitle].filter(Boolean);
  var exact=(Array.isArray(rows)?rows:[]).filter(function(r){
    if(!typeOK(r,"movie"))return false;
    if(!titles.some(function(t){return titleExact(r,t)}))return false;
    var y=yearNum(r.year||r.title);
    return !meta.year||!y||y===meta.year;
  });
  if(meta.year){
    var yhit=exact.find(function(r){return yearNum(r.year||r.title)===meta.year});
    if(yhit)return yhit;
  }
  return exact.length===1?exact[0]:null;
}
function chooseTv(rows,meta,season,seasonQuery){
  var s=Number(season)||1;
  var titles=[meta.title,meta.originalTitle].filter(Boolean);
  var wantedSeason=titles.map(function(t){return norm(t+" Season "+s)});
  var candidates=(Array.isArray(rows)?rows:[]).filter(function(r){return typeOK(r,"tv")});
  if(seasonQuery){
    var shits=candidates.filter(function(r){return wantedSeason.indexOf(norm(stripYear(r.title)))>=0});
    if(shits.length===1)return{row:shits[0],seasonSpecific:true};
    if(shits.length>1){
      var sy=shits.find(function(r){var y=yearNum(r.year||r.title);return meta.year&&y===meta.year});
      if(sy)return{row:sy,seasonSpecific:true};
      return null;
    }
  }
  var base=candidates.filter(function(r){
    if(!titles.some(function(t){return titleExact(r,t)}))return false;
    var y=yearNum(r.year||r.title);
    return !meta.year||!y||y===meta.year;
  });
  if(meta.year){
    var hit=base.find(function(r){return yearNum(r.year||r.title)===meta.year});
    if(hit)return{row:hit,seasonSpecific:false};
  }
  return base.length===1?{row:base[0],seasonSpecific:false}:null;
}
function search(q){return encrypted("/vod/search?keyword="+encodeURIComponent(q)).then(function(x){return Array.isArray(x)?x:[]})}
function detail(id){return encrypted("/vod/"+encodeURIComponent(String(id))+"/detail")}
function episodeData(id,playId){return encrypted("/vod/"+encodeURIComponent(String(id))+"/episode/"+encodeURIComponent(String(playId)))}
function quality(v){
  var s=clean(v).toLowerCase();
  if(s.indexOf("2160")>=0||s.indexOf("4k")>=0)return"2160p";
  if(s.indexOf("1080")>=0)return"1080p";
  if(s.indexOf("720")>=0)return"720p";
  if(s.indexOf("480")>=0)return"480p";
  if(s.indexOf("360")>=0)return"360p";
  return"Auto";
}
function subtitles(data){
  var out=[],seen={};
  (Array.isArray(data&&data.track)?data.track:[]).forEach(function(t,i){
    var u=clean(t&&t.file);if(!/^https?:\/\//i.test(u)||seen[u])return;seen[u]=1;
    var n=clean(t.name||t.label||t.language||t.lang)||"Subtitle";
    out.push({url:u,language:clean(t.language||t.lang)||n,name:n+" [OneTouch]"});
  });
  return out;
}
function verifySource(src){
  var url=clean(src&&src.url);
  if(!/^https?:\/\//i.test(url))return Promise.resolve(null);
  return fetch(url,{headers:{"User-Agent":UA,Referer:BASE+"/",Range:"bytes=0-2047"}}).then(function(r){
    if(!(r.ok||r.status===206))return null;
    var type=clean(src.type).toLowerCase();
    if(type.indexOf("hls")>=0||url.indexOf(".m3u8")>=0){
      return r.text().then(function(t){return /^#EXTM3U/m.test(t)?src:null}).catch(function(){return null});
    }
    return src;
  }).catch(function(){return null});
}
function findEpisode(detailObj,episode){
  var e=Number(episode)||1;
  return (Array.isArray(detailObj&&detailObj.episodes)?detailObj.episodes:[]).find(function(x){
    return Number(x&&x.episode)===e;
  })||null;
}

function getStreams(tmdbId,mediaType,season,episode){
  var meta=null,selection=null;
  var type=mediaType==="tv"?"tv":"movie";
  var s=Number(season)||1,e=Number(episode)||1;
  return tmdbMeta(tmdbId,type).then(function(m){
    meta=m;
    if(type==="movie"){
      return search(meta.title).then(function(rows){var hit=chooseMovie(rows,meta);return hit?{row:hit,seasonSpecific:false}:null});
    }
    if(s>1){
      return search(meta.title+" Season "+s).then(function(rows){
        var hit=chooseTv(rows,meta,s,true);
        if(hit)return hit;
        return search(meta.title).then(function(rows2){return chooseTv(rows2,meta,s,false)});
      });
    }
    return search(meta.title).then(function(rows){return chooseTv(rows,meta,s,false)});
  }).then(function(sel){
    selection=sel;
    if(!selection||!selection.row||selection.row.id==null)throw new Error("strict title/year match missing");
    // A base-series entry is only safe for season 1. For later seasons require an explicit Season N item.
    if(type==="tv"&&s>1&&!selection.seasonSpecific)throw new Error("season-specific entry missing");
    return detail(selection.row.id);
  }).then(function(d){
    var ep=type==="movie"?(Array.isArray(d&&d.episodes)?d.episodes[0]:null):findEpisode(d,e);
    if(!ep||ep.playId==null)throw new Error("episode missing");
    return episodeData(selection.row.id,ep.playId);
  }).then(function(data){
    var srcs=(Array.isArray(data&&data.sources)?data.sources:[]).filter(function(x){return x&&x.url});
    return Promise.all(srcs.slice(0,8).map(verifySource)).then(function(ok){
      var ss=subtitles(data),out=[],seen={};
      ok.forEach(function(src){
        if(!src||seen[src.url])return;seen[src.url]=1;
        var q=quality(src.quality),name="OneTouchTV · "+q;
        out.push({name:name,title:name,url:src.url,quality:q,provider:"stellar-onetouchtv",
          headers:{"User-Agent":UA,Referer:BASE+"/"},subtitles:ss});
      });
      console.log("[Stellar/OneTouchTV] "+meta.title+" streams="+out.length);
      return out;
    });
  }).catch(function(err){
    console.error("[Stellar/OneTouchTV] "+(err&&err.message?err.message:err));
    return[];
  });
}
module.exports={getStreams:getStreams,chooseMovie:chooseMovie,chooseTv:chooseTv,decryptEnvelope:decryptEnvelope};

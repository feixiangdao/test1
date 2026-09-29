// Stellar · PurStream — direct HLS via current PurStream API
// Flow: TMDB metadata -> strict PurStream title/year match -> direct stream API -> HLS preflight.

var API="https://api.purstream.ad/api/v1";
var SITE="https://purstream.ad";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY=(typeof globalThis!=="undefined"&&globalThis.TMDB_API_KEY)?globalThis.TMDB_API_KEY:"68e094699525b18a70bab2f86b1fa706";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim()}
function norm(v){return clean(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ")}
function year(v){var m=clean(v).match(/(?:19|20)\d{2}/);return m?Number(m[0]):0}
function headers(extra){
  var h={"User-Agent":UA,Accept:"application/json,text/plain,*/*",Origin:SITE,Referer:SITE+"/"};
  Object.keys(extra||{}).forEach(function(k){h[k]=extra[k]});
  return h;
}
function json(url){
  return fetch(url,{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error("PurStream HTTP "+r.status);
    return r.json();
  });
}
function tmdbMeta(id,type){
  var t=type==="tv"?"tv":"movie";
  return fetch(TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(TMDB_KEY)+"&language=en-US",{
    headers:{"User-Agent":UA,Accept:"application/json"}
  }).then(function(r){
    if(!r.ok)throw new Error("TMDB "+r.status);
    return r.json();
  }).then(function(d){
    var date=clean(t==="tv"?d.first_air_date:d.release_date);
    return{
      title:clean(t==="tv"?d.name:d.title),
      originalTitle:clean(t==="tv"?d.original_name:d.original_title),
      year:year(date),
      type:t
    };
  });
}
function flattenSearch(value,path,out){
  out=out||[];path=path||"";
  if(Array.isArray(value)){
    value.forEach(function(x){flattenSearch(x,path,out)});
    return out;
  }
  if(!value||typeof value!=="object")return out;
  if(value.id!=null&&(value.title||value.name)){
    var copy={};
    Object.keys(value).forEach(function(k){copy[k]=value[k]});
    copy.__path=path.toLowerCase();
    out.push(copy);
  }
  Object.keys(value).forEach(function(k){
    var v=value[k];
    if(v&&typeof v==="object")flattenSearch(v,path+"/"+k,out);
  });
  return out;
}
function rowTypeOK(row,type){
  var p=clean(row&&row.__path).toLowerCase();
  var t=clean(row&&(row.type||row.media_type||row.mediaType)).toLowerCase();
  if(type==="movie"){
    if(/series|tv|show|anime/.test(p))return false;
    if(t&&t!=="movie"&&t!=="film")return false;
  }else{
    if(/movie|films?/.test(p))return false;
    if(t&&t==="movie")return false;
  }
  return true;
}
function pick(rows,meta){
  var wanted=[meta.title,meta.originalTitle].filter(Boolean).map(norm);
  var exact=(rows||[]).filter(function(r){
    if(!rowTypeOK(r,meta.type))return false;
    var rt=norm(r.title||r.name);
    if(wanted.indexOf(rt)<0)return false;
    var ry=year(r.release_date||r.first_air_date||r.year);
    return !meta.year||!ry||ry===meta.year;
  });
  if(meta.year){
    var yh=exact.find(function(r){return year(r.release_date||r.first_air_date||r.year)===meta.year});
    if(yh)return yh;
  }
  return exact.length===1?exact[0]:null;
}
function search(meta){
  var queries=[meta.title];
  if(meta.originalTitle&&norm(meta.originalTitle)!==norm(meta.title))queries.push(meta.originalTitle);
  function run(i){
    if(i>=queries.length)return Promise.resolve(null);
    return json(API+"/search-bar/search/"+encodeURIComponent(queries[i])).then(function(d){
      var hit=pick(flattenSearch(d),meta);
      return hit||run(i+1);
    }).catch(function(){return run(i+1)});
  }
  return run(0);
}
function directUrls(value,out){
  out=out||[];
  if(Array.isArray(value)){value.forEach(function(x){directUrls(x,out)});return out}
  if(typeof value==="string"){
    if(/^https?:\/\//i.test(value)&&(/\.m3u8(?:[?#]|$)/i.test(value)||/\.mp4(?:[?#]|$)/i.test(value)||/\.mkv(?:[?#]|$)/i.test(value)))out.push(value);
    return out;
  }
  if(!value||typeof value!=="object")return out;
  Object.keys(value).forEach(function(k){
    var v=value[k];
    if(typeof v==="string"&&/^(?:stream_url|url|file|src)$/i.test(k)){
      if(/^https?:\/\//i.test(v)&&(/\.m3u8(?:[?#]|$)/i.test(v)||/\.mp4(?:[?#]|$)/i.test(v)||/\.mkv(?:[?#]|$)/i.test(v)))out.push(v);
    }else if(v&&typeof v==="object")directUrls(v,out);
  });
  return out;
}
function uniq(a){var seen={},out=[];(a||[]).forEach(function(x){if(x&&!seen[x]){seen[x]=1;out.push(x)}});return out}
function qualityFromText(s){
  var m=clean(s).match(/(2160|1440|1080|720|576|540|480|360|240)p?/i);
  return m?m[1]+"p":"Auto";
}
function verify(url){
  return fetch(url,{headers:headers({Range:"bytes=0-4095"})}).then(function(r){
    if(!(r.ok||r.status===206))return null;
    var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
    if(/\.m3u8(?:[?#]|$)/i.test(url)||ct.indexOf("mpegurl")>=0){
      return r.text().then(function(t){
        if(!/^#EXTM3U/m.test(t))return null;
        var q=qualityFromText(t);
        return{url:url,quality:q};
      }).catch(function(){return null});
    }
    if(ct.indexOf("video/")===0||ct.indexOf("application/octet-stream")===0)return{url:url,quality:qualityFromText(url)};
    return null;
  }).catch(function(){return null});
}
function getStreams(tmdbId,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie",meta=null;
  if(!tmdbId)return Promise.resolve([]);
  if(type==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tmdbMeta(tmdbId,type).then(function(m){
    meta=m;return search(meta);
  }).then(function(hit){
    if(!hit||hit.id==null)throw new Error("strict title/year match missing");
    var route=API+"/stream/"+encodeURIComponent(String(hit.id));
    if(type==="tv")route+="/episode?season="+encodeURIComponent(String(Number(season)))+"&episode="+encodeURIComponent(String(Number(episode)));
    return json(route);
  }).then(function(data){
    var urls=uniq(directUrls(data));
    return Promise.all(urls.slice(0,8).map(verify));
  }).then(function(rows){
    var out=[],seen={};
    rows.forEach(function(v){
      if(!v||seen[v.url])return;seen[v.url]=1;
      var q=v.quality==="Auto"?"720p":v.quality;
      var name="PurStream · "+q;
      out.push({name:name,title:name,url:v.url,quality:q,type:"hls",provider:"stellar-purstream",
        headers:{"User-Agent":UA,Referer:SITE+"/",Origin:SITE}});
    });
    console.log("[Stellar/PurStream] "+meta.title+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.error("[Stellar/PurStream] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams,pick:pick,flattenSearch:flattenSearch,directUrls:directUrls};

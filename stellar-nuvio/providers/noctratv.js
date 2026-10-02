// Stellar · NoctraTV — Noctra's current VidSrc Me source as a native Nuvio provider.
// No iframe/web player: TMDB id -> VidSrc Me stream API -> verified HLS/MP4/DASH.
// If the API yields nothing, fall back to conservative direct-media extraction from
// the same embed endpoints used by the current Noctra server choice.

var NOCTRA_SITE="https://www.noctra.tv";
var API="https://data.vidsrcme.ru";
var EMBEDS=["https://vsembed.ru/embed","https://vidsrc.me/embed"];
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim()}
function uniq(rows){
  var out=[],seen={};
  (rows||[]).forEach(function(x){
    if(!x||!/^https?:\/\//i.test(x.url||"")||seen[x.url])return;
    seen[x.url]=1;out.push(x);
  });
  return out;
}
function mediaUrl(u){
  return /^https?:\/\//i.test(clean(u))&&/(?:\.m3u8|\.mp4|\.mpd)(?:[?#]|$)/i.test(clean(u));
}
function directUrls(text){
  var s=String(text||"")
    .replace(/\\u0026/gi,"&")
    .replace(/\\u003d/gi,"=")
    .replace(/\\\//g,"/")
    .replace(/&amp;/g,"&");
  var re=/https?:\/\/[^"'\\\s<>]+(?:\.m3u8|\.mp4|\.mpd)(?:\?[^"'\\\s<>]*)?/gi;
  var m,out=[],seen={};
  while((m=re.exec(s))){
    var u=clean(m[0]).replace(/[),;\]}]+$/,"");
    if(!seen[u]){seen[u]=1;out.push(u)}
  }
  return out;
}
function collectMedia(value,out){
  out=out||[];
  if(Array.isArray(value)){
    value.forEach(function(x){collectMedia(x,out)});
    return out;
  }
  if(typeof value==="string"){
    if(mediaUrl(value))out.push(clean(value));
    directUrls(value).forEach(function(u){out.push(u)});
    return out;
  }
  if(!value||typeof value!=="object")return out;
  Object.keys(value).forEach(function(k){collectMedia(value[k],out)});
  return out;
}
function qualityFromText(s,fallback){
  var m=String(s||"").match(/(?:^|[^\d])(2160|1440|1080|720|576|540|480|360|240)p?(?:[^\d]|$)/i);
  if(m)return m[1]==="2160"?"4K":m[1]+"p";
  return fallback||"Auto";
}
function apiUrl(tmdbId,mediaType,season,episode){
  var u=API+"/api.php?type="+(mediaType==="tv"?"tv":"movie")+"&tmdb="+encodeURIComponent(String(tmdbId))+"&stream_urls=";
  if(mediaType==="tv")u+="&season="+encodeURIComponent(String(season||1))+"&episode="+encodeURIComponent(String(episode||1));
  return u;
}
function embedUrl(base,tmdbId,mediaType,season,episode){
  return mediaType==="tv"
    ?base+"/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season||1))+"/"+encodeURIComponent(String(episode||1))
    :base+"/movie/"+encodeURIComponent(String(tmdbId));
}
function requestHeaders(referer,accept){
  return{"User-Agent":UA,"Referer":referer||NOCTRA_SITE+"/","Accept":accept||"*/*"};
}
function verify(url,referer){
  return fetch(url,{headers:Object.assign(requestHeaders(referer),{Range:"bytes=0-4095"})})
    .then(function(r){
      if(!(r.ok||r.status===206))return null;
      var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
      var isHls=/\.m3u8(?:[?#]|$)/i.test(url)||ct.indexOf("mpegurl")>=0;
      var isDash=/\.mpd(?:[?#]|$)/i.test(url)||ct.indexOf("dash+xml")>=0;
      if(isHls){
        return r.text().then(function(body){
          if(!/^#EXTM3U/m.test(body))return null;
          var max=0,m,re=/RESOLUTION=\d+x(\d+)/gi;
          while((m=re.exec(body))!==null)max=Math.max(max,parseInt(m[1],10)||0);
          return{url:url,format:"HLS",quality:max?max+"p":qualityFromText(url,"Auto"),referer:referer};
        }).catch(function(){return null});
      }
      if(isDash){
        return r.text().then(function(body){
          if(!/<MPD(?:\s|>)/i.test(body))return null;
          return{url:url,format:"DASH",quality:qualityFromText(body,qualityFromText(url,"Auto")),referer:referer};
        }).catch(function(){return null});
      }
      if(ct.indexOf("video/")===0||ct.indexOf("application/octet-stream")===0){
        return{url:url,format:"MP4",quality:qualityFromText(url,"HD"),referer:referer};
      }
      return null;
    }).catch(function(){return null});
}
function verifyMany(urls,referer){
  var seen={},list=[];
  (urls||[]).forEach(function(u){u=clean(u);if(mediaUrl(u)&&!seen[u]){seen[u]=1;list.push(u)}});
  return Promise.all(list.slice(0,10).map(function(u){return verify(u,referer)}))
    .then(function(rows){return rows.filter(Boolean)});
}
function fromApi(tmdbId,mediaType,season,episode){
  var referer="https://vsembed.ru/";
  return fetch(apiUrl(tmdbId,mediaType,season,episode),{
    headers:requestHeaders(referer,"application/json, text/plain, */*")
  }).then(function(r){
    if(!r.ok)throw new Error("API "+r.status);
    return r.json();
  }).then(function(data){
    return verifyMany(collectMedia(data),referer);
  }).catch(function(){return[]});
}
function fromEmbed(index,tmdbId,mediaType,season,episode){
  if(index>=EMBEDS.length)return Promise.resolve([]);
  var base=EMBEDS[index],page=embedUrl(base,tmdbId,mediaType,season,episode),referer=base+"/";
  return fetch(page,{headers:requestHeaders(referer,"text/html,application/xhtml+xml, */*")})
    .then(function(r){if(!r.ok)throw new Error("embed "+r.status);return r.text()})
    .then(function(html){
      var urls=directUrls(html);
      if(!urls.length)return fromEmbed(index+1,tmdbId,mediaType,season,episode);
      return verifyMany(urls,referer).then(function(rows){
        return rows.length?rows:fromEmbed(index+1,tmdbId,mediaType,season,episode);
      });
    }).catch(function(){return fromEmbed(index+1,tmdbId,mediaType,season,episode)});
}
function toStreams(rows){
  return uniq((rows||[]).map(function(x,i){
    var q=x.quality||"Auto";
    var name="NoctraTV · VidSrc Me · "+x.format+" · "+q+(rows.length>1?" · "+(i+1):"");
    return{name:name,title:name,url:x.url,quality:q,provider:"stellar-noctratv",
      headers:requestHeaders(x.referer),subtitles:[]};
  }));
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return fromApi(tmdbId,mediaType,season,episode).then(function(rows){
    if(rows.length)return rows;
    return fromEmbed(0,tmdbId,mediaType,season,episode);
  }).then(function(rows){
    var out=toStreams(rows);
    console.log("[Stellar/NoctraTV] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.error("[Stellar/NoctraTV] "+(e&&e.message?e.message:e));
    return[];
  });
}

module.exports={getStreams:getStreams,apiUrl:apiUrl,embedUrl:embedUrl,directUrls:directUrls,collectMedia:collectMedia};

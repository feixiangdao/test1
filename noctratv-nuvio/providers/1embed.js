// NoctraTV · 1Embed — current token + server API local resolver.
// Mapped from noctratv.com source entries:
//   1Embed · MAIN  -> 1embed.cc/server/vidsrc
//   1Embed · EMP   -> 1embed.cc/server/emp
// Uses the proxy streamUrl returned by 1Embed because raw_m3u8 can be IP-locked.

var BASE="https://1embed.cc";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var SERVERS=[
  {key:"vidsrc",label:"MAIN"},
  {key:"emp",label:"EMP"}
];

function clean(v){return v==null?"":String(v).trim()}
function headers(extra){
  var h={
    "User-Agent":UA,
    "Referer":BASE+"/",
    "Origin":BASE,
    "Accept":"application/json, text/plain, */*"
  };
  Object.keys(extra||{}).forEach(function(k){h[k]=extra[k]});
  return h;
}
function getToken(){
  return fetch(BASE+"/api/token",{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error("token HTTP "+r.status);
    return r.json();
  }).then(function(j){
    var t=clean(j&&j.token);
    if(!t)throw new Error("token missing");
    return t;
  });
}
function serverUrl(server,tmdbId,mediaType,season,episode,token){
  var u=BASE+"/server/"+server+"/id="+encodeURIComponent(String(tmdbId))+
    "?type="+(mediaType==="tv"?"tv":"movie");
  if(mediaType==="tv"){
    u+="&season="+encodeURIComponent(String(season||1))+
      "&episode="+encodeURIComponent(String(episode||1));
  }
  u+="&_st="+encodeURIComponent(token);
  return u;
}
function normalizeSubs(root){
  var list=root&&Array.isArray(root.subtitles)?root.subtitles:[];
  return list.map(function(s){
    var u=clean(s&&(s.url||s.rawUrl||s.file));if(!u)return null;
    if(!/\.(?:vtt|srt)(?:[?#]|$)/i.test(u))return null;
    return{
      url:u,
      language:clean(s.language||s.lang||s.label||"en"),
      name:clean(s.label||s.language||s.lang||"Subtitle")
    };
  }).filter(Boolean).slice(0,12);
}
function streamUrl(root){
  var u=clean(root&&root.streamUrl);
  if(u)return u;
  var s=root&&root.streams;
  return clean(s&&(s.proxy_m3u8||s.raw_m3u8||s.url));
}
function maxQuality(body){
  var max=0,m,re=/RESOLUTION=\d+x(\d+)/gi,s=String(body||"");
  while((m=re.exec(s))!==null)max=Math.max(max,parseInt(m[1],10)||0);
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}
function verify(url){
  return fetch(url,{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(String(body).indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    return maxQuality(body);
  });
}
function one(server,token,tmdbId,mediaType,season,episode){
  var u=serverUrl(server.key,tmdbId,mediaType,season,episode,token);
  return fetch(u,{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error(server.label+" HTTP "+r.status);
    return r.json();
  }).then(function(root){
    if(root&&root.success===false)throw new Error(server.label+" success=false");
    var url=streamUrl(root);
    if(!/^https?:\/\//i.test(url))throw new Error(server.label+" stream missing");
    return verify(url).then(function(q){
      var aud=root&&Array.isArray(root.audioTracks)?root.audioTracks:[];
      var audio=aud.map(function(x){return clean(x&&(x.name||x.language))}).filter(Boolean);
      var name="NoctraTV · 1Embed · "+server.label+" · "+q;
      if(audio.length>1)name+=" · Multi-Audio";
      return{
        name:name,title:name,url:url,quality:q,type:"hls",
        provider:"noctra-1embed",headers:headers(),
        subtitles:normalizeSubs(root)
      };
    });
  }).catch(function(e){
    console.log("[NoctraTV/1Embed] "+server.label+" "+(e&&e.message?e.message:e));
    return null;
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return getToken().then(function(token){
    return Promise.all(SERVERS.map(function(s){
      return one(s,token,tmdbId,mediaType,season,episode);
    }));
  }).then(function(rows){
    var out=rows.filter(Boolean);
    console.log("[NoctraTV/1Embed] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.error("[NoctraTV/1Embed] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams,serverUrl:serverUrl,streamUrl:streamUrl};

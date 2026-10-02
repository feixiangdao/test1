// NoctraTV · VidLove — direct JSON API resolver.
// Mapped from noctratv.com:
//   VidLove · warden
//   VidLove · vidapi
//   VidLove · moviebox
//
// The API returns a direct source URL and, on current responses, often embeds
// the master manifest text as source.manifest. No iframe is returned to Nuvio.

var API="https://api.vidlove.cc";
var PLAYER="https://player.vidlove.cc";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";
var VARIANTS=[
  {key:"warden",label:"warden"},
  {key:"vidapi",label:"vidapi"},
  {key:"moviebox",label:"moviebox"}
];

function clean(v){return v==null?"":String(v).trim()}
function headers(){
  return{
    "User-Agent":UA,
    "Referer":PLAYER+"/",
    "Origin":PLAYER,
    "Accept":"application/json, text/plain, */*"
  };
}
function apiPath(tmdbId,mediaType,season,episode,key){
  var u=mediaType==="tv"
    ?"/tv?id="+encodeURIComponent(String(tmdbId))+
      "&season="+encodeURIComponent(String(season||1))+
      "&episode="+encodeURIComponent(String(episode||1))+"&mode=json"
    :"/movie?id="+encodeURIComponent(String(tmdbId))+"&mode=json";
  return u+"&sources="+encodeURIComponent(key);
}
function qualityFromManifest(manifest){
  var s=String(manifest||""),max=0,m,re=/RESOLUTION=\d+x(\d+)/gi;
  while((m=re.exec(s))!==null)max=Math.max(max,parseInt(m[1],10)||0);
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}
function normalizeSubs(list){
  return(Array.isArray(list)?list:[]).map(function(s){
    var u=clean(s&&(s.file||s.url));if(!u)return null;
    return{url:u,language:clean(s.language||s.lang||s.label||"en"),name:clean(s.label||s.language||"Subtitle")};
  }).filter(Boolean).slice(0,12);
}
function verifyIfNeeded(url,manifest){
  var m=String(manifest||"");
  if(m.indexOf("#EXTM3U")===0)return Promise.resolve(qualityFromManifest(m));
  return fetch(url,{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error("media HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(String(body).indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    return qualityFromManifest(body);
  });
}
function one(v,tmdbId,mediaType,season,episode){
  var u=API+apiPath(tmdbId,mediaType,season,episode,v.key);
  return fetch(u,{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error(v.label+" API HTTP "+r.status);
    return r.json();
  }).then(function(j){
    var src=j&&j.source,url=clean(src&&src.url);
    if(!/^https?:\/\//i.test(url))throw new Error(v.label+" source missing");
    return verifyIfNeeded(url,src&&src.manifest).then(function(q){
      var name="NoctraTV · VidLove · "+v.label+" · "+q;
      return{
        name:name,title:name,url:url,quality:q,type:"hls",
        provider:"noctra-vidlove",headers:headers(),
        subtitles:normalizeSubs(j&&j.subtitles)
      };
    });
  }).catch(function(e){
    console.log("[NoctraTV/VidLove] "+v.label+" "+(e&&e.message?e.message:e));
    return null;
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return Promise.all(VARIANTS.map(function(v){return one(v,tmdbId,mediaType,season,episode)}))
    .then(function(rows){
      var seen={},out=[];
      rows.filter(Boolean).forEach(function(x){if(!seen[x.url]){seen[x.url]=1;out.push(x)}});
      console.log("[NoctraTV/VidLove] "+mediaType+" "+tmdbId+" streams="+out.length);
      return out;
    }).catch(function(e){console.error("[NoctraTV/VidLove] "+(e&&e.message?e.message:e));return[]});
}
module.exports={getStreams:getStreams,apiPath:apiPath,qualityFromManifest:qualityFromManifest};

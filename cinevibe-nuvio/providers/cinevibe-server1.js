// CineVibe Local for Nuvio
// v0.2.7
//
// Stable client path:
// Nuvio -> CineVibe quality resolver -> CineVibe/Viduki resolver -> direct CDN.
//
// Important: Nuvio/Hermes does NOT inspect HLS playlists or TS segments locally.
// Resolution detection happens server-side and is returned as a lightweight
// "quality" field. Playback still goes directly from Nuvio to the CDN.

var DEFAULT_RESOLVER="https://cinevibe-quality-resolver-feixiangd.vercel.app/api/resolve";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function settings(){try{return(typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS)||{};}catch(_){return{};}}
function resolverUrl(){
  var s=settings(),u=clean(s.resolverUrl)||DEFAULT_RESOLVER;
  return u.replace(/[?#].*$/,"");
}
function mediaType(url,fallback){
  var p=clean(url).split("?")[0].toLowerCase();
  if(/\.m3u8$/.test(p))return"hls";
  if(/\.mpd$/.test(p))return"dash";
  if(/\.mp4$/.test(p))return"mp4";
  return fallback==="dash"?"dash":fallback==="mp4"?"mp4":"hls";
}
function transferable(url,server){
  url=clean(url);server=clean(server).toLowerCase();
  if(server==="leon"||server==="claire"||server==="rebecca"||server==="chris")return false;
  if(/jerso441ceg\.com/i.test(url))return false;
  if(/reamefly\.cyou|steman\.cyou/i.test(url))return false;
  if(/:[0-9]{9,12}:(?:\d{1,3}\.){3}\d{1,3}:/i.test(url))return false;
  return true;
}
function routeRank(x){
  var s=clean(x&&x.server).toLowerCase();
  if(s==="jill")return 1;
  if(s==="ethan")return 2;
  if(s==="wesker")return 3;
  if(s==="ada")return 4;
  return 20;
}
function requestUrl(id,type,season,episode){
  var u=resolverUrl()+"?type="+(type==="tv"?"tv":"movie")+"&id="+encodeURIComponent(String(id))+"&maxServers=10";
  if(type==="tv"){
    u+="&season="+encodeURIComponent(String(season||0));
    u+="&episode="+encodeURIComponent(String(episode||0));
  }
  return u;
}
function fetchJson(url){
  var opt={headers:{"Accept":"application/json","User-Agent":UA}};
  try{opt.skipSizeCheck=true;}catch(_){}
  return fetch(url,opt).then(function(r){
    return r.text().then(function(t){
      var j=null;
      try{j=JSON.parse(t);}catch(_){throw new Error("resolver invalid JSON");}
      if(!r.ok&&!j.ok)throw new Error(j.error||("resolver HTTP "+r.status));
      return j;
    });
  });
}
function getStreams(tmdbId,mediaTypeArg,season,episode){
  var type=mediaTypeArg==="tv"?"tv":"movie";
  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;
  if(!tmdbId)return Promise.resolve([]);
  if(type==="tv"&&(!season||!episode))return Promise.resolve([]);

  var u=requestUrl(tmdbId,type,season,episode);
  try{console.log("[CineVibe] "+type+" "+tmdbId+(type==="tv"?" S"+season+"E"+episode:"")+" via quality resolver");}catch(_){}

  return fetchJson(u).then(function(j){
    var rows=Array.isArray(j&&j.streams)?j.streams.slice():[];
    rows.sort(function(a,b){return routeRank(a)-routeRank(b);});
    var seen={},out=[];
    rows.forEach(function(x){
      x=x||{};
      var url=clean(x.url);
      if(!/^https?:\/\//i.test(url)||x.portableHint===false||!transferable(url,x.server)||seen[url])return;
      var mt=mediaType(url,x.type);
      if(mt==="hls"&&!/\.m3u8(?:$|[?#])/i.test(url)&&clean(x.type)==="unknown")return;
      seen[url]=1;

      var server=clean(x.server)||"Server 1";
      var lang=clean(x.language);
      var name="CineVibe · "+server;
      if(lang&&lang!=="ENGLISH")name+=" · "+lang;
      var q=clean(x.quality)||"Auto";

      var h={};
      if(x.headers&&typeof x.headers==="object"){
        Object.keys(x.headers).forEach(function(k){if(clean(x.headers[k]))h[k]=String(x.headers[k]);});
      }
      if(!h["User-Agent"])h["User-Agent"]=UA;

      out.push({
        name:name,
        title:name,
        url:url,
        quality:q,
        type:mt,
        provider:"cinevibe-server1",
        headers:h,
        subtitles:[]
      });
    });
    try{console.log("[CineVibe] streams="+out.length);}catch(_){}
    return out;
  }).catch(function(e){
    try{console.log("[CineVibe] resolver FAIL · "+(e&&e.message?e.message:e));}catch(_){}
    return[];
  });
}
function onSettings(){
  return[
    {type:"header",label:"CineVibe Local · Server 1"},
    {type:"info",label:"当前真实链路：CineVibe → vidsrc.wtf API 1 → Viduki V1。清晰度由服务端读取实际码流后返回；Nuvio 本地不再解析 m3u8/TS，因此不会因清晰度探测导致线路消失。"},
    {
      type:"text",
      key:"resolverUrl",
      label:"Resolver URL（通常无需修改）",
      description:"默认使用 CineVibe Local quality resolver。",
      defaultValue:DEFAULT_RESOLVER,
      isPassword:false
    }
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

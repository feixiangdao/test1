// CineVibe Local for Nuvio
// v0.2.0
//
// Proven current chain (2026-10-07):
// cinevibe.cc Server 1 -> vidsrc.wtf API 1 -> Viduki V1.
//
// Viduki now protects its direct media API with ALTCHA + rotating WASM.
// Hermes should not be asked to run that stateful WASM bridge locally, so this
// provider calls a tiny resolver that performs only challenge/decryption and
// returns the real CDN URL. Video bytes still go directly from Nuvio to CDN.

var DEFAULT_RESOLVER="https://cinevibe-resolver-feixiangdao.vercel.app/api/resolve";
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
function requestUrl(id,type,season,episode){
  var u=resolverUrl()+"?type="+(type==="tv"?"tv":"movie")+"&id="+encodeURIComponent(String(id))+"&maxServers=8";
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
  try{console.log("[CineVibe] "+type+" "+tmdbId+(type==="tv"?" S"+season+"E"+episode:"")+" via resolver");}catch(_){}

  return fetchJson(u).then(function(j){
    var rows=Array.isArray(j&&j.streams)?j.streams:[];
    var seen={},out=[];
    rows.forEach(function(x){
      x=x||{};
      var url=clean(x.url);
      if(!/^https?:\/\//i.test(url)||seen[url])return;
      seen[url]=1;
      var server=clean(x.server)||"Server 1";
      var lang=clean(x.language);
      var name="CineVibe · "+server;
      if(lang&&lang!=="ENGLISH")name+=" · "+lang;
      var h={};
      if(x.headers&&typeof x.headers==="object"){
        Object.keys(x.headers).forEach(function(k){if(clean(x.headers[k]))h[k]=String(x.headers[k]);});
      }
      if(!h["User-Agent"])h["User-Agent"]=UA;
      out.push({
        name:name,
        title:name,
        url:url,
        quality:"Auto",
        type:mediaType(url,x.type),
        provider:"cinevibe-server1",
        headers:h,
        subtitles:[]
      });
    });
    try{console.log("[CineVibe] resolver streams="+out.length+" wasm="+clean(j&&j.wasmHash));}catch(_){}
    return out;
  }).catch(function(e){
    try{console.log("[CineVibe] resolver FAIL · "+(e&&e.message?e.message:e));}catch(_){}
    return[];
  });
}
function onSettings(){
  return[
    {type:"header",label:"CineVibe Local · Server 1"},
    {type:"info",label:"当前真实链路：CineVibe → vidsrc.wtf API 1 → Viduki V1。解析器只解出媒体 URL，视频流量不经过解析服务器。"},
    {
      type:"text",
      key:"resolverUrl",
      label:"Resolver URL（通常无需修改）",
      description:"默认使用 CineVibe Local 的 Viduki 解析器；仅调试或自建解析器时修改。",
      defaultValue:DEFAULT_RESOLVER,
      isPassword:false
    }
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

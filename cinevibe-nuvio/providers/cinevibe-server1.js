// CineVibe Local for Nuvio
// v0.2.4
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
function transferable(url,server){
  url=clean(url);server=clean(server).toLowerCase();
  // Confirmed non-portable from real Nuvio testing:
  // Leon: resolver-egress-IP-bound jerso token.
  // Claire: embed-session scoped /e/.../master.m3u8.
  // Rebecca: reamefly signed session works at resolver but not on phone.
  if(server==="leon"||server==="claire"||server==="rebecca")return false;
  if(/jerso441ceg\.com/i.test(url))return false;
  if(/reamefly\.cyou/i.test(url))return false;
  if(/:[0-9]{9,12}:(?:\d{1,3}\.){3}\d{1,3}:/i.test(url))return false;
  return true;
}
function routeRank(x){
  var u=clean(x&&x.url).toLowerCase(),s=clean(x&&x.server).toLowerCase();
  if(/reamefly\.cyou/.test(u)||s==="rebecca")return 1;
  if(/boomchick\.org/.test(u)&&s==="jill")return 2;
  if(/boomchick\.org/.test(u)&&s==="claire")return 3;
  if(/boomchick\.org/.test(u)&&s==="ada")return 4;
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
function fetchText(url,headers){
  var opt={headers:headers||{}};
  try{opt.skipSizeCheck=true;}catch(_){}
  return fetch(url,opt).then(function(r){
    return r.text().then(function(t){
      if(!r.ok)throw new Error("HLS HTTP "+r.status);
      return t;
    });
  });
}
function absUrl(base,rel){
  rel=clean(rel);
  if(!rel)return"";
  if(/^https?:\/\//i.test(rel))return rel;
  if(/^\/\//.test(rel)){
    var sm=clean(base).match(/^(https?):/i);
    return(sm?sm[1]:"https")+":"+rel;
  }
  try{
    if(typeof URL!=="undefined")return new URL(rel,base).toString();
  }catch(_){}
  var m=clean(base).match(/^(https?:\/\/[^\/]+)(\/.*)?$/i);
  if(!m)return rel;
  var origin=m[1],path=(m[2]||"/").replace(/[?#].*$/,"");
  if(rel.charAt(0)==="/")return origin+rel;
  path=path.replace(/\/[^\/]*$/,"/");
  var parts=(path+rel).split("/"),out=[];
  parts.forEach(function(x){
    if(!x||x===".")return;
    if(x===".."){if(out.length)out.pop();return;}
    out.push(x);
  });
  return origin+"/"+out.join("/");
}
function attrValue(line,key){
  var re=new RegExp("(?:^|,)"+key+"=([^,]+)","i"),m=String(line||"").match(re);
  return m?clean(m[1]).replace(/^["']|["']$/g,""):"";
}
function qualityFromVariant(info,url){
  var r=attrValue(info,"RESOLUTION"),m=r.match(/\d+x(\d+)/i);
  if(m)return parseInt(m[1],10)+"p";
  var n=attrValue(info,"NAME")||attrValue(info,"QUALITY");
  m=clean(n).match(/(2160|1440|1080|720|576|540|480|360|240)/i);
  if(m)return m[1]+"p";
  m=clean(url).match(/(?:^|[^0-9])(2160|1440|1080|720|576|540|480|360|240)(?:p|[^0-9]|$)/i);
  if(m)return m[1]+"p";
  return"Auto";
}
function qualityScore(q){
  if(q==="4K")return2160;
  var m=String(q||"").match(/(\d+)/);
  return m?parseInt(m[1],10):0;
}
function parseMaster(text,base){
  text=String(text||"");
  if(text.indexOf("#EXTM3U")<0)return[];
  var lines=text.split(/\r?\n/),out=[],pending="",i;
  for(i=0;i<lines.length;i++){
    var line=clean(lines[i]);
    if(!line)continue;
    if(/^#EXT-X-STREAM-INF:/i.test(line)){pending=line.substring(line.indexOf(":")+1);continue;}
    if(pending&&line.charAt(0)!=="#"){
      var u=absUrl(base,line);
      if(u)out.push({url:u,quality:qualityFromVariant(pending,u),info:pending});
      pending="";
    }
  }
  var seen={},ded=[];
  out.forEach(function(x){
    var k=x.url+"|"+x.quality;
    if(!seen[k]){seen[k]=1;ded.push(x);}
  });
  ded.sort(function(a,b){return qualityScore(b.quality)-qualityScore(a.quality);});
  return ded;
}
function expandHls(row){
  if(!row||row.type!=="hls"||!/\.m3u8(?:$|[?#])/i.test(clean(row.url)))return Promise.resolve([row]);
  return fetchText(row.url,row.headers||{}).then(function(t){
    var vars=parseMaster(t,row.url);
    if(!vars.length)return[row];
    return vars.map(function(v){
      var q=v.quality||"Auto";
      var name=row.name+(q&&q!=="Auto"?" · "+q:"");
      return{
        name:name,
        title:name,
        url:v.url,
        quality:q,
        type:"hls",
        provider:row.provider,
        headers:row.headers||{},
        subtitles:row.subtitles||[]
      };
    });
  }).catch(function(e){
    try{console.log("[CineVibe] HLS expand "+row.name+" · "+(e&&e.message?e.message:e));}catch(_){}
    return[row];
  });
}
function expandAll(rows){
  return Promise.all((rows||[]).map(function(r){return expandHls(r);}))
    .then(function(groups){
      var all=[],seen={};
      groups.forEach(function(g){all=all.concat(g||[]);});
      all.forEach(function(r){
        var k=r.name+"|"+r.url;
        if(seen[k])r.__drop=true;else seen[k]=1;
      });
      all=all.filter(function(r){return!r.__drop;});
      all.sort(function(a,b){
        var sa=clean(a.name).replace(/ · (?:2160|1440|1080|720|576|540|480|360|240)p$/,"");
        var sb=clean(b.name).replace(/ · (?:2160|1440|1080|720|576|540|480|360|240)p$/,"");
        if(sa!==sb)return sa<sb?-1:1;
        return qualityScore(b.quality)-qualityScore(a.quality);
      });
      return all;
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
        type:mt,
        provider:"cinevibe-server1",
        headers:h,
        subtitles:[]
      });
    });
    try{console.log("[CineVibe] portable streams="+out.length+" / raw="+rows.length+" wasm="+clean(j&&j.wasmHash));}catch(_){}
    return expandAll(out).then(function(expanded){
      try{console.log("[CineVibe] expanded rows="+expanded.length);}catch(_){}
      return expanded;
    });
  }).catch(function(e){
    try{console.log("[CineVibe] resolver FAIL · "+(e&&e.message?e.message:e));}catch(_){}
    return[];
  });
}
function onSettings(){
  return[
    {type:"header",label:"CineVibe Local · Server 1"},
    {type:"info",label:"当前真实链路：CineVibe → vidsrc.wtf API 1 → Viduki V1。已过滤不可移交线路；Jill / Ethan / Wesker 等可用 HLS 会在手机端读取 master playlist，并尽量展开真实 1080p / 720p / 480p 清晰度。"},
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

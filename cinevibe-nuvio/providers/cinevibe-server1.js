// CineVibe Local for Nuvio
// v0.2.6
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
  if(q==="4K")return 2160;
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
function firstMediaSegment(text,base){
  var lines=String(text||"").split(/\r?\n/),i;
  for(i=0;i<lines.length;i++){
    var s=clean(lines[i]);
    if(s&&s.charAt(0)!=="#")return absUrl(base,s);
  }
  return"";
}
function rbspFromNal(nal){
  var out=[],zeros=0,i,b;
  for(i=1;i<nal.length;i++){
    b=nal[i];
    if(zeros>=2&&b===3){zeros=0;continue;}
    out.push(b);
    if(b===0)zeros++;else zeros=0;
  }
  return new Uint8Array(out);
}
function bitReader(buf){
  var bit=0;
  return{
    u:function(n){
      var v=0,i;
      for(i=0;i<n;i++){v=(v<<1)|((buf[bit>>3]>>(7-(bit&7)))&1);bit++;}
      return v;
    },
    ue:function(){
      var z=0,v=0,i;
      while(bit<buf.length*8&&((buf[bit>>3]>>(7-(bit&7)))&1)===0){z++;bit++;}
      bit++;
      for(i=0;i<z;i++){v=(v<<1)|((buf[bit>>3]>>(7-(bit&7)))&1);bit++;}
      return Math.pow(2,z)-1+v;
    },
    se:function(){
      var v=this.ue();
      return(v&1)?((v+1)>>1):-(v>>1);
    }
  };
}
function skipScaling(br,n){
  var last=8,next=8,j,d;
  for(j=0;j<n;j++){
    if(next!==0){d=br.se();next=(last+d+256)%256;}
    last=next===0?last:next;
  }
}
function parseH264Sps(nal){
  try{
    var b=rbspFromNal(nal),br=bitReader(b),profile=br.u(8);
    br.u(8);br.u(8);br.ue();
    var chroma=1,count,i;
    if([100,110,122,244,44,83,86,118,128,138,139,134,135].indexOf(profile)>=0){
      chroma=br.ue();
      if(chroma===3)br.u(1);
      br.ue();br.ue();br.u(1);
      if(br.u(1)){
        count=chroma!==3?8:12;
        for(i=0;i<count;i++)if(br.u(1))skipScaling(br,i<6?16:64);
      }
    }
    br.ue();
    var poc=br.ue(),n;
    if(poc===0)br.ue();
    else if(poc===1){
      br.u(1);br.se();br.se();n=br.ue();for(i=0;i<n;i++)br.se();
    }
    br.ue();br.u(1);
    var w=br.ue(),h=br.ue(),frame=br.u(1);
    if(!frame)br.u(1);
    br.u(1);
    var cropL=0,cropR=0,cropT=0,cropB=0;
    if(br.u(1)){cropL=br.ue();cropR=br.ue();cropT=br.ue();cropB=br.ue();}
    var cropX=1,cropY=2-frame;
    if(chroma===1){cropX=2;cropY=2*(2-frame);}
    else if(chroma===2){cropX=2;cropY=1*(2-frame);}
    else if(chroma===3){cropX=1;cropY=1*(2-frame);}
    return{
      width:(w+1)*16-(cropL+cropR)*cropX,
      height:(2-frame)*(h+1)*16-(cropT+cropB)*cropY
    };
  }catch(_){return null;}
}
function findH264Sps(buf){
  var i,start,end,j,p;
  for(i=0;i+5<buf.length;i++){
    start=-1;
    if(buf[i]===0&&buf[i+1]===0&&buf[i+2]===1)start=i+3;
    else if(buf[i]===0&&buf[i+1]===0&&buf[i+2]===0&&buf[i+3]===1)start=i+4;
    if(start<0)continue;
    if((buf[start]&31)!==7)continue;
    end=buf.length;
    for(j=start+1;j+4<buf.length;j++){
      if(buf[j]===0&&buf[j+1]===0&&(buf[j+2]===1||(buf[j+2]===0&&buf[j+3]===1))){end=j;break;}
    }
    p=parseH264Sps(buf.slice(start,end));
    if(p&&p.width&&p.height)return p;
  }
  return null;
}
function fetchBytes(url,headers){
  var opt={headers:{}},k;
  headers=headers||{};
  for(k in headers)if(Object.prototype.hasOwnProperty.call(headers,k))opt.headers[k]=headers[k];
  opt.headers.Range="bytes=0-262143";
  try{opt.skipSizeCheck=true;}catch(_){}
  return fetch(url,opt).then(function(r){
    if(!r.ok&&r.status!==206)throw new Error("segment HTTP "+r.status);
    return r.arrayBuffer();
  }).then(function(buf){return new Uint8Array(buf);});
}
function probeQualityFromSegment(playlist,row){
  var seg=firstMediaSegment(playlist,row.url);
  if(!seg)return Promise.resolve("");
  return fetchBytes(seg,row.headers||{}).then(function(bytes){
    var sps=findH264Sps(bytes);
    if(!sps||!sps.height)return"";
    return String(sps.height)+"p";
  }).catch(function(e){
    try{console.log("[CineVibe] SPS probe "+row.name+" · "+(e&&e.message?e.message:e));}catch(_){}
    return"";
  });
}
function rowWithQuality(row,q){
  q=clean(q)||"Auto";
  var name=row.name;
  if(q!=="Auto")name+=" · "+q;
  return{
    name:name,
    title:name,
    url:row.url,
    quality:q,
    type:row.type,
    provider:row.provider,
    headers:row.headers||{},
    subtitles:row.subtitles||[]
  };
}
function expandHls(row){
  if(!row||row.type!=="hls"||!/\.m3u8(?:$|[?#])/i.test(clean(row.url)))return Promise.resolve([row]);
  return fetchText(row.url,row.headers||{}).then(function(t){
    var vars=parseMaster(t,row.url);
    if(vars.length){
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
    }
    var inferred=qualityFromVariant("",row.url);
    if(inferred&&inferred!=="Auto")return[rowWithQuality(row,inferred)];
    return probeQualityFromSegment(t,row).then(function(q){
      return[rowWithQuality(row,q||"Auto")];
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
    {type:"info",label:"当前真实链路：CineVibe → vidsrc.wtf API 1 → Viduki V1。若 HLS 没有 master 多码率信息，会读取首个 TS 分片的 H.264 SPS，直接从码流解析真实宽高并显示 1080p / 720p 等。"},
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

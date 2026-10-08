// VidPlay Local experimental provider for Nuvio.
// Direct client-side requests; no Cloudflare workaround, no fabricated streams.
var BASE="https://vidplay.top";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function settings(){try{return typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS||{};}catch(e){return {};}}
function log(s){try{console.log("[VidPlay Lab] "+s);}catch(e){}}
function extType(u){
  var p=clean(u).split(/[?#]/)[0].toLowerCase();
  if(/\.m3u8$/.test(p))return"hls";
  if(/\.mp4$/.test(p))return"mp4";
  if(/\.mpd$/.test(p))return"dash";
  return"";
}
function safeUrl(u){
  u=clean(u);
  if(!/^https?:\/\/[^\s"'<>]+$/i.test(u)||u.length>4096)return false;
  var m=u.match(/^https?:\/\/([^/?#]+)/i),authority=m&&m[1];
  if(!authority||authority.indexOf("@")>=0||authority.charAt(0)==="[")return false;
  var host=authority.split(":")[0].toLowerCase();
  if(!host||host.indexOf(".")<0||/^(?:localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host))return false;
  return true;
}
function abs(u,base){
  u=clean(u).replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\\\//g,"/");
  if(u.indexOf("//")===0)u="https:"+u;
  if(u.charAt(0)==="/"&&base){var m=base.match(/^(https?:\/\/[^/]+)/);if(m)u=m[1]+u;}
  return safeUrl(u)?u:"";
}
function urlsFromText(html){
  // Only actual media fields and HTML media tags qualify. Never scan arbitrary
  // page strings: ad code, documentation and unrelated assets may mention MP4/HLS.
  var s=clean(html).replace(/\\\//g,"/").replace(/&amp;/g,"&");
  var out=[],m;
  var re=/(?:["']?(?:file|src|source|url|videoUrl|hls)["']?\s*[:=]\s*["']|<source\b[^>]*\bsrc\s*=\s*["'])(https?:\/\/[^"'<>\s]+)["']/gi;
  while((m=re.exec(s))!==null&&out.length<32){
    var u=abs(m[1].replace(/[,;]+$/,""),"");
    if(extType(u)&&out.indexOf(u)<0)out.push(u);
  }
  // An endpoint may respond with a bare direct media URL.
  if(!out.length&&/^https?:\/\/\S+\.(?:m3u8|mp4|mpd)(?:[?#]\S*)?$/i.test(s)){
    var direct=abs(s,"");if(extType(direct))out.push(direct);
  }
  return out;
}
function framesFromText(html,base){
  var s=clean(html),out=[],re=/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/ig,m;
  while((m=re.exec(s))!==null&&out.length<8){var u=abs(m[2],base);if(u&&out.indexOf(u)<0)out.push(u);}
  return out;
}
function fetchText(url,headers){
  if(!safeUrl(url))return Promise.reject(new Error("invalid URL"));
  var options={method:"GET",headers:headers||{}};
  try{options.skipSizeCheck=true;}catch(e){}
  return fetch(url,options).then(function(r){
    if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"unknown"));
    return r.text();
  });
}
function requestHeaders(referer,ajax){
  var h={"User-Agent":UA,"Accept":ajax?"text/html, */*; q=0.8":"text/html,application/xhtml+xml,*/*;q=0.8","Referer":referer||BASE+"/"};
  if(ajax)h["X-Requested-With"]="XMLHttpRequest";
  return h;
}
function streamRows(html,ref,sourceName,depth){
  // Follow only public iframe URLs. Never turn an HTML embed into a fake video stream.
  var direct=urlsFromText(html);
  if(direct.length||depth<=0)return Promise.resolve(direct.map(function(u){return{url:u,ref:ref};}));
  var frames=framesFromText(html,ref);
  if(!frames.length)return Promise.resolve([]);
  var first=frames.slice(0,3);
  return Promise.all(first.map(function(u){
    return fetchText(u,requestHeaders(ref,false)).then(function(t){return streamRows(t,u,sourceName,depth-1);})
      .catch(function(e){log(sourceName+" embed: "+(e&&e.message||e));return[];});
  })).then(function(a){return [].concat.apply([],a);});
}
function htmlDecode(s){
  return clean(s).replace(/&amp;/g,"&").replace(/&quot;/g,'"')
    .replace(/&#39;|&#x27;/gi,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/<[^>]+>/g," ");
}
function normTitle(s){
  return htmlDecode(s).toLowerCase().replace(/&/g,"and")
    .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function tmdbMeta(id,type){
  // Metadata-only requests require no API key and do not request streams.
  // The service returns a real IMDb ID for its corresponding TMDB title.
  var publicURL="https://data.vidsrc.sh/api.php?type="+(type==="tv"?"tv":"movie")+
    "&tmdb="+encodeURIComponent(id);
  var fromPublic=fetchText(publicURL,{"User-Agent":UA,"Accept":"application/json"})
    .then(function(t){
      var j=JSON.parse(t),d=j&&j.data||{};
      if(String(j&&j.status_code)!=="200"||!/^tt\d+$/.test(clean(d.imdb_id)))throw new Error("metadata unavailable");
      var title=clean(d.title),year="";
      var match=title.match(/\s+((?:19|20)\d{2})$/);
      if(match){year=match[1];title=title.slice(0,-match[0].length);}
      return {title:title,original:title,year:year,imdb:clean(d.imdb_id)};
    });
  return fromPublic.catch(function(e){
    log("V1 public metadata: "+(e&&e.message||e));
    var key=clean(settings().tmdbApiKey);
    if(!key){try{key=clean(globalThis.TMDB_API_KEY);}catch(err){}}
    if(!key)return null;
    var u="https://api.themoviedb.org/3/"+(type==="tv"?"tv":"movie")+
      "/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(key)+
      "&append_to_response=external_ids";
    return fetchText(u,{"Accept":"application/json"}).then(function(t){
      var j=JSON.parse(t);
      var released=clean(j.release_date||j.first_air_date);
      var imdb=clean((j.external_ids&&j.external_ids.imdb_id)||j.imdb_id);
      return {title:clean(j.title||j.name),original:clean(j.original_title||j.original_name),
        year:/^\d{4}/.test(released)?released.slice(0,4):"",
        imdb:/^tt\d+$/.test(imdb)?imdb:""};
    }).catch(function(err){log("TMDB fallback metadata: "+(err&&err.message||err));return null;});
  });
}
function searchPage(html,meta,type,season,episode){
  if(!meta||!meta.title)return"";
  var re=/<figure\b[^>]*>[\s\S]*?<\/figure>/gi,m,candidates=[];
  var wanted=[normTitle(meta.title),normTitle(meta.original)].filter(Boolean);
  while((m=re.exec(clean(html)))!==null){
    var block=m[0];
    var link=block.match(/<a\b[^>]*\bhref=["']([^"']+)["']/i);
    var title=block.match(/<div\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    var year=block.match(/<div\b[^>]*class=["'][^"']*\byear\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if(!link||!title)continue;
    var href=htmlDecode(link[1]).trim(),foundTitle=normTitle(title[1]);
    if(type==="movie"&&!/^\/movie\/\d+-watch-[a-z0-9-]+-online\/?$/i.test(href))continue;
    if(type==="tv"&&!/^\/watchseries\/[a-z0-9-]+-online-free\/?$/i.test(href))continue;
    if(wanted.indexOf(foundTitle)<0)continue;
    if(meta.year&&(!year||htmlDecode(year[1]).trim()!==meta.year))continue;
    if(candidates.indexOf(href)<0)candidates.push(href);
  }
  // Ambiguity is never resolved by taking the first matching result.
  if(candidates.length!==1)return"";
  var url=BASE+candidates[0];
  if(type==="tv")url=url.replace(/\/$/,"")+"/season/"+season+"/episode/"+episode;
  return url;
}
function discoverReferer(meta,type,season,episode){
  if(!meta||!meta.title)return Promise.resolve("");
  var q=meta.title;
  var url=BASE+"/index.php?menu=search&query="+encodeURIComponent(q);
  return fetchText(url,requestHeaders(BASE+"/",false)).then(function(html){
    var ref=searchPage(html,meta,type,season,episode);
    if(ref)log("matched "+type+" page "+ref.replace(BASE,""));
    else log("no unambiguous site match for "+q);
    return ref;
  }).catch(function(e){log("site search unavailable: "+(e&&e.message||e));return"";});
}
// Some Nuvio QuickJS versions expose Uint8Array but lack .slice().
function v1BytesSlice(source,start,end){
  var count=Math.max(0,Math.min(source.length,end==null?source.length:end)-start);
  var out=new Uint8Array(count);
  for(var i=0;i<count;i++)out[i]=source[start+i]&255;
  return out;
}
function s2Rd32(b,o){return ((b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0);}
function s2Rotl(x,n){return ((x<<n)|(x>>>(32-n)))>>>0;}
function s2ChaChaBlock(k,c,n){
  var st=[1634760805,857760878,2036477234,1797285236,k[0],k[1],k[2],k[3],k[4],k[5],k[6],k[7],c>>>0,n[0]>>>0,n[1]>>>0,n[2]>>>0];
  var x=st.slice();
  function q(a,b,c0,d){
    x[a]=(x[a]+x[b])>>>0;x[d]=s2Rotl(x[d]^x[a],16);
    x[c0]=(x[c0]+x[d])>>>0;x[b]=s2Rotl(x[b]^x[c0],12);
    x[a]=(x[a]+x[b])>>>0;x[d]=s2Rotl(x[d]^x[a],8);
    x[c0]=(x[c0]+x[d])>>>0;x[b]=s2Rotl(x[b]^x[c0],7);
  }
  for(var i=0;i<10;i++){
    q(0,4,8,12);q(1,5,9,13);q(2,6,10,14);q(3,7,11,15);
    q(0,5,10,15);q(1,6,11,12);q(2,7,8,13);q(3,4,9,14);
  }
  var out=new Uint8Array(64);
  for(var j=0;j<16;j++){
    var w=(x[j]+st[j])>>>0;
    out[j*4]=w&255;out[j*4+1]=(w>>>8)&255;out[j*4+2]=(w>>>16)&255;out[j*4+3]=(w>>>24)&255;
  }
  return out;
}
function s2Leb(b,p){
  var r=0,shift=0,v=0;
  do{
    if(p>=b.length)throw new Error("WASM leb overflow");
    v=b[p++];r|=(v&127)<<shift;
    if((v&128)===0)break;
    shift+=7;
  }while(shift<35);
  return[r>>>0,p];
}
function s2WasmSegments(b){
  if(!b||b.length<8||b[0]!==0||b[1]!==97||b[2]!==115||b[3]!==109)throw new Error("bad WASM");
  var out=[],p=8;
  while(p<b.length){
    var id=b[p++],r=s2Leb(b,p),len=r[0];p=r[1];
    var end=p+len;if(end>b.length)throw new Error("WASM section overflow");
    if(id===11){
      r=s2Leb(b,p);var cnt=r[0];p=r[1];
      for(var i=0;i<cnt;i++){
        r=s2Leb(b,p);var flags=r[0];p=r[1];var off=-1;
        if(flags===0||flags===1){
          if(flags===1){r=s2Leb(b,p);p=r[1];}
          if(b[p]===0x41){p++;r=s2Leb(b,p);off=r[0];p=r[1];}
          if(b[p]===0x0b)p++;
        }else if(flags===2){
          r=s2Leb(b,p);p=r[1];
          if(b[p]===0x41){p++;r=s2Leb(b,p);off=r[0];p=r[1];}
          if(b[p]===0x0b)p++;
        }
        r=s2Leb(b,p);var dl=r[0];p=r[1];
        var data=v1BytesSlice(b,p,p+dl);p+=dl;
        if(off>=0)out.push({off:off,data:data});
      }
    }
    p=end;
  }
  return out;
}
function s2RecoverKey(wasm,enc){
  var segs=s2WasmSegments(wasm),base=null;
  for(var i=0;i<segs.length;i++){
    if(segs[i].off===0&&segs[i].data.length>=32){base=segs[i];break;}
  }
  if(!base)throw new Error("WASM base key segment missing");
  var nonce=[s2Rd32(enc,0),s2Rd32(enc,4),s2Rd32(enc,8)];
  for(var c=0;c<segs.length;c++){
    var d=segs[c];
    if(d.off<256||d.data.length<32)continue;
    var kw=[];
    for(var j=0;j<8;j++)kw.push((s2Rd32(base.data,j*4)^s2Rd32(d.data,j*4))>>>0);
    var ks=s2ChaChaBlock(kw,0,nonce);
    if(((enc[12]^ks[0])&255)===104&&((enc[13]^ks[1])&255)===116&&((enc[14]^ks[2])&255)===116&&((enc[15]^ks[3])&255)===112)return kw;
  }
  throw new Error("ChaCha key recovery failed");
}
function s2Base64Bytes(s){
  s=clean(s).replace(/\s+/g,"");
  var abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out=[],buf=0,bits=0;
  for(var i=0;i<s.length;i++){
    var ch=s.charAt(i);if(ch==="=")break;
    var v=abc.indexOf(ch);if(v<0)continue;
    buf=(buf<<6)|v;bits+=6;
    if(bits>=8){bits-=8;out.push((buf>>bits)&255);}
  }
  return new Uint8Array(out);
}
function s2Utf8(b){
  var str="",i;
  for(i=0;i<b.length;i++)str+=String.fromCharCode(b[i]);
  try{return decodeURIComponent(escape(str));}catch(_){return str;}
}
function s2DecryptUrls(encB64,wasm){
  var enc=s2Base64Bytes(encB64);
  if(enc.length<16)throw new Error("encrypted stream_urls too short");
  var key=s2RecoverKey(wasm,enc);
  var nonce=[s2Rd32(enc,0),s2Rd32(enc,4),s2Rd32(enc,8)];
  var ct=v1BytesSlice(enc,12,enc.length),out=new Uint8Array(ct.length);
  for(var b=0;b<Math.ceil(ct.length/64);b++){
    var ks=s2ChaChaBlock(key,b,nonce);
    for(var j=0;j<64&&b*64+j<ct.length;j++)out[b*64+j]=ct[b*64+j]^ks[j];
  }
  return s2Utf8(out).split(/\r?\n/).map(clean).filter(function(x){return /^https?:\/\//i.test(x);});
}

/* VidPlay V1 path confirmed using Opera: VidPlay -> ythd.org -> player host.
 * No browser challenges bypassed; only authorized public response data used.
 * The stream API may require a server-signed single-use token.
 * Never emit an iframe or a fake stream; validate all HLS playlists. */
var YTHD="https://ythd.org";
function asHttpUrl(value,base){
  value=clean(value).replace(/&amp;/gi,"&");
  if(!value)return"";
  if(value.indexOf("//")===0)value="https:"+value;
  try{
    if(typeof URL!=="undefined")value=new URL(value,base).href;
  }catch(e){}
  if(value.charAt(0)==="/"&&base){
    var origin=base.match(/^(https?:\/\/[^/]+)/);
    if(origin)value=origin[1]+value;
  }
  return /^https:\/\//.test(value)&&safeUrl(value)?value:"";
}
function parseInlineConfig(html,label){
  // Config objects in the actual player are JSON written on a single line.
  var re=new RegExp("window\\."+label+"\\s*=\\s*(\\{[^\\r\\n]*?\\})\\s*;","i");
  var m=clean(html).match(re);
  if(!m)return null;
  try{return JSON.parse(m[1]);}catch(e){return null;}
}
function fetchJSON(url,headers){
  return fetchText(url,headers).then(function(t){return JSON.parse(t);});
}
function playerAPIURL(url,token,ref){
  var u=asHttpUrl(url,ref);
  if(!u||!/^https:\/\/data\.vidsrc(?:me\.ru|\.sh)\//i.test(u))return"";
  if(!/(?:[?&])stream_urls(?:[=&]|$)/.test(u))
    u+=(u.indexOf("?")<0?"?":"&")+"stream_urls";
  // A missing token is not treated as authorization; never invent one.
  if(!token)return"";
  u+=(u.indexOf("?")<0?"?":"&")+"api_token="+encodeURIComponent(token);
  return safeUrl(u)?u:"";
}
function safeMediaURLs(data,referer){
  if(!data||!data.data||String(data.status_code)!=="200")return Promise.resolve([]);
  var su=data.data.stream_urls;
  if(Array.isArray(su))return Promise.resolve(su.map(function(u){return asHttpUrl(u,referer);}).filter(function(u){return !!extType(u);}));
  if(typeof su!=="string"||!su||!data.vs||!data.vs.wasm_url)return Promise.resolve([]);
  var wasm=asHttpUrl(data.vs.wasm_url,referer);
  if(!wasm)return Promise.resolve([]);
  return fetch(wasm,{method:"GET",headers:{"User-Agent":UA,"Referer":referer,"Accept":"application/wasm"}})
    .then(function(r){
      if(!r||!r.ok)throw new Error("WASM HTTP "+(r&&r.status));
      if(typeof r.arrayBuffer!=="function")throw new Error("WASM: Nuvio fetch.arrayBuffer unavailable");
      return r.arrayBuffer();
    }).then(function(buffer){
      if(!buffer||typeof Uint8Array!=="function")throw new Error("WASM: Uint8Array unsupported");
      var bytes;
      try{bytes=new Uint8Array(buffer);}catch(e){throw new Error("WASM bytes: "+(e&&e.message||e));}
      if(!bytes||!bytes.length)throw new Error("WASM bytes: empty");
      try{
        var urls=s2DecryptUrls(su,bytes);
        return urls.map(function(u){return asHttpUrl(u,referer);}).filter(function(u){return !!extType(u);});
      }catch(e){throw new Error("WASM decrypt: "+(e&&e.message||e));}
    }).catch(function(e){
      var msg=clean(e&&e.message||e);
      if(msg.indexOf("WASM")===0)throw e;
      throw new Error("WASM transport: "+msg);
    });
}
function qualifiedMedia(u,ref){
  // Stream server may publicly issue a per-host media token. This is separate
  // from the protected player API token and never substitutes for authorization.
  var m=u.match(/^(https:\/\/[^/]+)/);
  if(!m)return Promise.resolve(u);
  return fetchText(m[1]+"/generate.php",{"User-Agent":UA,"Accept":"*/*","Referer":ref})
    .then(function(t){t=clean(t);try{var j=JSON.parse(t);t=clean(j.token||j.result||"");}catch(e){}
      if(!/^[a-zA-Z0-9._~-]{6,512}$/.test(t))return u;
      return u+(u.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(t);
    }).catch(function(){return u;});
}
function variantsFromMaster(t,u,ref){
  if(t.slice(0,7)!=="#EXTM3U")return[];
  var lines=t.split(/\r?\n/),a=[],seen={};
  for(var i=0;i<lines.length-1;i++){
    if(lines[i].indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var next=clean(lines[i+1]);
    if(!next||next.charAt(0)==="#")continue;
    var candidate=asHttpUrl(next,u);
    if(!candidate||!extType(candidate)||seen[candidate])continue;
    var qm=lines[i].match(/RESOLUTION=\d+x(\d+)/i);
    var quality=qm?qm[1]+"p":"Auto";
    a.push(makeRow(candidate,quality,ref));seen[candidate]=true;
  }
  if(!a.length)a.push(makeRow(u,"Auto",ref));
  return a.filter(Boolean);
}
function makeRow(url,quality,referer){
  var type=extType(url);if(!type)return null;
  var name="VidPlay · V1"+(quality&&quality!=="Auto"?" · "+quality:"");
  return {name:name,title:name,url:url,quality:quality||"Auto",type:type,provider:"vidplay-direct-lab",
    headers:{"User-Agent":UA,"Referer":referer},subtitles:[]};
}
function verifyMedia(u,ref){
  return qualifiedMedia(u,ref).then(function(candidate){
    var typ=extType(candidate);
    var h={"User-Agent":UA,"Referer":ref,"Accept":"application/vnd.apple.mpegurl,application/x-mpegURL,*/*"};
    if(typ==="hls"||typ==="dash"){
      return fetchText(candidate,h).then(function(t){
        if(typ==="hls")return variantsFromMaster(t,candidate,ref);
        if(/<MPD\b/i.test(t))return [makeRow(candidate,"Auto",ref)];
        throw new Error("non-MPD document");
      });
    }
    if(typ==="mp4"){
      h.Range="bytes=0-31";
      return fetch(candidate,{method:"GET",headers:h}).then(function(r){
        if(!r||!r.ok)throw new Error("MP4 HTTP "+(r&&r.status));
        var ct=clean(r.headers&&r.headers.get&&r.headers.get("content-type")).toLowerCase();
        if(!/video\/mp4|application\/octet-stream/.test(ct))throw new Error("not MP4 media");
        // Never read or buffer the entire video in the plugin.
        return [makeRow(candidate,"Auto",ref)];
      });
    }
    return [];
  }).catch(function(e){log("V1 media rejected: "+(e&&e.message||e));return[];});
}
function resolveYthd(imdb,siteReferer){
  if(!/^tt\d+$/.test(imdb))return Promise.resolve([]);
  var embed=YTHD+"/embed/"+encodeURIComponent(imdb);
  var stage="YTHD 页面";
  return fetchText(embed,requestHeaders(siteReferer||BASE+"/",false))
    .then(function(){
      stage="YTHD 播放源 API";
      return fetchJSON(YTHD+"/vs_src.php?type=movie&id="+encodeURIComponent(imdb),
        {"User-Agent":UA,"Referer":embed,"Accept":"application/json","X-Requested-With":"XMLHttpRequest"});
    })
    .then(function(j){
      stage="外部播放器入口";
      var landing=asHttpUrl(j&&j.src,embed);
      if(!landing)throw new Error("YTHD no public player URL");
      return fetchText(landing,requestHeaders(embed,false)).then(function(html){
        stage="播放器入口配置";
        var cfg=parseInlineConfig(html,"CFG");
        if(!cfg||!cfg.playerUrl)throw new Error("no public V1 player config");
        var playerUrl=asHttpUrl(cfg.playerUrl,landing);
        if(!playerUrl)throw new Error("invalid V1 player URL");
        stage="内层播放器页面";
        return fetchText(playerUrl,requestHeaders(landing,false))
          .then(function(innerHtml){return {html:innerHtml,ref:playerUrl};});
      });
    })
    .then(function(inner){
      stage="签名媒体接口配置";
      var c=parseInlineConfig(inner.html,"CONFIG");
      if(!c)throw new Error("V1 player config unavailable");
      if(c.turnstile)log("V1 browser verification advertised; using only current server-issued signed API token");
      if(c.mediaType&&c.mediaType!=="movie")throw new Error("V1 wrong media type");
      if(c.imdb&&c.imdb!==imdb)throw new Error("V1 wrong IMDb ID");
      var api=playerAPIURL(c.api,clean(c.apiToken),inner.ref);
      if(!api)throw new Error("V1 stream requires valid player-issued API token");
      stage="签名媒体 API";
      return fetchJSON(api,{"User-Agent":UA,"Referer":inner.ref,"Accept":"application/json"})
        .then(function(j){
          if(String(j&&j.status_code)!=="200")throw new Error("V1 stream API "+(j&&j.status_code));
          stage="WASM 解密媒体地址";
          return safeMediaURLs(j,inner.ref);
        }).then(function(urls){
          stage="CDN HLS 解析";
          if(!urls.length)throw new Error("V1 API returned no supported media");
          // CDN /generate.php is rate-limited (429) when called in parallel.
          // A successfully verified master playlist supplies quality variants;
          // avoid generating multiple tokens for other hosts unnecessarily.
          function resolveNext(index){
            if(index>=Math.min(urls.length,3))return Promise.resolve([]);
            return verifyMedia(urls[index],inner.ref).then(function(rows){
              return rows&&rows.length?rows:resolveNext(index+1);
            });
          }
          return resolveNext(0);
        }).then(function(rows){
          var out=[],seen={};
          (rows||[]).forEach(function(r){
            if(r&&!seen[r.url]){seen[r.url]=true;out.push(r);}
          });
          return out;
        });
    }).catch(function(e){
      var message=clean(e&&e.message||e);
      if(message.indexOf("播放器阶段[")===0)throw e;
      throw new Error("播放器阶段["+stage+"]: "+message);
    });
}
function resolveAjaxV1(tmdb,type,season,episode,meta){
  var embed=type==="tv"?tmdb:(meta&&meta.imdb||"");
  if(!embed)return Promise.resolve([]);
  return discoverReferer(meta,type,season,episode).then(function(detailRef){
    var referer=detailRef||BASE+"/";
    var action=type==="tv"?"tv_vplay":"mov_vplay";
    var endpoint=BASE+"/ajax/"+action+".php?embed="+encodeURIComponent(embed);
    if(type==="tv")endpoint+="&season="+season+"&episode="+episode;
    return fetchText(endpoint,requestHeaders(referer,true)).then(function(html){
      if(/Just a moment|challenge-platform/i.test(html))throw new Error("VidPlay AJAX challenge");
      return streamRows(html,endpoint,"V1",3).then(function(entries){
        return Promise.all(entries.slice(0,3).map(function(e){return verifyMedia(e.url,e.ref);}))
          .then(function(groups){return [].concat.apply([],groups);});
      });
    });
  });
}

// Nuvio hides a provider when it returns zero result rows. The diagnostic
// row is explicitly NON-PLAYABLE and displays why V1 has no real stream.
// It is the same status-row mechanism used by our established YesMovies and
// NOVIPNOAD providers; it is not a fabricated video or iframe playback URL.
function statusRow(reason){
  var msg=clean(reason).replace(/\s+/g," ").slice(0,135)||"没有取得可播放的视频流";
  var name="VidPlay · V1 · 诊断（不可播放）："+msg;
  return {name:name,title:name,
    url:"data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQojRVhULVgtVkVSU0lPTjozCiNFWFQtWC1FTkRMSVNUCg==",
    quality:"Status",type:"hls",provider:"vidplay-direct-lab",headers:{},subtitles:[]};
}
function briefError(e){
  return clean(e&&e.message||e).replace(/https?:\/\/\S+/g,"[URL]").slice(0,68)||"未知错误";
}
function withinBudget(p,ms){
  if(typeof setTimeout!=="function")return p;
  var handle;
  var watchdog=new Promise(function(_,reject){
    handle=setTimeout(function(){reject(new Error("查询超过 "+Math.ceil(ms/1000)+" 秒"));},ms);
  });
  return Promise.race([p,watchdog]).then(function(v){
    if(typeof clearTimeout==="function")clearTimeout(handle);return v;
  },function(e){
    if(typeof clearTimeout==="function")clearTimeout(handle);throw e;
  });
}
function getStreams(id,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie",tmdb=clean(id);
  if(!/^\d+$/.test(tmdb))return Promise.resolve([statusRow("影片 ID 无效")]);
  season=parseInt(season,10)||0;episode=parseInt(episode,10)||0;
  if(type==="tv"&&(!season||!episode))return Promise.resolve([statusRow("缺少季或集编号")]);
  var reasons=[];
  var work=tmdbMeta(tmdb,type).then(function(meta){
    if(!meta)reasons.push("元数据服务不可用");
    var route=type==="movie"&&meta&&meta.imdb
      ?resolveYthd(meta.imdb,BASE+"/").catch(function(e){
        var issue=briefError(e);
        log("V1 YTHD: "+issue);reasons.push("播放器："+issue);return[];
      }):Promise.resolve([]);
    return route.then(function(rows){
      if(rows.length)return rows;
      return resolveAjaxV1(tmdb,type,season,episode,meta).catch(function(e){
        var issue=briefError(e);
        log("V1 AJAX: "+issue);reasons.push("站点备用接口："+issue);return[];
      });
    });
  }).then(function(rows){
    var all=[],seen={};
    (rows||[]).forEach(function(r){
      if(!r||!r.url||r.quality==="Status"||/^data:/i.test(r.url)||seen[r.url])return;
      seen[r.url]=1;all.push(r);
    });
    log("V1 "+type+" "+tmdb+" verified streams="+all.length);
    if(all.length)return all;
    return [statusRow(reasons.length?reasons.join("；"):"V1 当前未返回可播放直链")];
  }).catch(function(e){
    var issue=briefError(e);log("V1 runtime: "+issue);
    return[statusRow("查询异常："+issue)];
  });
  return withinBudget(work,15000).catch(function(e){
    var issue=briefError(e);log("V1 timeout: "+issue);
    return[statusRow(issue+"；站点访问可能被限制")];
  });
}
function onSettings(){
  return [
    {type:"header",label:"VidPlay · V1 only (experimental)"},
    {type:"info",label:"V1 retrieves a public TMDB-to-IMDb lookup, then resolves the ythd.org playback chain. Only verified HLS/MP4/DASH streams are playable. If V1 requires browser verification, a clearly labeled NON-PLAYABLE diagnostic/status row is shown to keep the provider visible. Requests have a 15s time budget. No V2/V3."},
    {type:"text",key:"tmdbApiKey",label:"TMDB key (optional fallback only)",defaultValue:"",isPassword:true}
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

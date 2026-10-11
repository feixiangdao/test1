// VidPlay (vidplay.top) local provider for Nuvio — server "V1".
//
// VidPlay's own pages/AJAX are behind a Cloudflare interactive challenge
// (HTTP 403 "Just a moment...") for any non-browser client, so this provider
// reproduces the same public server-"V1" chain that the site's own iframe
// uses, entirely from first-party public endpoints:
//
//   movie: data.vidsrc.sh metadata (public, keyless) -> ythd.org/embed/<IMDb>
//   tv   : ythd.org/embed/<TMDB>/<S>/<E>            (TMDB id used directly)
//          -> ythd.org/vs_src.php  -> public player landing -> nested player
//          -> server-signed single-use media API -> WASM/ChaCha20 decode of
//             the returned stream_urls -> CDN token -> real HLS master.
//
// No Cloudflare bypass, no CAPTCHA solving, no reused browser cookies, and no
// fabricated media: only URLs that subsequently pass the HLS master check are
// returned. If the upstream rotates its decoding key or token, the provider
// fails closed with a clearly labelled NON-PLAYABLE status row.
var BUILD="VP0.2.0";
var BASE="https://vidplay.top";
var YTHD="https://ythd.org";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";
var PROVIDER_ID="vidplay-direct-lab";
// Nuvio aborts a plugin run at 60s. The upstream chain legitimately needs
// ~6s of page hops plus an 8-15s cold CDN token generation, so a 15s budget
// (the previous value) reliably discarded results that had already succeeded.
var BUDGET_MS=50000;
function clean(v){return v==null?"":String(v).trim();}
function settings(){try{return typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS||{};}catch(e){return {};}}
function log(s){try{console.log("[VidPlay "+BUILD+"] "+s);}catch(e){}}
function delay(ms){return new Promise(function(res){try{setTimeout(res,ms);}catch(e){res();}});}
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
// Transient network faults (TLS resets, DNS hiccups, 5xx) are common on this
// chain; deterministic 4xx answers are never retried.
function isTransient(e){
  var m=clean(e&&e.message||e);
  if(/^HTTP /.test(m))return /^HTTP (?:5\d\d|0|undefined)/.test(m);
  return true;
}
function fetchWithRetry(url,options,tries){
  var max=tries||2,attempt=0;
  function once(){
    attempt++;
    return fetch(url,options).then(function(r){
      if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"unknown"));
      return r;
    }).catch(function(e){
      if(attempt<max&&isTransient(e))return delay(500+attempt*400).then(once);
      throw e;
    });
  }
  return once();
}
function fetchText(url,headers){
  if(!safeUrl(url))return Promise.reject(new Error("invalid URL"));
  var options={method:"GET",headers:headers||{}};
  try{options.skipSizeCheck=true;}catch(e){}
  return fetchWithRetry(url,options,2).then(function(r){return r.text();});
}
function fetchJSON(url,headers){
  return fetchText(url,headers).then(function(t){return JSON.parse(t);});
}
function requestHeaders(referer){
  return {"User-Agent":UA,"Accept":"text/html,application/xhtml+xml,*/*;q=0.8","Referer":referer||BASE+"/"};
}
function htmlDecode(s){
  return clean(s).replace(/&amp;/g,"&").replace(/&quot;/g,'"')
    .replace(/&#39;|&#x27;/gi,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/<[^>]+>/g," ");
}
function parseInlineConfig(html,label){
  // The real player writes its config as single-line JSON.
  var re=new RegExp("window\\."+label+"\\s*=\\s*(\\{[^\\r\\n]*?\\})\\s*;","i");
  var m=clean(html).match(re);
  if(!m)return null;
  try{return JSON.parse(m[1]);}catch(e){return null;}
}

/* ---- public TMDB -> IMDb metadata (keyless) ---------------------------- */
function tmdbMeta(id,type){
  var publicURL="https://data.vidsrc.sh/api.php?type="+(type==="tv"?"tv":"movie")+
    "&tmdb="+encodeURIComponent(id);
  return fetchText(publicURL,{"User-Agent":UA,"Accept":"application/json"})
    .then(function(t){
      var j=JSON.parse(t),d=j&&j.data||{};
      if(String(j&&j.status_code)!=="200"||!/^tt\d+$/.test(clean(d.imdb_id)))throw new Error("metadata unavailable");
      var title=clean(d.title),year="";
      var match=title.match(/\s+((?:19|20)\d{2})$/);
      if(match){year=match[1];title=title.slice(0,-match[0].length);}
      return {title:title,original:title,year:year,imdb:clean(d.imdb_id)};
    }).catch(function(e){
      log("public metadata: "+(e&&e.message||e));
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

/* ---- WASM / ChaCha20 stream_urls decoder ------------------------------- */
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
function validWasmBytes(bytes){
  if(!bytes||bytes.length<8||bytes.length>4*1024*1024||
     bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109)
    throw new Error("WASM bytes: invalid binary header");
  return bytes;
}
// Official Nuvio's native bridge exposes binary bytes as bodyBase64. Some
// installed builds omit Response.arrayBuffer(); use the bridge only for WASM
// binary (never response.text(), which corrupts bytes as UTF-8).
function v1RawBinaryBridge(url,headers){
  if(typeof __native_fetch!=="function")
    return Promise.reject(new Error("WASM: Nuvio native binary bridge unavailable"));
  return __native_fetch(url,"GET",JSON.stringify(headers),"none","",true).then(function(raw){
    var j;
    try{j=JSON.parse(raw);}catch(e){throw new Error("WASM: native bridge invalid response");}
    if(!j||!j.ok)throw new Error("WASM native HTTP "+(j&&j.status));
    var b64=j.bodyBase64;
    if(typeof b64!=="string"||!b64||b64.length>6*1024*1024)
      throw new Error("WASM: native bridge has no binary bodyBase64");
    return validWasmBytes(s2Base64Bytes(b64));
  });
}
function v1LoadWasm(url,referer){
  if(!/^https:\/\/data\.vidsrc(?:me\.ru|\.sh)\//i.test(url))
    return Promise.reject(new Error("WASM: unexpected download host"));
  var h={"User-Agent":UA,"Referer":referer,"Accept":"application/wasm"};
  return fetchWithRetry(url,{method:"GET",headers:h},2).then(function(r){
    if(typeof r.arrayBuffer==="function"){
      return r.arrayBuffer().then(function(buffer){
        if(!buffer||typeof Uint8Array!=="function")
          throw new Error("WASM: binary array view unavailable");
        return validWasmBytes(new Uint8Array(buffer));
      });
    }
    log("Nuvio has no fetch.arrayBuffer; retry WASM via native bodyBase64");
    return v1RawBinaryBridge(url,h);
  });
}
// Public WASM-derived ChaCha key, verified across repeated live requests.
// Used ONLY when a legitimate signed media API has already returned encrypted
// stream URLs but the installed Nuvio provides neither WASM arrayBuffer nor a
// binary native body. Upstream can rotate it; wrong-key plaintext is discarded
// and the provider then fails closed.
var V1_COMPAT_KEYS=[
  [0x5fb41bdd,0x43ba7ba6,0xb2220498,0x195798a5,0x0bcba452,0x57076086,0x673867d1,0x199e5b0d]
];
function v1DecryptWithKey(encrypted,key){
  var enc=s2Base64Bytes(encrypted);
  if(enc.length<16)throw new Error("V1 encrypted stream_urls too short");
  var nonce=[s2Rd32(enc,0),s2Rd32(enc,4),s2Rd32(enc,8)];
  var len=enc.length-12,out=new Uint8Array(len);
  for(var b=0;b<Math.ceil(len/64);b++){
    var ks=s2ChaChaBlock(key,b,nonce);
    for(var j=0;j<64&&b*64+j<len;j++)
      out[b*64+j]=enc[12+b*64+j]^ks[j];
  }
  var decoded=s2Utf8(out);
  var vals=decoded.split(/\r?\n/).map(clean).filter(function(u){
    return /^https:\/\/[^\s'"<>]+$/i.test(u)&&safeUrl(u)&&!!extType(u);
  });
  if(!vals.length)throw new Error("V1 offline WASM key no longer matches the media response");
  return vals;
}
function v1DecryptWithCompatKeys(payload,referer){
  for(var i=0;i<V1_COMPAT_KEYS.length;i++){
    try{
      var urls=v1DecryptWithKey(payload,V1_COMPAT_KEYS[i])
        .map(function(u){return asHttpUrl(u,referer);})
        .filter(function(u){return !!extType(u);});
      if(urls.length){log("V1 decoded encrypted stream URLs without binary fetch");return urls;}
    }catch(e){}
  }
  throw new Error("WASM: cached decoding parameters expired; upstream changed key");
}
function safeMediaURLs(data,referer){
  if(!data||!data.data||String(data.status_code)!=="200")return Promise.resolve([]);
  var su=data.data.stream_urls;
  if(Array.isArray(su))return Promise.resolve(su.map(function(u){return asHttpUrl(u,referer);}).filter(function(u){return !!extType(u);}));
  if(typeof su!=="string"||!su||!data.vs)return Promise.resolve([]);
  var vs=data.vs;
  var wasm=asHttpUrl(vs.wasm_url,referer);
  if(!wasm)return Promise.resolve([]);
  var bytesPromise;
  if(typeof vs.wasm==="string"&&vs.wasm.length>0&&vs.wasm.length<6*1024*1024){
    try{bytesPromise=Promise.resolve(validWasmBytes(s2Base64Bytes(vs.wasm)));}
    catch(e){bytesPromise=v1LoadWasm(wasm,referer);}
  }else bytesPromise=v1LoadWasm(wasm,referer);
  return bytesPromise.then(function(bytes){
    try{
      var urls=s2DecryptUrls(su,bytes);
      return urls.map(function(u){return asHttpUrl(u,referer);}).filter(function(u){return !!extType(u);});
    }catch(e){throw new Error("WASM decrypt: "+(e&&e.message||e));}
  }).catch(function(e){
    var msg=clean(e&&e.message||e);
    if(/native bridge has no binary bodyBase64|native binary bridge unavailable|binary array view unavailable|fetch\.arrayBuffer unavailable/i.test(msg)){
      log("old Nuvio has no binary WASM API; use verified public decoding parameters");
      return v1DecryptWithCompatKeys(su,referer);
    }
    if(msg.indexOf("WASM")===0)throw e;
    throw new Error("WASM transport: "+msg);
  });
}

/* ---- media verification ------------------------------------------------- */
function makeRow(url,quality,referer,label){
  var type=extType(url);if(!type)return null;
  var name=(label||"VidPlay · V1")+(quality&&quality!=="Auto"?" · "+quality:"");
  return {name:name,title:name,url:url,quality:quality||"Auto",type:type,provider:PROVIDER_ID,
    headers:{"User-Agent":UA,"Referer":referer},subtitles:[]};
}
function variantsFromMaster(t,u,ref,label){
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
    a.push(makeRow(candidate,quality,ref,label));seen[candidate]=true;
  }
  if(!a.length)a.push(makeRow(u,"Auto",ref,label));
  return a.filter(Boolean);
}
// The stream CDN issues a short-lived, requester-IP-bound JWT through
// /generate.php. It is generated ONCE per lookup and reused for every
// candidate host, because the endpoint is rate-limited (HTTP 429) when hit
// repeatedly, and cold generation legitimately takes several seconds.
function cdnTokenFor(origin,ref){
  return fetchText(origin+"/generate.php",{"User-Agent":UA,"Accept":"*/*","Referer":ref})
    .then(function(t){
      t=clean(t);
      try{var j=JSON.parse(t);t=clean(j.token||j.result||"");}catch(e){}
      return /^[a-zA-Z0-9._~-]{6,4096}$/.test(t)?t:"";
    }).catch(function(){return"";});
}
function withToken(u,token){
  if(!token)return u;
  return u+(u.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(token);
}
function verifyMaster(u,ref,token,label){
  var candidate=withToken(u,token);
  var h={"User-Agent":UA,"Referer":ref,"Accept":"application/vnd.apple.mpegurl,application/x-mpegURL,*/*"};
  var typ=extType(candidate);
  if(typ==="hls"){
    return fetchText(candidate,h).then(function(t){
      return variantsFromMaster(t,candidate,ref,label);
    });
  }
  if(typ==="dash"){
    return fetchText(candidate,h).then(function(t){
      if(!/<MPD\b/i.test(t))throw new Error("non-MPD document");
      return [makeRow(candidate,"Auto",ref,label)].filter(Boolean);
    });
  }
  if(typ==="mp4"){
    h.Range="bytes=0-31";
    return fetchWithRetry(candidate,{method:"GET",headers:h},2).then(function(r){
      var ct=clean(r.headers&&r.headers.get&&r.headers.get("content-type")).toLowerCase();
      if(!/video\/mp4|application\/octet-stream/.test(ct))throw new Error("not MP4 media");
      return [makeRow(candidate,"Auto",ref,label)].filter(Boolean);
    });
  }
  return Promise.resolve([]);
}

/* ---- server "V1" chain -------------------------------------------------- */
// job: {embed, vs, kind, label}
// The embed page itself does not need to be fetched first — vs_src.php accepts
// the embed URL as its Referer directly, saving a full page round trip.
function resolveV1(job){
  var stage="V1 播放源 API";
  var referer=job.embed;
  var vsUrl=YTHD+"/vs_src.php?"+job.vs;
  return fetchJSON(vsUrl,{"User-Agent":UA,"Referer":referer,"Accept":"application/json","X-Requested-With":"XMLHttpRequest"})
    .then(function(j){
      stage="外部播放器入口";
      var landing=asHttpUrl(j&&j.src,referer);
      if(!landing)throw new Error("no public player URL");
      return fetchText(landing,requestHeaders(referer)).then(function(html){
        stage="播放器入口配置";
        var cfg=parseInlineConfig(html,"CFG");
        if(!cfg||!cfg.playerUrl)throw new Error("no public V1 player config");
        var playerUrl=asHttpUrl(cfg.playerUrl,landing);
        if(!playerUrl)throw new Error("invalid V1 player URL");
        stage="内层播放器页面";
        return fetchText(playerUrl,requestHeaders(landing))
          .then(function(innerHtml){return {html:innerHtml,ref:playerUrl};});
      });
    })
    .then(function(inner){
      stage="签名媒体接口配置";
      var c=parseInlineConfig(inner.html,"CONFIG");
      if(!c)throw new Error("V1 player config unavailable");
      if(c.turnstile)log("V1 browser verification advertised; using only the current server-issued signed API token");
      if(c.mediaType&&c.mediaType!==job.kind)throw new Error("V1 wrong media type");
      if(job.kind==="movie"&&c.imdb&&c.imdb!==job.imdb)throw new Error("V1 wrong IMDb ID");
      var api;
      if(job.kind==="tv"){
        // TV config exposes streamBase + season/episode instead of a full api URL.
        var base=clean(c.streamBase||c.api);
        if(!base)throw new Error("V1 stream base missing");
        api=base.replace(/&amp;/g,"&");
        if(!/(?:[?&])season=/.test(api))api+="&season="+job.season;
        if(!/(?:[?&])episode=/.test(api))api+="&episode="+job.episode;
        if(!/(?:[?&])stream_urls(?:[=&]|$)/.test(api))api+="&stream_urls";
      }else{
        api=clean(c.api).replace(/&amp;/g,"&");
      }
      if(!/^https:\/\/data\.vidsrc(?:me\.ru|\.sh)\//i.test(api))throw new Error("unexpected V1 media API host");
      if(!/(?:[?&])stream_urls(?:[=&]|$)/.test(api))api+=(api.indexOf("?")<0?"?":"&")+"stream_urls";
      var token=clean(c.apiToken);
      if(!token)throw new Error("V1 stream requires valid player-issued API token");
      api+=(api.indexOf("?")<0?"?":"&")+"api_token="+encodeURIComponent(token);
      if(!safeUrl(api))throw new Error("invalid V1 media API URL");
      stage="签名媒体 API";
      return fetchJSON(api,{"User-Agent":UA,"Referer":inner.ref,"Accept":"application/json"})
        .then(function(j){
          if(String(j&&j.status_code)!=="200")throw new Error("V1 stream API "+(j&&j.status_code));
          stage="WASM 解密媒体地址";
          return safeMediaURLs(j,inner.ref);
        }).then(function(urls){
          stage="CDN HLS 解析";
          if(!urls.length)throw new Error("V1 API returned no supported media");
          var hosts=[];
          urls.forEach(function(u){
            var o=u.match(/^(https:\/\/[^/]+)/);
            if(o&&hosts.indexOf(o[1])<0)hosts.push(o[1]);
          });
          if(!hosts.length)throw new Error("no CDN origin");
          return cdnTokenFor(hosts[0],inner.ref).then(function(cdnToken){
            function resolveNext(index){
              if(index>=Math.min(urls.length,3))return Promise.resolve([]);
              return verifyMaster(urls[index],inner.ref,cdnToken,job.label).then(function(rows){
                return rows&&rows.length?rows:resolveNext(index+1);
              }).catch(function(e){
                log("V1 media rejected: "+(e&&e.message||e));
                return resolveNext(index+1);
              });
            }
            return resolveNext(0);
          });
        }).then(function(rows){
          var out=[],seen={};
          (rows||[]).forEach(function(r){
            if(r&&r.url&&!seen[r.url]){seen[r.url]=true;out.push(r);}
          });
          return out;
        });
    }).catch(function(e){
      var message=clean(e&&e.message||e);
      if(message.indexOf("V1 阶段[")===0)throw e;
      throw new Error("V1 阶段["+stage+"]: "+message);
    });
}

/* ---- Nuvio result plumbing --------------------------------------------- */
// Nuvio hides a provider that returns zero rows. This row is explicitly
// NON-PLAYABLE and states why; it is a status capsule, never a fabricated
// video or a wrapped HTML iframe.
function statusRow(reason){
  var msg=clean(reason).replace(/\s+/g," ").slice(0,120)||"没有取得可播放的视频流";
  var name="VidPlay · V1 · 诊断["+BUILD+"]（不可播放）："+msg;
  return {name:name,title:name,
    url:"data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQojRVhULVgtVkVSU0lPTjozCiNFWFQtWC1FTkRMSVNUCg==",
    quality:"Status",type:"hls",provider:PROVIDER_ID,headers:{},subtitles:[]};
}
function briefError(e){
  return clean(e&&e.message||e).replace(/https?:\/\/\S+/g,"[URL]").slice(0,90)||"未知错误";
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
function finish(rows,reasons,tmdb,type){
  var all=[],seen={};
  (rows||[]).forEach(function(r){
    if(!r||!r.url||r.quality==="Status"||/^data:/i.test(r.url)||seen[r.url])return;
    seen[r.url]=1;all.push(r);
  });
  log(BUILD+" V1 "+type+" "+tmdb+" verified streams="+all.length+(reasons.length?" reasons="+reasons.join("|"):""));
  if(all.length)return all;
  return [statusRow(reasons.length?reasons.join("；"):"V1 当前未返回可播放直链")];
}
function getStreams(id,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie",tmdb=clean(id);
  if(!/^\d+$/.test(tmdb))return Promise.resolve([statusRow("影片 ID 无效")]);
  season=parseInt(season,10)||0;episode=parseInt(episode,10)||0;
  if(type==="tv"&&(!season||!episode))return Promise.resolve([statusRow("缺少季或集编号")]);
  var reasons=[];
  var work;
  if(type==="tv"){
    // TV uses the TMDB id directly: no metadata hop is required.
    work=resolveV1({
      embed:YTHD+"/embed/"+tmdb+"/"+season+"/"+episode,
      vs:"type=tv&id="+encodeURIComponent(tmdb)+"&season="+season+"&episode="+episode,
      kind:"tv",season:season,episode:episode,label:"VidPlay · V1 S"+season+"E"+episode
    }).catch(function(e){
      var issue=briefError(e);log("V1 tv: "+issue);reasons.push("播放器："+issue);return[];
    });
  }else{
    work=tmdbMeta(tmdb,"movie").then(function(meta){
      if(!meta||!meta.imdb){reasons.push("元数据服务不可用");return[];}
      return resolveV1({
        embed:YTHD+"/embed/"+meta.imdb,
        vs:"type=movie&id="+encodeURIComponent(meta.imdb),
        kind:"movie",imdb:meta.imdb,label:"VidPlay · V1"
      }).catch(function(e){
        var issue=briefError(e);log("V1 movie: "+issue);reasons.push("播放器："+issue);return[];
      });
    });
  }
  var bounded=withinBudget(work.then(function(rows){return finish(rows,reasons,tmdb,type);}),BUDGET_MS)
    .catch(function(e){
      var issue=briefError(e);log("V1 budget: "+issue);
      return [statusRow(issue+"；站点访问可能被限制")];
    });
  return bounded.catch(function(e){
    var issue=briefError(e);log("V1 runtime: "+issue);
    return [statusRow("查询异常："+issue)];
  });
}
function onSettings(){
  return [
    {type:"header",label:"VidPlay · V1 ("+BUILD+")"},
    {type:"info",label:"Reproduces VidPlay's public server-V1 chain (ythd.org -> signed media API -> WASM-decoded HLS) for movies and TV episodes. Public keyless TMDB->IMDb mapping; the optional TMDB key below is only a fallback. Only HLS playlists that actually verify are returned; otherwise an explicit non-playable diagnostic capsule is shown. No Cloudflare bypass and no fabricated streams."},
    {type:"text",key:"tmdbApiKey",label:"TMDB key (optional fallback only)",defaultValue:"",isPassword:true}
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

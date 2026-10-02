// NoctraTV Local — Noctra's current VidSrc Me source, resolved locally.
//
// Current chain (2026-10):
//   Noctra -> vidsrc.me embed (TMDB id)
//   -> data.vidsrcme.ru/api.php?...&stream_urls
//   -> encrypted ChaCha20 stream_urls + rotating WASM key material
//   -> recover ChaCha20 key from WASM data segments in pure JS
//   -> /pl/... HLS URL(s)
//   -> per-host generate.php token (IP-bound)
//   -> verified #EXTM3U master.
//
// Nuvio Mobile currently exposes a WebAssembly placeholder rather than a real
// WASM runtime, so this provider deliberately DOES NOT execute upstream WASM.
// It parses the public WASM data section and performs ChaCha20 in JavaScript.
// That keeps token minting + playback on the same Android/Nuvio network.

var NOCTRA_SITE="https://www.noctra.tv";
var API="https://data.vidsrcme.ru/api.php";
var PLAYER_REF="https://cloudorchestranova.com/";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim()}
function apiUrl(tmdbId,mediaType,season,episode){
  var u=API+"?type="+(mediaType==="tv"?"tv":"movie")+"&tmdb="+encodeURIComponent(String(tmdbId))+"&stream_urls";
  if(mediaType==="tv")u+="&season="+encodeURIComponent(String(season||1))+"&episode="+encodeURIComponent(String(episode||1));
  return u;
}
function embedUrl(tmdbId,mediaType,season,episode){
  var u="https://vidsrc.me/embed/"+(mediaType==="tv"?"tv":"movie")+"?tmdb="+encodeURIComponent(String(tmdbId));
  if(mediaType==="tv")u+="&season="+encodeURIComponent(String(season||1))+"&episode="+encodeURIComponent(String(episode||1));
  return u;
}
function headers(referer,accept){
  return{"User-Agent":UA,"Referer":referer||PLAYER_REF,"Accept":accept||"*/*"};
}
function b64ToBytes(b64){
  var bin=atob(String(b64||"")),a=new Uint8Array(bin.length),i;
  for(i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i)&255;
  return a;
}
function rd32(b,o){
  return ((b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0);
}
function rotl32(x,n){return((x<<n)|(x>>>(32-n)))>>>0}
function chachaBlock(key,counter,nonce){
  var st=[
    1634760805,857760878,2036477234,1797285236,
    key[0],key[1],key[2],key[3],key[4],key[5],key[6],key[7],
    counter>>>0,nonce[0]>>>0,nonce[1]>>>0,nonce[2]>>>0
  ],x=st.slice(),i,w,out=new Uint8Array(64);
  function qr(a,b,c,d){
    x[a]=(x[a]+x[b])>>>0;x[d]=rotl32(x[d]^x[a],16);
    x[c]=(x[c]+x[d])>>>0;x[b]=rotl32(x[b]^x[c],12);
    x[a]=(x[a]+x[b])>>>0;x[d]=rotl32(x[d]^x[a],8);
    x[c]=(x[c]+x[d])>>>0;x[b]=rotl32(x[b]^x[c],7);
  }
  for(i=0;i<10;i++){
    qr(0,4,8,12);qr(1,5,9,13);qr(2,6,10,14);qr(3,7,11,15);
    qr(0,5,10,15);qr(1,6,11,12);qr(2,7,8,13);qr(3,4,9,14);
  }
  for(i=0;i<16;i++){
    w=(x[i]+st[i])>>>0;
    out[i*4]=w&255;out[i*4+1]=(w>>>8)&255;out[i*4+2]=(w>>>16)&255;out[i*4+3]=(w>>>24)&255;
  }
  return out;
}
function leb128(bytes,p){
  var r=0,s=0,b;
  do{
    if(p>=bytes.length)return[0,bytes.length];
    b=bytes[p++];r|=(b&127)<<s;
    if((b&128)===0)break;
    s+=7;
  }while(s<35);
  return[r>>>0,p];
}
function parseWasmDataSegments(bytes){
  var segs=[],p=8,tmp,size,end,cnt,k,flags,off,ln,mi;
  if(bytes.length<8||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109)return segs;
  while(p<bytes.length){
    var sid=bytes[p++];
    tmp=leb128(bytes,p);size=tmp[0];p=tmp[1];end=p+size;
    if(end>bytes.length)end=bytes.length;
    if(sid===11){
      tmp=leb128(bytes,p);cnt=tmp[0];p=tmp[1];
      for(k=0;k<cnt&&p<end;k++){
        tmp=leb128(bytes,p);flags=tmp[0];p=tmp[1];off=-1;

        // Upstream modules observed in this VidSrc family use an active
        // i32.const offset. Handle both standard flag 0/2 and the legacy
        // flag-1 shape seen by older mirrors.
        if(flags===2){
          tmp=leb128(bytes,p);mi=tmp[0];p=tmp[1];
        }
        if(flags===0||flags===2||flags===1){
          if(flags===1 && bytes[p]!==0x41){
            tmp=leb128(bytes,p);mi=tmp[0];p=tmp[1];
          }
          if(bytes[p]===0x41){
            p++;tmp=leb128(bytes,p);off=tmp[0];p=tmp[1];
            if(bytes[p]===0x0b)p++;
          }else if(flags===1){
            // Standard passive data segment: no offset.
            off=-1;
          }
        }
        tmp=leb128(bytes,p);ln=tmp[0];p=tmp[1];
        if(p+ln>end)ln=Math.max(0,end-p);
        if(off>=0)segs.push({off:off,data:bytes.slice(p,p+ln)});
        p+=ln;
      }
    }
    p=end;
  }
  return segs;
}
function matchKeyFromSegments(segs,enc){
  var base=null,candidates=[],i,j,s,kw,nonce,ks,ok;
  for(i=0;i<segs.length;i++){
    s=segs[i];
    if(s.off===0&&s.data.length>=32&&!base)base=s;
    if(s.off>=256&&s.data.length>=32)candidates.push(s);
  }
  if(!base||enc.length<16)return null;
  nonce=[rd32(enc,0),rd32(enc,4),rd32(enc,8)];
  for(i=0;i<candidates.length;i++){
    kw=[];
    for(j=0;j<8;j++)kw.push((rd32(base.data,j*4)^rd32(candidates[i].data,j*4))>>>0);
    ks=chachaBlock(kw,0,nonce);ok=true;
    // Plaintext is a URL; current payload starts with "http".
    if(((enc[12]^ks[0])&255)!==104)ok=false;
    if(((enc[13]^ks[1])&255)!==116)ok=false;
    if(((enc[14]^ks[2])&255)!==116)ok=false;
    if(((enc[15]^ks[3])&255)!==112)ok=false;
    if(ok)return kw;
  }
  return null;
}
function decodeUtf8(bytes){
  try{if(typeof TextDecoder!=="undefined")return new TextDecoder("utf-8").decode(bytes)}catch(_){}
  var bin="",i,chunk=8192;
  for(i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode.apply(null,bytes.slice(i,i+chunk));
  try{return decodeURIComponent(escape(bin))}catch(_){return bin}
}
function chachaDecrypt(key,enc){
  var nonce=[rd32(enc,0),rd32(enc,4),rd32(enc,8)],ct=enc.slice(12),out=new Uint8Array(ct.length);
  var blocks=Math.ceil(ct.length/64),b,j,ks;
  for(b=0;b<blocks;b++){
    ks=chachaBlock(key,b,nonce);
    for(j=0;j<64&&b*64+j<ct.length;j++)out[b*64+j]=ct[b*64+j]^ks[j];
  }
  return decodeUtf8(out);
}
function decryptStreamUrls(encB64,wasmBytes){
  var enc=b64ToBytes(encB64),key=matchKeyFromSegments(parseWasmDataSegments(wasmBytes),enc);
  if(!key)throw new Error("ChaCha key recovery failed");
  return chachaDecrypt(key,enc).split("\n").map(clean).filter(function(u){return/^https?:\/\//i.test(u)});
}
function originOf(u){
  var m=clean(u).match(/^(https?:\/\/[^/]+)/i);return m?m[1]:"";
}
function parseToken(t){
  t=clean(t);if(!t)return"";
  if(t.charAt(0)==="{"){
    try{
      var j=JSON.parse(t);
      return clean(j.token||j.data||j.result||j.string);
    }catch(_){}
  }
  return t;
}
function getToken(tokenUrl,origin){
  var urls=[],seen={};
  function add(u){u=clean(u);if(/^https?:\/\//i.test(u)&&!seen[u]){seen[u]=1;urls.push(u)}}
  add(tokenUrl);add(origin+"/generate.php");
  function attempt(i,round){
    if(i>=urls.length){
      if(round<2)return attempt(0,round+1);
      return Promise.resolve("");
    }
    return fetch(urls[i],{headers:headers(PLAYER_REF,"text/plain, application/json, */*")})
      .then(function(r){if(!r.ok)return"";return r.text().then(parseToken)})
      .then(function(t){return t||attempt(i+1,round)})
      .catch(function(){return attempt(i+1,round)});
  }
  return attempt(0,0);
}
function addToken(u,t){
  return u+(u.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(t);
}
function inspectHls(url){
  return fetch(url,{headers:headers(PLAYER_REF,"application/vnd.apple.mpegurl, application/x-mpegURL, */*")})
    .then(function(r){
      if(!r.ok)return null;
      return r.text().then(function(body){
        if(body.indexOf("#EXTM3U")!==0)return null;
        var max=0,m,re=/RESOLUTION=\d+x(\d+)/gi;
        while((m=re.exec(body))!==null)max=Math.max(max,parseInt(m[1],10)||0);
        return{url:url,quality:max?max+"p":"Auto"};
      });
    }).catch(function(){return null});
}
function qualityHint(payload){
  var f=clean(payload&&payload.data&&payload.data.file_name),m=f.match(/\[(2160p|1440p|1080p|720p|480p)\]/i);
  return m?m[1].toLowerCase():"Auto";
}
function resolvePayload(payload){
  if(!payload||String(payload.status_code)!=="200"||!payload.data)return Promise.resolve({payload:payload,urls:[]});
  var su=payload.data.stream_urls;
  if(Array.isArray(su))return Promise.resolve({payload:payload,urls:su.map(clean).filter(Boolean)});
  if(typeof su!=="string"||!su||!payload.vs||!payload.vs.wasm_url)return Promise.resolve({payload:payload,urls:[]});
  var wu=clean(payload.vs.wasm_url);
  if(!/^https:\/\/(?:[^/]+\.)?vidsrcme\.ru(?:\/|$)/i.test(wu))throw new Error("unexpected WASM host");
  return fetch(wu,{headers:headers(PLAYER_REF,"application/wasm, */*")})
    .then(function(r){if(!r.ok)throw new Error("WASM HTTP "+r.status);return r.arrayBuffer()})
    .then(function(ab){return{payload:payload,urls:decryptStreamUrls(su,new Uint8Array(ab))}});
}
function verifyResolved(payload,urls){
  var tokenUrl=clean(payload&&payload.data&&payload.data.gen_token_url),hint=qualityHint(payload);
  var seen={},unique=[];
  (urls||[]).forEach(function(u){var o=originOf(u);if(o&&!seen[o]){seen[o]=1;unique.push({url:u,origin:o})}});
  function one(x){
    return getToken(tokenUrl,x.origin).then(function(t){
      if(!t)return null;
      return inspectHls(addToken(x.url,t));
    }).then(function(v){if(v&&v.quality==="Auto")v.quality=hint;return v});
  }
  return Promise.all(unique.slice(0,5).map(one)).then(function(rows){return rows.filter(Boolean)});
}
function toStreams(rows){
  return(rows||[]).map(function(x,i){
    var q=x.quality||"Auto",name="NoctraTV · VidSrc Me · HLS · "+q+((rows||[]).length>1?" · "+(i+1):"");
    return{name:name,title:name,url:x.url,quality:q,type:"hls",provider:"noctratv",
      headers:{"User-Agent":UA},subtitles:[]};
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return fetch(apiUrl(tmdbId,mediaType,season,episode),{
    headers:headers(PLAYER_REF,"application/json, text/plain, */*")
  }).then(function(r){
    if(!r.ok)throw new Error("API HTTP "+r.status);
    return r.json();
  }).then(resolvePayload).then(function(x){
    if(!x.urls.length)throw new Error("no decrypted stream URLs");
    return verifyResolved(x.payload,x.urls);
  }).then(function(rows){
    var out=toStreams(rows);
    console.log("[NoctraTV] "+mediaType+" "+tmdbId+" verified="+out.length);
    return out;
  }).catch(function(e){
    console.error("[NoctraTV] "+(e&&e.message?e.message:e));
    return[];
  });
}

module.exports={
  getStreams:getStreams,
  apiUrl:apiUrl,
  embedUrl:embedUrl,
  parseWasmDataSegments:parseWasmDataSegments,
  matchKeyFromSegments:matchKeyFromSegments,
  chachaDecrypt:chachaDecrypt,
  decryptStreamUrls:decryptStreamUrls
};

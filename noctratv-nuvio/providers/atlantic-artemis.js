// NoctraTV · Atlantic · Artemis
// noctratv.com currently labels this family "Atlantic · Artemis".
// Upstream Atlantic retired old stellar/Artemis and now serves the same menu slot
// through Helios: stream.hls.lol/helios -> Moscow/Novo/Omsk.
// Current hl_<hex> values use Atlantic's live Helios AES-256-GCM key; legacy ns_ remains supported. No iframe fallback.

var ORIGIN="https://atlantic.st";
var HELIOS="https://stream.hls.lol/helios";
var HELIOS_KEY_HEX="117c358bcfcaf8fe2cfca57c9d2238a300e1c4de2efb83a5012ba84d8a31f1dd";
var LEGACY_NESTEROV_KEY_HEX="e4b8a1d6f2c9037b5a8e4d1c6f9b2085a7c3e9f6d1b4a8c2e5f7a0d3b6c9e2f5";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function headers(extra){
  var h={
    "User-Agent":UA,
    "Origin":ORIGIN,
    "Referer":ORIGIN+"/",
    "Accept":"*/*",
    "Accept-Language":"en-US,en;q=0.9",
    "Sec-Fetch-Dest":"empty",
    "Sec-Fetch-Mode":"cors",
    "Sec-Fetch-Site":"cross-site"
  };
  if(extra)Object.keys(extra).forEach(function(k){h[k]=String(extra[k]);});
  return h;
}
function hexBytes(s){
  s=clean(s); if(s.length%2)throw new Error("bad hex");
  var a=new Uint8Array(s.length/2);
  for(var i=0;i<a.length;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);
  return a;
}
function decryptPayload(raw){
  raw=clean(raw);
  var keyHex="",hex="";
  if(raw.indexOf("hl_")===0){
    keyHex=HELIOS_KEY_HEX; hex=raw.slice(3);
  }else if(raw.indexOf("ns_")===0){
    keyHex=LEGACY_NESTEROV_KEY_HEX; hex=raw.slice(3);
  }else{
    return Promise.resolve(raw);
  }
  var blob=hexBytes(hex);
  if(blob.length<29)return Promise.reject(new Error("encrypted payload too short"));
  var iv=blob.slice(0,12);
  var ctTag=blob.slice(12);
  return globalThis.crypto.subtle.importKey(
    "raw",hexBytes(keyHex),{name:"AES-GCM"},false,["decrypt"]
  ).then(function(key){
    return globalThis.crypto.subtle.decrypt(
      {name:"AES-GCM",iv:iv,tagLength:128},key,ctTag
    );
  }).then(function(buf){
    return new TextDecoder("utf-8").decode(new Uint8Array(buf));
  });
}
function abs(u,base){
  try{return new URL(u,base).toString();}catch(_){return clean(u);}
}
function parseMaster(text,base){
  var s=String(text||""),lines=s.split(/\r?\n/),variants=[],audios=[];
  for(var i=0;i<lines.length;i++){
    var L=lines[i].trim();
    if(L.indexOf("#EXT-X-MEDIA:")===0&&/TYPE=AUDIO/i.test(L)){
      var nm=/NAME="([^"]*)"/i.exec(L); if(nm)audios.push(nm[1]);
    }
    if(L.indexOf("#EXT-X-STREAM-INF:")===0){
      var rm=/RESOLUTION=(\d+)x(\d+)/i.exec(L);
      var bm=/BANDWIDTH=(\d+)/i.exec(L);
      var cm=/CODECS="([^"]*)"/i.exec(L);
      var uri="";
      for(var k=i+1;k<lines.length;k++){
        var q=lines[k].trim();
        if(q&&!q.startsWith("#")){uri=abs(q,base);break;}
      }
      if(uri)variants.push({
        h:rm?parseInt(rm[2],10):0,
        bw:bm?parseInt(bm[1],10):0,
        codecs:cm?cm[1]:"",
        url:uri
      });
    }
  }
  variants.sort(function(a,b){return b.h-a.h||b.bw-a.bw;});
  return{variants:variants,audios:audios,isFlat:/#EXTINF:/i.test(s)&&variants.length===0,body:s};
}
function quality(h){
  h=Number(h)||0;
  if(h>=2160)return"4K";
  if(h>=1440)return"1440p";
  if(h>=1080)return"1080p";
  if(h>=720)return"720p";
  if(h>=480)return"480p";
  return h?h+"p":"Auto";
}
function firstMediaLine(text){
  var lines=String(text||"").split(/\r?\n/);
  for(var i=0;i<lines.length;i++){
    var q=lines[i].trim();
    if(q&&!q.startsWith("#"))return q;
  }
  return"";
}
function fetchText(url){
  return fetch(url,{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.text();
  });
}
function probeMedia(url){
  return fetch(url,{headers:headers({"Range":"bytes=0-4095"})}).then(function(r){
    if(!(r.ok||r.status===206))return false;
    var ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();
    if(/text\/html|application\/json/.test(ct))return false;
    return r.arrayBuffer().then(function(b){return b&&b.byteLength>0;});
  }).catch(function(){return false;});
}
function validateMaster(url){
  return fetchText(url).then(function(body){
    if(String(body||"").indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    var p=parseMaster(body,url);
    if(p.variants.length){
      var v=p.variants[0];
      return fetchText(v.url).then(function(child){
        if(String(child||"").indexOf("#EXTM3U")!==0)throw new Error("bad child HLS");
        var first=firstMediaLine(child);
        if(!first)throw new Error("child has no media");
        return probeMedia(abs(first,v.url)).then(function(ok){
          if(!ok)throw new Error("media probe failed");
          return{quality:quality(v.h),maxHeight:v.h,audios:p.audios.length};
        });
      });
    }
    if(p.isFlat){
      var first=firstMediaLine(body);
      if(!first)throw new Error("flat HLS has no media");
      return probeMedia(abs(first,url)).then(function(ok){
        if(!ok)throw new Error("flat media probe failed");
        return{quality:"Auto",maxHeight:0,audios:0};
      });
    }
    throw new Error("HLS has no variants/media");
  });
}
function heliosUrl(tmdbId,type,season,episode){
  var u=HELIOS+"?tmdbId="+encodeURIComponent(String(tmdbId))+
    "&type="+encodeURIComponent(type);
  if(type==="tv"){
    u+="&seasonId="+encodeURIComponent(String(season||1))+
       "&episodeId="+encodeURIComponent(String(episode||1));
  }
  return u;
}
function candidates(tmdbId,type,season,episode){
  return fetch(heliosUrl(tmdbId,type,season,episode),{headers:headers()})
    .then(function(r){
      if(!r.ok)throw new Error("helios HTTP "+r.status);
      return r.json();
    }).then(function(j){
      var src=j&&j.sources&&typeof j.sources==="object"?j.sources:{};
      var order=["Moscow","Novo","Omsk"];
      return Promise.all(order.map(function(name){
        var raw=clean(src[name]&&src[name].url);
        if(!raw)return null;
        return decryptPayload(raw).then(function(u){
          if(!/^https?:\/\//i.test(clean(u)))return null;
          try{if(new URL(u).hostname==="atlantic.st")return null;}catch(_){return null;}
          return{name:name,url:u};
        }).catch(function(e){
          console.log("[Noctra/Atlantic/Artemis] "+name+" decrypt "+(e&&e.message?e.message:e));
          return null;
        });
      })).then(function(rows){return rows.filter(Boolean);});
    });
}
function resolveFirst(tmdbId,type,season,episode){
  return candidates(tmdbId,type,season,episode).then(function(rows){
    var i=0;
    function next(){
      if(i>=rows.length)return Promise.resolve(null);
      var x=rows[i++];
      return validateMaster(x.url).then(function(v){
        return{x:x,v:v};
      }).catch(function(e){
        console.log("[Noctra/Atlantic/Artemis] "+x.name+" "+(e&&e.message?e.message:e));
        return next();
      });
    }
    return next();
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var type=mediaType==="tv"?"tv":"movie";
  return resolveFirst(tmdbId,type,season,episode).then(function(r){
    if(!r)return[];
    var suffix=r.v.audios>1?" · "+r.v.audios+" audio":"";
    var name="NoctraTV · Atlantic · Artemis · "+r.x.name+" · "+r.v.quality+suffix;
    var out=[{
      name:name,title:name,url:r.x.url,quality:r.v.quality,type:"hls",
      provider:"noctra-atlantic-artemis",
      headers:headers(),
      subtitles:[]
    }];
    console.log("[Noctra/Atlantic/Artemis] "+mediaType+" "+tmdbId+" streams=1 server="+r.x.name+" quality="+r.v.quality);
    return out;
  }).catch(function(e){
    console.log("[Noctra/Atlantic/Artemis] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

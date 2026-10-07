// YesMovies S2 Lab for Nuvio
// EXPERIMENTAL: isolated from stable YesMovies Local v0.2.5.
// Route: TMDB -> VidSrc/VSEmbed data API -> pure-JS WASM data recovery -> ChaCha20 -> HLS.

var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
var API="https://data.vidsrcme.ru/api.php";
var DIAG=[];
var STATUS_HLS="data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQojRVhULVgtVkVSU0lPTjozCiNFWFQtWC1FTkRMSVNUCg==";

function clean(v){return v==null?"":String(v).trim();}
function diag(v){DIAG.push(clean(v));try{console.log("[YesMovies S2 Lab] "+v);}catch(_){}}
function statusRows(){
  var a=DIAG.length?DIAG:["no diagnostic"];
  if(a.length>8)a=a.slice(0,5).concat(a.slice(-3));
  return a.map(function(x,i){
    var n="YesMovies S2 LAB · DIAG "+(i+1)+" · "+x;
    return{name:n,title:n,url:STATUS_HLS,quality:"Status",type:"hls",provider:"yesmovies-s2-lab",headers:{},subtitles:[]};
  });
}
function timeout(p,ms,label){
  if(typeof setTimeout!=="function")return p;
  return Promise.race([p,new Promise(function(_,rej){setTimeout(function(){rej(new Error((label||"request")+" timeout"));},ms);})]);
}
function fetchOk(url,opt,label,ms){
  return timeout(fetch(url,opt||{}),ms||10000,label).then(function(r){
    if(!r||!r.ok)throw new Error((label||"HTTP")+" "+(r?r.status:"0"));
    return r;
  });
}
function rd32(b,o){return ((b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0);}
function rotl(x,n){return ((x<<n)|(x>>>(32-n)))>>>0;}
function chachaBlock(k,c,n){
  var st=[1634760805,857760878,2036477234,1797285236,k[0],k[1],k[2],k[3],k[4],k[5],k[6],k[7],c>>>0,n[0]>>>0,n[1]>>>0,n[2]>>>0];
  var x=st.slice();
  function q(a,b,c0,d){
    x[a]=(x[a]+x[b])>>>0;x[d]=rotl(x[d]^x[a],16);
    x[c0]=(x[c0]+x[d])>>>0;x[b]=rotl(x[b]^x[c0],12);
    x[a]=(x[a]+x[b])>>>0;x[d]=rotl(x[d]^x[a],8);
    x[c0]=(x[c0]+x[d])>>>0;x[b]=rotl(x[b]^x[c0],7);
  }
  for(var i=0;i<10;i++){
    q(0,4,8,12);q(1,5,9,13);q(2,6,10,14);q(3,7,11,15);
    q(0,5,10,15);q(1,6,11,12);q(2,7,8,13);q(3,4,9,14);
  }
  var out=new Uint8Array(64);
  for(var j=0;j<16;j++){var w=(x[j]+st[j])>>>0;out[j*4]=w&255;out[j*4+1]=(w>>>8)&255;out[j*4+2]=(w>>>16)&255;out[j*4+3]=(w>>>24)&255;}
  return out;
}
function leb(b,p){
  var r=0,s=0,v;
  do{v=b[p++];r|=(v&127)<<s;if((v&128)===0)break;s+=7;}while(p<b.length);
  return[r>>>0,p];
}
function wasmSegments(b){
  if(!b||b.length<8||b[0]!==0||b[1]!==97||b[2]!==115||b[3]!==109)throw new Error("bad WASM");
  var out=[],p=8;
  while(p<b.length){
    var id=b[p++],r=leb(b,p),len=r[0];p=r[1];var end=p+len;
    if(end>b.length)throw new Error("WASM section overflow");
    if(id===11){
      r=leb(b,p);var cnt=r[0];p=r[1];
      for(var i=0;i<cnt;i++){
        r=leb(b,p);var flags=r[0];p=r[1];var off=-1;
        if(flags===0||flags===1){
          if(flags===1){r=leb(b,p);p=r[1];}
          if(b[p]===0x41){p++;r=leb(b,p);off=r[0];p=r[1];}
          if(b[p]===0x0b)p++;
        }else if(flags===2){
          r=leb(b,p);p=r[1];
          if(b[p]===0x41){p++;r=leb(b,p);off=r[0];p=r[1];}
          if(b[p]===0x0b)p++;
        }
        r=leb(b,p);var dl=r[0];p=r[1];
        var data=b.slice(p,p+dl);p+=dl;
        if(off>=0)out.push({off:off,data:data});
      }
    }
    p=end;
  }
  return out;
}
function recoverKey(wasm,enc){
  var segs=wasmSegments(wasm),base=null;
  for(var i=0;i<segs.length;i++)if(segs[i].off===0&&segs[i].data.length>=32){base=segs[i];break;}
  if(!base)throw new Error("WASM base key segment missing");
  var nonce=[rd32(enc,0),rd32(enc,4),rd32(enc,8)];
  for(var c=0;c<segs.length;c++){
    var d=segs[c];
    if(d.off<256||d.data.length<32)continue;
    var kw=[];
    for(var j=0;j<8;j++)kw.push((rd32(base.data,j*4)^rd32(d.data,j*4))>>>0);
    var ks=chachaBlock(kw,0,nonce);
    if(((enc[12]^ks[0])&255)===104&&((enc[13]^ks[1])&255)===116&&((enc[14]^ks[2])&255)===116&&((enc[15]^ks[3])&255)===112)return kw;
  }
  throw new Error("ChaCha key recovery failed");
}
function b64bytes(s){
  var bin=atob(s),a=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i)&255;
  return a;
}
function utf8(b){
  var s="",i;
  for(i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);
  try{return decodeURIComponent(escape(s));}catch(_){return s;}
}
function decryptUrls(encB64,wasm){
  var enc=b64bytes(encB64);
  if(enc.length<16)throw new Error("encrypted stream_urls too short");
  var key=recoverKey(wasm,enc),nonce=[rd32(enc,0),rd32(enc,4),rd32(enc,8)],ct=enc.slice(12),out=new Uint8Array(ct.length);
  for(var b=0;b<Math.ceil(ct.length/64);b++){
    var ks=chachaBlock(key,b,nonce);
    for(var j=0;j<64&&b*64+j<ct.length;j++)out[b*64+j]=ct[b*64+j]^ks[j];
  }
  return utf8(out).split(/\r?\n/).map(clean).filter(function(x){return /^https?:\/\//i.test(x);});
}
function originOf(u){var m=clean(u).match(/^(https?:\/\/[^/]+)/i);return m?m[1]:"";}
function abs(base,u){
  if(/^https?:\/\//i.test(u))return u;
  var o=originOf(base);if(u.charAt(0)==="/")return o+u;
  return base.replace(/[^/]*(?:\?.*)?$/,"")+u;
}
function qFromName(name){
  var m=clean(name).match(/(?:\[|\.|\s)(2160|1440|1080|720|480|360)p(?:\]|\.|\s|\/)/i);
  return m?m[1]+"p":"Auto";
}
function parseMaster(t,u){
  var lines=String(t||"").replace(/\r/g,"").split("\n"),out=[];
  for(var i=0;i<lines.length;i++){
    var l=lines[i].trim();if(l.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var rm=l.match(/RESOLUTION=(\d+)x(\d+)/i),next="";
    for(var j=i+1;j<lines.length;j++){var n=lines[j].trim();if(n&&n.charAt(0)!=="#"){next=n;break;}}
    if(next){
      var h=rm?parseInt(rm[2],10):0;
      out.push({url:abs(u,next),quality:h?(h+"p"):"Auto"});
    }
  }
  return out;
}
function tokenFromText(t){
  t=clean(t);if(!t)return"";
  if(t.charAt(0)==="{"){try{var j=JSON.parse(t);return clean(j.token||j.data||j.result);}catch(_){}}
  return t;
}
function prepareUrl(u){
  var o=originOf(u);if(!o)return Promise.resolve(null);
  return fetchOk(o+"/generate.php",{headers:{"User-Agent":UA,"Accept":"*/*"}},"token",7000)
    .then(function(r){return r.text();})
    .then(function(t){
      var tok=tokenFromText(t);
      if(!tok)return u;
      return u+(u.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(tok);
    }).catch(function(){return u;});
}
function apiPayload(id,type,season,episode){
  var u=API+"?type="+(type==="tv"?"tv":"movie")+"&tmdb="+encodeURIComponent(id)+"&stream_urls";
  if(type==="tv")u+="&season="+encodeURIComponent(season)+"&episode="+encodeURIComponent(episode);
  return fetchOk(u,{headers:{"User-Agent":UA,"Accept":"application/json","Referer":"https://cloudorchestranova.com/"}},"VidSrc API",10000)
    .then(function(r){return r.json();});
}
function extractRawUrls(j){
  if(!j||String(j.status_code)!=="200"||!j.data)throw new Error("VidSrc API status "+(j&&j.status_code));
  var su=j.data.stream_urls;
  if(Array.isArray(su))return Promise.resolve({urls:su,file:j.data.file_name||""});
  if(typeof su!=="string"||!su||!j.vs||!j.vs.wasm_url)throw new Error("encrypted stream data missing");
  return fetchOk(j.vs.wasm_url,{headers:{"User-Agent":UA,"Referer":"https://cloudorchestranova.com/"}},"WASM",10000)
    .then(function(r){return r.arrayBuffer();})
    .then(function(buf){
      var urls=decryptUrls(su,new Uint8Array(buf));
      return{urls:urls,file:j.data.file_name||""};
    });
}
function verifyOne(raw,fallbackQ){
  return prepareUrl(raw).then(function(u){
    if(!u)return[];
    return fetchOk(u,{headers:{"User-Agent":UA}},"HLS",9000).then(function(r){return r.text();}).then(function(t){
      if(t.indexOf("#EXTM3U")!==0)throw new Error("not HLS");
      var vars=parseMaster(t,u);
      if(vars.length)return vars.map(function(v){return{url:v.url,quality:v.quality};});
      return[{url:u,quality:fallbackQ||"Auto"}];
    });
  }).catch(function(e){diag("HOST · "+originOf(raw)+" · "+(e&&e.message?e.message:e));return[];});
}
function getStreams(tmdbId,mediaType,season,episode){
  DIAG=[];mediaType=mediaType==="tv"?"tv":"movie";
  if(!tmdbId)return Promise.resolve(statusRows());
  if(mediaType==="tv"&&(!season||!episode)){diag("INPUT · missing season/episode");return Promise.resolve(statusRows());}
  diag("INPUT · TMDB "+tmdbId+(mediaType==="tv"?(" S"+season+"E"+episode):""));
  return apiPayload(String(tmdbId),mediaType,season,episode)
    .then(function(j){
      var f=clean(j&&j.data&&j.data.file_name);diag("API · "+(f||"200"));
      return extractRawUrls(j);
    })
    .then(function(x){
      diag("DECRYPT · "+x.urls.length+" URL(s)");
      var fallback=qFromName(x.file);
      return Promise.all(x.urls.slice(0,4).map(function(u){return verifyOne(u,fallback);}));
    })
    .then(function(groups){
      var all=[];groups.forEach(function(g){all=all.concat(g||[]);});
      var seen={},out=[];
      all.forEach(function(x){var k=x.url+"|"+x.quality;if(!seen[k]){seen[k]=1;out.push(x);}});
      out.sort(function(a,b){return (parseInt(b.quality,10)||0)-(parseInt(a.quality,10)||0);});
      if(!out.length){diag("VERIFY · no playable HLS");return statusRows();}
      return out.map(function(x){
        var n="YesMovies S2 · "+(x.quality||"Auto");
        return{name:n,title:n,url:x.url,quality:x.quality||"Auto",type:"hls",provider:"yesmovies-s2-lab",headers:{"User-Agent":UA},subtitles:[]};
      });
    }).catch(function(e){diag("RUNTIME · "+(e&&e.message?e.message:e));return statusRows();});
}
module.exports={getStreams:getStreams};

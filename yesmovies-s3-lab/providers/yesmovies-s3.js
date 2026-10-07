// YesMovies S3 Lab for Nuvio
// EXPERIMENTAL and isolated from stable YesMovies Local v0.2.6.
// v0.1.2
// Route: TMDB -> YesMovies internal id -> Ployan server 5 -> Vidara /api/stream.
// Tests full code first, then legacy base-code fallback; both require strict TMDB title validation.

var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var TMDB_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var BASES=["https://ww2.yesmovies.ag","https://yesmovies.ag","https://ww1.yesmovies.ag"];
var PLOYAN="https://ployan.me";
var DIAG=[];
var STATUS_HLS="data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQojRVhULVgtVkVSU0lPTjozCiNFWFQtWC1FTkRMSVNUCg==";

function clean(v){return v==null?"":String(v).trim();}
function lower(v){return clean(v).toLowerCase();}
function diag(v){DIAG.push(clean(v));try{console.log("[YesMovies S3 Lab] "+v);}catch(_){}}
function statusRows(){
  var a=DIAG.length?DIAG:["no diagnostic"];if(a.length>8)a=a.slice(0,5).concat(a.slice(-3));
  return a.map(function(x,i){var n="YesMovies S3 LAB · DIAG "+(i+1)+" · "+x;return{name:n,title:n,url:STATUS_HLS,quality:"Status",type:"hls",provider:"yesmovies-s3-lab",headers:{},subtitles:[]};});
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
function simple(v){
  return lower(v).replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function baseTitle(v){return simple(v).replace(/\s+season\s+\d+$/,"").trim();}
function tokenQueries(v){
  var stop={the:1,and:1,for:1,with:1,from:1,season:1};
  return baseTitle(v).split(/\s+/).filter(function(x){return x.length>=3&&!stop[x];});
}
function tmdbInfo(id,type){
  var t=type==="tv"?"tv":"movie";
  var u="https://api.themoviedb.org/3/"+t+"/"+encodeURIComponent(id)+"?api_key="+TMDB_KEY+"&language=en-US";
  return fetchOk(u,{headers:{"User-Agent":UA,"Accept":"application/json"}},"TMDB",9000).then(function(r){return r.json();}).then(function(j){
    var title=clean(j.title||j.name),orig=clean(j.original_title||j.original_name),date=clean(j.release_date||j.first_air_date);
    return{title:title||orig,originalTitle:orig,year:parseInt(date.slice(0,4),10)||0};
  });
}
function findYesMovies(info,type,season){
  var qs=[],a=tokenQueries(info.title).concat(tokenQueries(info.originalTitle));
  a.forEach(function(x){if(qs.indexOf(x)<0)qs.push(x);});
  var bi=0;
  function tryBase(){
    if(bi>=BASES.length)throw new Error("YesMovies search unavailable");
    var base=BASES[bi++],qi=0;
    function next(){
      if(qi>=qs.length)return tryBase();
      var q=qs[qi++],u=base+"/searching?q="+encodeURIComponent(q)+"&limit=40&offset=0";
      return fetchOk(u,{headers:{"User-Agent":UA,"Accept":"application/json","Referer":base+"/search.html"}},"searching",9000)
        .then(function(r){return r.json();}).then(function(j){
          var arr=j&&Array.isArray(j.data)?j.data:[],target=baseTitle(info.title||info.originalTitle),best=null,bestScore=-999;
          diag("SEARCH · "+q+" · "+arr.length);
          arr.forEach(function(x){
            var title=clean(x.t),bt=baseTitle(title),sc=0,want=type==="tv"?"s":"m";
            sc+=(clean(x.d)===want)?50:-100;
            if(bt===target)sc+=150;
            else if(bt.indexOf(target)>=0||target.indexOf(bt)>=0)sc+=70;
            if(type==="tv")sc+=(Number(x.n)===Number(season))?80:-70;
            else if(info.year)sc+=(Number(x.y)===Number(info.year))?35:0;
            if(sc>bestScore){bestScore=sc;best=x;}
          });
          if(!best||bestScore<120)return next();
          var slug=clean(best.s),m=slug.match(/-(\d+)$/);
          if(!m)return next();
          var out={id:m[1],slug:slug,base:base,title:clean(best.t)};
          diag("MATCH · "+out.title+" · id "+out.id);
          return out;
        }).catch(function(e){diag("SEARCH · "+q+" · "+(e&&e.message?e.message:e));return next();});
    }
    return next();
  }
  return Promise.resolve().then(tryBase);
}
function bytesToHex(a){var s="",i;for(i=0;i<a.length;i++)s+=(a[i]<16?"0":"")+a[i].toString(16);return s;}
function hexToBytes(h){var a=new Uint8Array(Math.floor(h.length/2)),i;for(i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16)||0;return a;}
function utf8Bytes(v){var s=unescape(encodeURIComponent(String(v))),a=new Uint8Array(s.length),i;for(i=0;i<s.length;i++)a[i]=s.charCodeAt(i)&255;return a;}
function utf8Hex(v){return bytesToHex(utf8Bytes(v));}
function bytesUtf8(a){var s="",i;for(i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);try{return decodeURIComponent(escape(s));}catch(_){return s;}}
function randomHex(n){
  try{if(typeof __crypto_get_random_values_hex==="function"){var x=clean(__crypto_get_random_values_hex(n));if(x.length===n*2)return x;}}catch(_){}
  var s="",i;for(i=0;i<n;i++){var b=Math.floor(Math.random()*256);s+=(b<16?"0":"")+b.toString(16);}return s;
}
function keyHex(saltHex){
  if(typeof __crypto_pbkdf2_hex!=="function")throw new Error("PBKDF2 bridge unavailable");
  return __crypto_pbkdf2_hex(utf8Hex("player"),saltHex,1000,256,"SHA256");
}
function ployanToken(plain){
  if(typeof __crypto_aes_encrypt_hex!=="function")return Promise.reject(new Error("AES bridge unavailable"));
  var salt=randomHex(8),iv=randomHex(12),key=keyHex(salt);
  var ct=__crypto_aes_encrypt_hex("AES-GCM",key,iv,utf8Hex(plain));
  if(!ct)return Promise.reject(new Error("AES encrypt failed"));
  return Promise.resolve(salt+"-"+iv+"-"+ct);
}
function decryptInfo(blob){
  if(typeof __crypto_aes_decrypt_hex!=="function")return Promise.reject(new Error("AES decrypt bridge unavailable"));
  var p=clean(blob).split("-");if(p.length!==3)return Promise.reject(new Error("bad Ployan info"));
  try{
    var plain=__crypto_aes_decrypt_hex("AES-GCM",keyHex(p[0]),p[1],p[2]);
    if(!plain)throw new Error("empty decrypted info");
    return Promise.resolve(bytesUtf8(hexToBytes(plain)));
  }catch(e){return Promise.reject(e);}
}
function ployanS3(mid,eid){
  var ts=Math.floor(Date.now()/1000),plain=String(mid)+"+"+String(eid)+"+5+"+ts;
  return ployanToken(plain).then(function(tok){
    var h={"User-Agent":UA,"Accept":"application/json","Referer":PLOYAN+"/watch/?v5"+eid,"Origin":PLOYAN};
    return fetchOk(PLOYAN+"/get/"+tok,{headers:h},"Ployan S3",9000).then(function(r){return r.json();});
  }).then(function(j){
    if(!j||Number(j.code)!==200||clean(j.mode)!=="embed"||!j.info)throw new Error("Ployan S3 unavailable");
    return decryptInfo(j.info);
  });
}
function parseVidaraEmbed(embed){
  var m=clean(embed).match(/^(https?:\/\/[^/]+)\/e\/([^/?#]+)/i);
  if(!m)throw new Error("S3 is not a Vidara embed");
  return{origin:m[1],url:m[1]+"/e/"+m[2],code:m[2]};
}
function normTitle(v){
  return lower(v).replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function titleLooksRight(apiTitle,info){
  var a=normTitle(apiTitle),b=normTitle(info&&info.title),c=normTitle(info&&info.originalTitle);
  if(!a)return false;
  if(b&&(a===b||a.indexOf(b)>=0||b.indexOf(a)>=0))return true;
  if(c&&(a===c||a.indexOf(c)>=0||c.indexOf(a)>=0))return true;
  return false;
}
function vidaraApiTry(origin,code,info,label){
  var api=origin+"/api/stream";
  diag("VIDARA · try "+label+" · "+code);
  return fetchOk(api,{
    method:"POST",
    headers:{
      "User-Agent":UA,
      "Accept":"application/json, text/plain, */*",
      "Content-Type":"application/json",
      "Origin":origin,
      "Referer":origin+"/",
      "X-Requested-With":"XMLHttpRequest"
    },
    body:JSON.stringify({filecode:code,device:"web"})
  },"Vidara API "+label,10000).then(function(r){return r.json();}).then(function(j){
    if(j&&j.error)throw new Error(clean(j.error));
    var u=clean(j&&j.streaming_url),ttl=clean(j&&j.title);
    diag("VIDARA · "+label+" title "+(ttl||"?"));
    if(!u)throw new Error("streaming_url missing");
    if(!titleLooksRight(ttl,info))throw new Error("content mismatch");
    return{url:u,origin:origin,referer:origin+"/",code:code,label:label,title:ttl};
  });
}
function validateAndResolveVidara(embed,info){
  var v=parseVidaraEmbed(embed);
  var full=v.code,base=full.replace(/-\d{10}$/,"");
  return vidaraApiTry(v.origin,full,info,"full").catch(function(e1){
    diag("VIDARA · full failed · "+(e1&&e1.message?e1.message:e1));
    if(base===full)throw e1;
    return vidaraApiTry(v.origin,base,info,"base").catch(function(e2){
      diag("VIDARA · base failed · "+(e2&&e2.message?e2.message:e2));
      throw new Error("Vidara full/base both failed");
    });
  });
}

function abs(base,u){if(/^https?:\/\//i.test(u))return u;var m=base.match(/^(https?:\/\/[^/]+)/i);if(u.charAt(0)==="/")return(m?m[1]:"")+u;return base.replace(/[^/]*(?:\?.*)?$/,"")+u;}
function parseMaster(t,u){
  var lines=String(t||"").replace(/\r/g,"").split("\n"),out=[];
  for(var i=0;i<lines.length;i++){
    var l=lines[i].trim();if(l.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var rm=l.match(/RESOLUTION=(\d+)x(\d+)/i),next="";
    for(var j=i+1;j<lines.length;j++){var n=lines[j].trim();if(n&&n.charAt(0)!=="#"){next=n;break;}}
    if(next)out.push({url:abs(u,next),quality:rm?(parseInt(rm[2],10)+"p"):"Auto"});
  }
  return out;
}
function verifyHls(v){
  var h={"User-Agent":UA,"Origin":v.origin,"Referer":v.referer};
  return fetchOk(v.url,{headers:h},"Vidara HLS",10000).then(function(r){return r.text();}).then(function(t){
    if(t.indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    var vars=parseMaster(t,v.url);
    if(vars.length)return vars.map(function(x){return{url:x.url,quality:x.quality,headers:h};});
    var qm=t.match(/\/(2160|1440|1080|720|480|360)(?:p)?\//i);
    return[{url:v.url,quality:qm?(qm[1]+"p"):"Auto",headers:h}];
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  DIAG=[];mediaType=mediaType==="tv"?"tv":"movie";
  if(!tmdbId)return Promise.resolve(statusRows());
  if(mediaType==="tv"&&(!season||!episode)){diag("INPUT · missing season/episode");return Promise.resolve(statusRows());}
  var info,match,eid=mediaType==="tv"?Number(episode)||1:1;
  return tmdbInfo(String(tmdbId),mediaType).then(function(x){info=x;diag("TMDB · "+x.title);return findYesMovies(x,mediaType,season);})
    .then(function(x){match=x;return ployanS3(match.id,eid);})
    .then(function(embed){diag("S3 · "+embed.replace(/-\d{10}(?=$|[?#])/,"-<time>"));return validateAndResolveVidara(embed,info);})
    .then(verifyHls)
    .then(function(rows){
      if(!rows.length){diag("VERIFY · no HLS");return statusRows();}
      rows.sort(function(a,b){return(parseInt(b.quality,10)||0)-(parseInt(a.quality,10)||0);});
      return rows.map(function(x){var n="YesMovies S3 · Vidara · "+x.quality;return{name:n,title:n,url:x.url,quality:x.quality,type:"hls",provider:"yesmovies-s3-lab",headers:x.headers,subtitles:[]};});
    }).catch(function(e){diag("RUNTIME · "+(e&&e.message?e.message:e));return statusRows();});
}
module.exports={getStreams:getStreams};

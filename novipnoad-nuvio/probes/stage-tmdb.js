// NOVIPNOAD Stage 1: TMDB-only diagnostic
// NOVIPNOAD Local provider for Nuvio.
// First-party NOVIPNOAD search/detail pages + direct player resolver based on the
// public novipnoad-plugin protocol. Fails closed on ambiguous identity or decode errors.
var SITE_CANDIDATES=["https://www.novipnoad.ca"];
var PLAYER="https://player.novipnoad.net";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";
var FALLBACK_RC4_KEY="ce974576";
var DEFAULT_TMDB_API_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var DIAG=[];
function clean(v){return v==null?"":String(v).trim();}
function settings(){try{return typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS||{};}catch(e){return {};}}
function browserUa(){var s=settings(),u=clean(s.browserUserAgent);return u||UA;}
function browserCookie(){return clean(settings().browserCookie);}
function siteHeaders(ref,json){
  var h={
    "User-Agent":browserUa(),
    "Accept":json?"application/json,text/plain,*/*":"text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language":"zh-CN,zh;q=0.9,en;q=0.7",
    "Referer":ref||SITE_CANDIDATES[0]+"/"
  };
  var ck=browserCookie();if(ck)h["Cookie"]=ck;
  return h;
}
function safeUrl(u){u=clean(u);if(!/^https?:\/\/[^\s"'<>]+$/i.test(u)||u.length>4096)return false;var m=u.match(/^https?:\/\/([^/?#]+)/i),a=m&&m[1];if(!a||a.indexOf("@")>=0||a.charAt(0)==="[")return false;var h=a.split(":")[0].toLowerCase();if(!h||h.indexOf(".")<0||/^(?:localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(h))return false;return true;}
function headers(ref,json){return{"User-Agent":browserUa(),"Accept":json?"application/json,text/plain,*/*":"text/html,application/xhtml+xml,*/*;q=0.8","Accept-Language":"zh-CN,zh;q=0.9,en;q=0.7","Referer":ref||SITE_CANDIDATES[0]+"/"};}
function fetchText(url,h){
  if(!safeUrl(url))return Promise.reject(new Error("invalid URL"));
  var o={method:"GET",headers:h||{}};
  try{o.skipSizeCheck=true;}catch(e){}
  if(/novipnoad\.(?:ca|uk|net)|player\.novipnoad\.net/i.test(url)){
    try{o.credentials="include";}catch(e){}
    try{o.redirect="follow";}catch(e){}
  }
  return fetch(url,o).then(function(r){
    if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"unknown"));
    return r.text();
  });
}
function fetchJson(url,h){return fetchText(url,h).then(function(t){return JSON.parse(t);});}
function tmdbMeta(id,type){
  var key=clean(settings().tmdbApiKey);if(!key){try{key=clean(globalThis.TMDB_API_KEY);}catch(e){}}if(!key)key=DEFAULT_TMDB_API_KEY;
  var kind=type==="tv"?"tv":"movie",base="https://api.themoviedb.org/3/"+kind+"/"+encodeURIComponent(String(id));
  var zh=base+"?api_key="+encodeURIComponent(key)+"&language=zh-CN";
  var en=base+"?api_key="+encodeURIComponent(key)+"&language=en-US&append_to_response=translations,alternative_titles";
  return Promise.all([fetchJson(zh,{"Accept":"application/json"}),fetchJson(en,{"Accept":"application/json"})]).then(function(a){
    var z=a[0]||{},e=a[1]||{},d=clean(e.release_date||e.first_air_date||z.release_date||z.first_air_date),aliases=[];
    function add(v){v=clean(v);if(v&&aliases.indexOf(v)<0)aliases.push(v);}
    add(z.title||z.name);
    var trs=e.translations&&e.translations.translations||[];
    trs.forEach(function(t){
      if(!t||clean(t.iso_639_1).toLowerCase()!=="zh")return;
      var data=t.data||{};add(data.title||data.name);
    });
    var alt=e.alternative_titles||{},rows=alt.titles||alt.results||[];
    rows.forEach(function(t){
      var cc=clean(t&&t.iso_3166_1).toUpperCase();
      if(cc==="CN"||cc==="HK"||cc==="TW"||cc==="SG"||cc==="MO")add(t&&t.title);
    });
    return{
      zh:clean(z.title||z.name),
      en:clean(e.title||e.name),
      original:clean(e.original_title||e.original_name||z.original_title||z.original_name),
      aliases:aliases.slice(0,10),
      year:/^\d{4}/.test(d)?d.slice(0,4):""
    };
  }).catch(function(err){diag("TMDB · "+(err&&err.message||err));log("TMDB metadata: "+(err&&err.message||err));return null;});
}

function resultRow(label){
  return [{name:label,title:label,url:"https://example.com/"+encodeURIComponent(label)+".m3u8",quality:"Diag",type:"hls",provider:"novipnoad-stage-tmdb",headers:{},subtitles:[]}];
}
function getStreams(id,mediaType,season,episode){
  var timer=new Promise(function(resolve){setTimeout(function(){resolve({__timeout:true});},15000);});
  var work=tmdbMeta(id,mediaType).then(function(meta){return {meta:meta};}).catch(function(e){return {error:String(e&&e.message||e)};});
  return Promise.race([work,timer]).then(function(r){
    if(r&&r.__timeout)return resultRow("TMDB TIMEOUT");
    if(r&&r.error)return resultRow("TMDB FAIL · "+r.error);
    if(!r||!r.meta)return resultRow("TMDB FAIL · no meta");
    return resultRow("TMDB OK · "+(r.meta.en||r.meta.zh||r.meta.original||"?")+" · "+(r.meta.year||"?"));
  });
}
module.exports={getStreams:getStreams};

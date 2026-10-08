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
  if(!/^https?:\/\//i.test(u))return false;
  if(/^https?:\/\/(?:localhost|127\.|10\.|192\.168\.|0\.0\.0\.0|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(u))return false;
  return true;
}
function abs(u,base){
  u=clean(u).replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\\\//g,"/");
  if(u.indexOf("//")===0)u="https:"+u;
  if(u.charAt(0)==="/"&&base){var m=base.match(/^(https?:\/\/[^/]+)/);if(m)u=m[1]+u;}
  return safeUrl(u)?u:"";
}
function urlsFromText(html){
  var s=clean(html).replace(/\\\//g,"/").replace(/&amp;/g,"&");
  var out=[],re=/(?:https?:)?\/\/[^\s"'<>\\]+/gi,m;
  while((m=re.exec(s))!==null&&out.length<80){
    var u=abs(m[0].replace(/[),;]+$/,""),"");
    if(extType(u)&&out.indexOf(u)<0)out.push(u);
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
function tmdbImdb(id){
  var key=clean(settings().tmdbApiKey);
  if(!key)return Promise.resolve("");
  var u="https://api.themoviedb.org/3/movie/"+encodeURIComponent(String(id))+"/external_ids?api_key="+encodeURIComponent(key);
  return fetchText(u,{"Accept":"application/json"}).then(function(t){
    var j=JSON.parse(t),imdb=clean(j.imdb_id);
    return /^tt\d+$/.test(imdb)?imdb:"";
  }).catch(function(e){log("TMDB lookup: "+(e&&e.message||e));return"";});
}
function row(name,u,ref){
  var type=extType(u);if(!type)return null;
  return {name:name,title:name,url:u,quality:"Auto",type:type,provider:"vidplay-direct-lab",headers:requestHeaders(ref,false),subtitles:[]};
}
function getStreams(id,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie",tmdb=clean(id);
  if(!/^\d+$/.test(tmdb))return Promise.resolve([]);
  season=parseInt(season,10)||0;episode=parseInt(episode,10)||0;
  if(type==="tv"&&(!season||!episode))return Promise.resolve([]);
  return (type==="movie"?tmdbImdb(tmdb):Promise.resolve("")).then(function(imdb){
    var routes=[];
    for(var i=1;i<=3;i++){
      var v=i===1?"":String(i),source="VidPlay · V"+i,embed=type==="tv"?tmdb:(i===3?tmdb:imdb);
      if(!embed)continue;
      var action=type==="tv"?"tv_vplay":"mov_vplay";
      var u=BASE+"/ajax/"+action+v+".php?embed="+encodeURIComponent(embed);
      if(type==="tv")u+="&season="+season+"&episode="+episode;
      routes.push({name:source,url:u});
    }
    return Promise.all(routes.map(function(rt){
      return fetchText(rt.url,requestHeaders(BASE+"/",true)).then(function(html){
        if(/Just a moment|<title>Access denied|challenge-platform/i.test(html))throw new Error("Cloudflare challenge");
        return streamRows(html,rt.url,rt.name,2).then(function(entries){
          return entries.map(function(e){return row(rt.name,e.url,e.ref);}).filter(Boolean);
        });
      }).catch(function(err){log(rt.name+" unavailable: "+(err&&err.message||err));return[];});
    })).then(function(arr){
      var out=[],seen={};[].concat.apply([],arr).forEach(function(r){if(!r||seen[r.url])return;seen[r.url]=1;out.push(r);});
      log(type+" "+tmdb+" streams="+out.length);
      return out;
    });
  });
}
function onSettings(){
  return [
    {type:"header",label:"VidPlay Local · experimental"},
    {type:"info",label:"Only verified direct HLS/MP4/DASH URL shapes are returned. HTTP 403 / challenge / HTML embeds without media produce zero streams. No bypass. Movie V1/V2 require TMDB API key for IMDb ID; movie V3 and TV V1/V2/V3 use TMDB ID."},
    {type:"text",key:"tmdbApiKey",label:"TMDB API key (optional; required for movie V1/V2)",defaultValue:"",isPassword:true}
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

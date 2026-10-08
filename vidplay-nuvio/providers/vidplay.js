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
  var key=clean(settings().tmdbApiKey);
  if(!key){try{key=clean(globalThis.TMDB_API_KEY);}catch(e){}}
  if(!key)return Promise.resolve(null);
  var u="https://api.themoviedb.org/3/"+(type==="tv"?"tv":"movie")+
    "/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(key)+
    "&append_to_response=external_ids";
  return fetchText(u,{"Accept":"application/json"}).then(function(t){
    var j=JSON.parse(t);
    var released=clean(j.release_date||j.first_air_date);
    var imdb=clean((j.external_ids&&j.external_ids.imdb_id)||j.imdb_id);
    return {
      title:clean(j.title||j.name),
      original:clean(j.original_title||j.original_name),
      year:/^\d{4}/.test(released)?released.slice(0,4):"",
      imdb:/^tt\d+$/.test(imdb)?imdb:""
    };
  }).catch(function(e){log("TMDB metadata: "+(e&&e.message||e));return null;});
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
function row(name,u,ref){
  var type=extType(u);if(!type)return null;
  return {name:name,title:name,url:u,quality:"Auto",type:type,provider:"vidplay-direct-lab",headers:requestHeaders(ref,false),subtitles:[]};
}
function getStreams(id,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie",tmdb=clean(id);
  if(!/^\d+$/.test(tmdb))return Promise.resolve([]);
  season=parseInt(season,10)||0;episode=parseInt(episode,10)||0;
  if(type==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tmdbMeta(tmdb,type).then(function(meta){
    return discoverReferer(meta,type,season,episode).then(function(detailRef){
      var referer=detailRef||BASE+"/";
      var imdb=meta&&meta.imdb||"",routes=[];
      for(var i=1;i<=3;i++){
        var v=i===1?"":String(i),source="VidPlay · V"+i;
        var embed=type==="tv"?tmdb:(i===3?tmdb:imdb);
        if(!embed)continue;
        var action=type==="tv"?"tv_vplay":"mov_vplay";
        var u=BASE+"/ajax/"+action+v+".php?embed="+encodeURIComponent(embed);
        if(type==="tv")u+="&season="+season+"&episode="+episode;
        routes.push({name:source,url:u});
      }
      return Promise.all(routes.map(function(rt){
        return fetchText(rt.url,requestHeaders(referer,true)).then(function(html){
          if(/Just a moment|<title>Access denied|challenge-platform/i.test(html))throw new Error("Cloudflare challenge");
          return streamRows(html,rt.url,rt.name,2).then(function(entries){
            return entries.map(function(e){return row(rt.name,e.url,e.ref);}).filter(Boolean);
          });
        }).catch(function(err){log(rt.name+" unavailable: "+(err&&err.message||err));return[];});
      })).then(function(arr){
        var out=[],seen={};
        [].concat.apply([],arr).forEach(function(r){
          if(!r||seen[r.url])return;seen[r.url]=1;out.push(r);
        });
        log(type+" "+tmdb+" streams="+out.length+(detailRef?" matched-page-referer":" fallback-referer"));
        return out;
      });
    });
  });
}
function onSettings(){
  return [
    {type:"header",label:"VidPlay Local · experimental"},
    {type:"info",label:"Only explicitly identified direct HLS/MP4/DASH URL fields are returned (availability not guaranteed). HTTP 403 / challenge / HTML embeds without media produce zero streams. No bypass. Movie V1/V2 require TMDB API key for IMDb ID; movie V3 and TV V1/V2/V3 use TMDB ID."},
    {type:"text",key:"tmdbApiKey",label:"TMDB API key (optional; required for movie V1/V2)",defaultValue:"",isPassword:true}
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

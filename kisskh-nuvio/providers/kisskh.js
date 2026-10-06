// KissKH Local for Nuvio
// Direct resolver for the current KissKH JSON API.
// Flow: TMDB metadata -> KissKH search/detail -> episode id -> kkey -> direct HLS/MP4.
// No iframe/web-player fallback.

var BASES=[
  "https://kisskh.co",
  "https://kisskh.do",
  "https://kisskh.is",
  "https://kisskh.nl"
];

var TOKEN_API="https://enc-dec.app/api";
var DEFAULT_TMDB_API_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var VIDEO_GUID="62f176f3bb1b5b8e70e39932ad34a0c7";
var SUB_GUID="VgV52sWhwvBSf8BsM3BRY9weWiiCbtGp";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

var lookupCache={};
var tokenFnCache={};
var tokenJsCache={};

function clean(v){return v==null?"":String(v).trim();}
function now(){return Date.now?Date.now():(new Date()).getTime();}
function uniq(a){
  var out=[],seen={};
  (a||[]).forEach(function(v){
    v=clean(v); if(!v||seen[v])return; seen[v]=1;out.push(v);
  });
  return out;
}
function settings(){
  try{return (typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS)||{};}catch(_){return{};}
}
function tmdbKey(){
  var s=settings();
  var k=clean(s.tmdbApiKey);
  if(k)return k;
  try{
    k=clean(typeof globalThis!=="undefined"&&globalThis.TMDB_API_KEY);
    if(k)return k;
  }catch(_){}
  return DEFAULT_TMDB_API_KEY;
}
function hasTimers(){
  try{return typeof setTimeout==="function";}catch(_){return false;}
}
function timeout(p,ms,label){
  if(!hasTimers())return p;
  return Promise.race([
    p,
    new Promise(function(_,reject){
      setTimeout(function(){reject(new Error((label||"request")+" timeout"));},ms);
    })
  ]);
}
function baseHeaders(base,accept){
  return {
    "User-Agent":UA,
    "Accept":accept||"application/json, text/plain, */*",
    "Referer":base+"/",
    "Origin":base
  };
}
function doFetch(url,opt,ms,label){
  opt=opt||{};
  try{opt.skipSizeCheck=true;}catch(_){}
  return timeout(fetch(url,opt),ms||9000,label||url).then(function(r){
    if(!r||!r.ok)throw new Error((label||"HTTP")+" "+(r?r.status:"no-response"));
    return r;
  });
}
function getJson(url,opt,ms,label){
  return doFetch(url,opt,ms,label).then(function(r){
    return r.text().then(function(t){
      try{return JSON.parse(t);}catch(e){throw new Error((label||"JSON")+" invalid JSON");}
    });
  });
}
function getText(url,opt,ms,label){
  return doFetch(url,opt,ms,label).then(function(r){return r.text();});
}
function absUrl(base,v){
  v=clean(v);
  if(!v)return "";
  if(/^https?:\/\//i.test(v))return v;
  if(/^\/\//.test(v))return "https:"+v;
  if(v.charAt(0)==="/")return base+v;
  return base+"/"+v.replace(/^\.\//,"");
}
function lower(v){return clean(v).toLowerCase().replace(/\s+/g," ");}
function simple(v){
  return lower(v).replace(/[\u2010-\u2015]/g,"-").replace(/[^a-z0-9]+/g," ").replace(/^\s+|\s+$/g,"");
}
function tokens(v){
  return simple(v).split(" ").filter(function(x){return x.length>=2;});
}
function titleScore(found,wanted){
  var f=lower(found),w=lower(wanted);
  if(!f||!w)return 0;
  if(f===w)return 120;
  var fs=simple(found),ws=simple(wanted);
  if(fs&&ws&&fs===ws)return 115;
  if(f.indexOf(w)>=0||w.indexOf(f)>=0)return 80;
  var ft=tokens(found),wt=tokens(wanted),hit=0;
  wt.forEach(function(x){if(ft.indexOf(x)>=0)hit++;});
  return wt.length?Math.round(60*hit/wt.length):0;
}
function maxQuality(text){
  var s=String(text||""),m,max=0,re=/RESOLUTION=\d+x(\d+)/ig;
  while((m=re.exec(s))!==null){
    var h=parseInt(m[1],10)||0;if(h>max)max=h;
  }
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}
function mediaKind(url){
  url=clean(url);
  if(/\.m3u8(?:$|[?#])/i.test(url))return"hls";
  if(/\.mp4(?:$|[?#])/i.test(url))return"mp4";
  if(/\.mpd(?:$|[?#])/i.test(url))return"dash";
  return"";
}
function directMedia(url){return !!mediaKind(url);}

function getTmdbInfo(tmdbId,mediaType){
  var type=mediaType==="tv"?"tv":"movie";
  var key=tmdbKey();
  if(!key)return Promise.reject(new Error("TMDB API key unavailable"));
  var url="https://api.themoviedb.org/3/"+type+"/"+encodeURIComponent(String(tmdbId))+
    "?api_key="+encodeURIComponent(key)+"&append_to_response=external_ids&language=en-US";
  return getJson(url,{headers:{"User-Agent":UA,"Accept":"application/json"}},8000,"TMDB").then(function(j){
    var title=clean(j.title||j.name);
    var original=clean(j.original_title||j.original_name);
    var date=clean(j.release_date||j.first_air_date);
    if(!title&&!original)throw new Error("TMDB title missing");
    return {
      title:title||original,
      originalTitle:original,
      year:parseInt(date.slice(0,4),10)||0,
      imdbId:clean(j.external_ids&&j.external_ids.imdb_id)
    };
  });
}
function searchQueries(info,mediaType,season){
  var q=[];
  if(mediaType==="tv"&&Number(season)>1){
    q.push(info.title+" Season "+season);
    if(info.originalTitle&&lower(info.originalTitle)!==lower(info.title))q.push(info.originalTitle+" Season "+season);
  }
  q.push(info.title);
  if(info.originalTitle&&lower(info.originalTitle)!==lower(info.title))q.push(info.originalTitle);
  return uniq(q);
}
function searchBase(base,query){
  var url=base+"/api/DramaList/Search?q="+encodeURIComponent(query)+"&type=0";
  return getJson(url,{headers:baseHeaders(base)},7500,"KissKH search").then(function(j){
    if(!Array.isArray(j))return[];
    return j.map(function(x){
      return {
        id:x&&x.id,
        title:clean(x&&x.title),
        episodesCount:Number(x&&x.episodesCount)||0,
        thumbnail:clean(x&&x.thumbnail),
        base:base,
        query:query
      };
    }).filter(function(x){return x.id&&x.title;});
  }).catch(function(e){
    console.log("[KissKH] search "+base+" "+(e&&e.message?e.message:e));
    return[];
  });
}
function candidateScore(c,info,mediaType,season){
  var s=Math.max(titleScore(c.title,info.title),titleScore(c.title,info.originalTitle));
  if(mediaType==="movie"&&c.episodesCount===1)s+=12;
  if(mediaType==="tv"&&c.episodesCount>1)s+=12;
  if(mediaType==="tv"&&Number(season)>1){
    var t=lower(c.title);
    if(t.indexOf("season "+season)>=0||t.indexOf("s"+season)>=0)s+=22;
    if(lower(c.query).indexOf("season "+season)>=0)s+=8;
  }
  return s;
}
function getDetail(base,id){
  var url=base+"/api/DramaList/Drama/"+encodeURIComponent(String(id))+"?isq=false";
  return getJson(url,{headers:baseHeaders(base)},8000,"KissKH detail");
}
function detailYear(d){
  var y=parseInt(clean(d&&d.releaseDate).slice(0,4),10);
  return y||0;
}
function findBest(info,mediaType,season){
  var queries=searchQueries(info,mediaType,season),jobs=[];
  BASES.forEach(function(base){
    queries.forEach(function(q){jobs.push(searchBase(base,q));});
  });
  return Promise.all(jobs).then(function(rows){
    var all=[],seen={};
    (rows||[]).forEach(function(a){
      (a||[]).forEach(function(c){
        var k=c.base+"|"+c.id;
        if(seen[k]){
          if(candidateScore(c,info,mediaType,season)>candidateScore(seen[k],info,mediaType,season))seen[k]=c;
        }else seen[k]=c;
      });
    });
    Object.keys(seen).forEach(function(k){all.push(seen[k]);});
    all.sort(function(a,b){
      return candidateScore(b,info,mediaType,season)-candidateScore(a,info,mediaType,season);
    });
    all=all.slice(0,6);
    if(!all.length)throw new Error("no KissKH search match");
    return Promise.all(all.map(function(c){
      return getDetail(c.base,c.id).then(function(d){
        var s=candidateScore(c,info,mediaType,season);
        var y=detailYear(d);
        if(info.year&&y)s+=(info.year===y?25:-8);
        return{candidate:c,detail:d,score:s};
      }).catch(function(){return null;});
    }));
  }).then(function(rows){
    rows=(rows||[]).filter(Boolean).sort(function(a,b){return b.score-a.score;});
    if(!rows.length)throw new Error("KissKH detail lookup failed");
    var best=rows[0];
    if(best.score<35)throw new Error("KissKH title match too weak");
    return best;
  });
}
function chooseEpisode(detail,mediaType,episode){
  var a=detail&&Array.isArray(detail.episodes)?detail.episodes:[];
  if(!a.length)return null;
  if(mediaType==="movie"){
    var one=a.find?a.find(function(x){return Number(x&&x.number)===1;}):null;
    return one||a[0];
  }
  var want=Number(episode)||1;
  var exact=a.find?a.find(function(x){return Number(x&&x.number)===want;}):null;
  if(exact)return exact;
  var count=Number(detail&&detail.episodesCount)||a.length;
  return a[count-want]||null;
}
function lookupKey(tmdbId,mediaType,season,episode){
  return [mediaType,tmdbId,season||0,episode||0].join(":");
}
function resolveEpisode(tmdbId,mediaType,season,episode){
  var k=lookupKey(tmdbId,mediaType,season,episode);
  var hit=lookupCache[k];
  if(hit&&hit.expires>now())return Promise.resolve(hit.value);
  return getTmdbInfo(tmdbId,mediaType).then(function(info){
    return findBest(info,mediaType,season).then(function(best){
      var ep=chooseEpisode(best.detail,mediaType,episode);
      if(!ep||!ep.id)throw new Error("KissKH episode not found");
      var value={
        base:best.candidate.base,
        title:clean(best.detail.title)||info.title,
        kisskhId:best.candidate.id,
        episodeId:String(ep.id),
        episodeNumber:Number(ep.number)||Number(episode)||1,
        info:info
      };
      lookupCache[k]={expires:now()+4*60*60*1000,value:value};
      console.log("[KissKH] matched "+value.title+" id="+value.kisskhId+" epId="+value.episodeId+" base="+value.base);
      return value;
    });
  });
}

function remoteToken(episodeId,type){
  var url=TOKEN_API+"/enc-kisskh?text="+encodeURIComponent(String(episodeId))+
    "&type="+encodeURIComponent(type==="sub"?"sub":"vid");
  return getJson(url,{headers:{"User-Agent":UA,"Accept":"application/json"}},7000,"KissKH token").then(function(j){
    if(j&&Number(j.status)===200&&clean(j.result))return clean(j.result);
    throw new Error("token service rejected request");
  });
}
function commonScriptUrl(html,base){
  var m=String(html||"").match(/<script[^>]+src=["']([^"']*common[^"']*)["'][^>]*>/i);
  if(!m||!m[1])return"";
  return absUrl(base,m[1]);
}
function localTokenFn(base){
  if(tokenFnCache[base])return Promise.resolve(tokenFnCache[base]);
  var load=tokenJsCache[base]?Promise.resolve(tokenJsCache[base]):
    getText(base+"/index.html",{headers:baseHeaders(base,"text/html,*/*")},8000,"KissKH index")
      .then(function(html){
        var u=commonScriptUrl(html,base);
        if(!u)throw new Error("common script not found");
        return getText(u,{headers:baseHeaders(base,"application/javascript,*/*")},8000,"KissKH common JS");
      }).then(function(js){tokenJsCache[base]=js;return js;});
  return load.then(function(js){
    if(typeof Function!=="function")throw new Error("Function constructor unavailable");
    var getter=new Function(js+";return typeof _0x54b991==='function'?_0x54b991:null;");
    var fn=getter();
    if(typeof fn!=="function")throw new Error("local token function unavailable");
    tokenFnCache[base]=fn;
    return fn;
  });
}
function localToken(base,episodeId,type){
  var guid=type==="sub"?SUB_GUID:VIDEO_GUID;
  return localTokenFn(base).then(function(fn){
    var t=fn(Number(episodeId),null,"2.8.10",guid,4830201,
      "kisskh","kisskh","kisskh","kisskh","kisskh","kisskh");
    t=clean(t);
    if(!t)throw new Error("local token generation failed");
    return t;
  });
}
function getToken(base,episodeId,type){
  return remoteToken(episodeId,type).catch(function(e){
    console.log("[KissKH] remote token fallback: "+(e&&e.message?e.message:e));
    return localToken(base,episodeId,type);
  });
}

function subtitleLanguage(row){
  return clean(row&&row.land)||clean(row&&row.label)||"und";
}
function subtitleUrl(src){
  src=clean(src);
  if(!/^https?:\/\//i.test(src))return"";
  if(/\.txt(?:$|[?#])/i.test(src)){
    return TOKEN_API+"/dec-kisskh?url="+encodeURIComponent(src);
  }
  return src;
}
function getSubtitlesFor(resolved){
  var s=settings();
  if(s.includeSubtitles===false)return Promise.resolve([]);
  return getToken(resolved.base,resolved.episodeId,"sub").then(function(key){
    var url=resolved.base+"/api/Sub/"+encodeURIComponent(resolved.episodeId)+
      "?kkey="+encodeURIComponent(key);
    return getJson(url,{headers:baseHeaders(resolved.base)},10000,"KissKH subtitles");
  }).then(function(rows){
    if(!Array.isArray(rows))return[];
    return rows.slice(0,24).map(function(row,i){
      var u=subtitleUrl(row&&row.src);
      if(!u)return null;
      var lang=subtitleLanguage(row);
      return {
        id:"kisskh-"+resolved.episodeId+"-"+i,
        url:u,
        lang:lang,
        language:lang,
        name:clean(row&&row.label)||lang,
        title:clean(row&&row.label)||lang
      };
    }).filter(Boolean);
  }).catch(function(e){
    console.log("[KissKH] subtitles "+(e&&e.message?e.message:e));
    return[];
  });
}
function sourceUrls(data,base){
  var arr=[];
  ["Video","Video_tmp","ThirdParty"].forEach(function(k){
    var u=absUrl(base,data&&data[k]);
    if(u&&directMedia(u))arr.push(u);
  });
  return uniq(arr);
}
function playbackHeaders(base,light){
  var h={"User-Agent":UA,"Referer":base+"/"};
  if(!light)h.Origin=base;
  return h;
}
function verifyHls(url,base){
  var tryOnce=function(light){
    var h=playbackHeaders(base,light);
    return getText(url,{headers:h},7000,"KissKH HLS").then(function(body){
      if(String(body||"").indexOf("#EXTM3U")<0)throw new Error("not HLS");
      return{url:url,headers:h,quality:maxQuality(body),type:"hls"};
    });
  };
  return tryOnce(false).catch(function(){return tryOnce(true);});
}
function verifyFile(url,base,kind){
  var h=playbackHeaders(base,false);h.Range="bytes=0-31";
  return doFetch(url,{headers:h},7000,"KissKH media").then(function(){
    delete h.Range;
    return{url:url,headers:h,quality:"Auto",type:kind};
  }).catch(function(){
    var h2=playbackHeaders(base,true);h2.Range="bytes=0-31";
    return doFetch(url,{headers:h2},7000,"KissKH media").then(function(){
      delete h2.Range;
      return{url:url,headers:h2,quality:"Auto",type:kind};
    });
  });
}
function verifyMedia(url,base){
  var k=mediaKind(url);
  if(k==="hls")return verifyHls(url,base);
  if(k==="mp4"||k==="dash")return verifyFile(url,base,k);
  return Promise.reject(new Error("unsupported media"));
}

function resolveStreamRows(resolved){
  return getToken(resolved.base,resolved.episodeId,"vid").then(function(key){
    var url=resolved.base+"/api/DramaList/Episode/"+encodeURIComponent(resolved.episodeId)+
      ".png?err=false&ts=&time=&kkey="+encodeURIComponent(key);
    return getJson(url,{headers:baseHeaders(resolved.base)},12000,"KissKH stream");
  }).then(function(data){
    var urls=sourceUrls(data,resolved.base);
    if(!urls.length)throw new Error("KissKH returned no direct media");
    return Promise.all(urls.map(function(u){
      return verifyMedia(u,resolved.base).catch(function(e){
        console.log("[KissKH] verify "+u.slice(0,100)+" "+(e&&e.message?e.message:e));
        return null;
      });
    }));
  }).then(function(rows){
    rows=(rows||[]).filter(Boolean);
    if(!rows.length)throw new Error("KissKH direct media validation failed");
    return getSubtitlesFor(resolved).then(function(subs){
      return rows.map(function(r,i){
        var q=r.quality||"Auto";
        return {
          name:"KissKH Local",
          title:"KissKH · "+resolved.title+" · "+q+(rows.length>1?" · "+(i+1):""),
          url:r.url,
          quality:q,
          type:r.type,
          provider:"kisskh-direct",
          headers:r.headers,
          subtitles:subs
        };
      });
    });
  });
}

function getStreams(tmdbId,mediaType,season,episode){
  mediaType=mediaType==="tv"?"tv":"movie";
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  console.log("[KissKH] "+mediaType+" "+tmdbId+(mediaType==="tv"?" S"+season+"E"+episode:""));
  return resolveEpisode(String(tmdbId),mediaType,season,episode)
    .then(resolveStreamRows)
    .catch(function(e){
      console.log("[KissKH] "+(e&&e.message?e.message:e));
      return[];
    });
}

function getSubtitles(tmdbId,mediaType,season,episode){
  mediaType=mediaType==="tv"?"tv":"movie";
  if(!tmdbId)return Promise.resolve([]);
  return resolveEpisode(String(tmdbId),mediaType,season,episode)
    .then(getSubtitlesFor)
    .catch(function(){return[];});
}

function onSettings(){
  return [
    {type:"header",label:"KissKH Local"},
    {type:"info",label:"直接解析 KissKH 的剧集与媒体接口，不返回 iframe / 网页播放器。"},
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"用于把 Nuvio 的 TMDB ID 转成标题。留空时使用公共备用 Key；如公共 Key 被限流，可填写自己的 TMDB v3 Key。",
      defaultValue:"",
      isPassword:true
    },
    {
      type:"toggle",
      key:"includeSubtitles",
      label:"附带 KissKH 字幕",
      description:"直接字幕直接返回；KissKH 加密 .txt 字幕通过当前解密端点转换。",
      defaultValue:true
    }
  ];
}

module.exports={
  getStreams:getStreams,
  getSubtitles:getSubtitles,
  onSettings:onSettings
};

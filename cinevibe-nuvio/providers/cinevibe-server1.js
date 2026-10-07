// CineVibe Local for Nuvio
// v0.1.4
//
// CineVibe Server 1 compatibility path.
// Uses the current MovieBox official H5 runtime chain that works in Nuvio-like
// environments:
// TMDB -> H5 bootstrap -> subject search -> media-player/get-domain
// -> dynamic player domain -> subject/play -> direct streams.
//
// No fake diagnostic stream rows are returned. Failures are logged and return [].

var API_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff";
var SITE_ORIGIN = "https://moviebox.ph";
var SITE_HOST = "moviebox.ph";
var DEFAULT_TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36";
var CLIENT_INFO = '{"timezone":"Europe/Paris"}';
var MAX_STREAMS = 10;

function clean(v){ return v == null ? "" : String(v).trim(); }
function settings(){ try { return (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) || {}; } catch(_) { return {}; } }
function log(msg){ try { console.log("[CineVibe] " + msg); } catch(_) {} }

function tmdbKey(){
  var s=settings(), k=clean(s.tmdbApiKey);
  if(k) return k;
  try {
    k=clean(typeof globalThis!=="undefined" && globalThis.TMDB_API_KEY);
    if(k) return k;
  } catch(_) {}
  return DEFAULT_TMDB_API_KEY;
}

function normalize(v){
  try {
    return clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  } catch(_) {
    return clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  }
}

function copy(a){
  var o={},k;
  a=a||{};
  for(k in a) if(Object.prototype.hasOwnProperty.call(a,k)) o[k]=a[k];
  return o;
}

function merge(a,b){
  var o=copy(a),k;
  b=b||{};
  for(k in b) if(Object.prototype.hasOwnProperty.call(b,k)) o[k]=b[k];
  return o;
}

function baseHeaders(origin){
  origin=clean(origin||SITE_ORIGIN).replace(/\/$/,"");
  return {
    "User-Agent": UA,
    "Referer": origin + "/",
    "Origin": origin,
    "X-Client-Info": CLIENT_INFO,
    "X-Request-Lang": "en",
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
}

function fetchText(url,opt){
  opt=opt||{};
  try { opt.skipSizeCheck=true; } catch(_) {}
  try { opt.redirect="follow"; } catch(_) {}
  return fetch(url,opt).then(function(r){
    if(!r || !r.ok) throw new Error("HTTP " + (r ? r.status : "no-response"));
    return r.text().then(function(t){
      return { response:r, text:t, url:clean(r.url||url) };
    });
  });
}

function parseJson(t){
  try { return JSON.parse(t); } catch(_) { return {}; }
}

function request(state,url,opt,origin){
  origin=clean(origin||SITE_ORIGIN).replace(/\/$/,"");
  opt=opt||{};
  var x=copy(opt);
  var h=merge(baseHeaders(origin),x.headers||{});
  if(state.token) h.Authorization="Bearer " + state.token;
  x.headers=h;

  return fetchText(url,x).then(function(r){
    try {
      var xu=r.response && r.response.headers && r.response.headers.get && r.response.headers.get("x-user");
      if(xu){
        var j=JSON.parse(xu);
        if(j && j.token) state.token=clean(j.token);
      }
    } catch(_) {}
    return {
      response:r.response,
      json:parseJson(r.text),
      text:r.text,
      url:r.url
    };
  });
}

function getTmdbInfo(tmdbId,mediaType){
  var type=mediaType==="tv"?"tv":"movie";
  var url="https://api.themoviedb.org/3/"+type+"/"+encodeURIComponent(String(tmdbId))+
    "?api_key="+encodeURIComponent(tmdbKey())+"&language=en-US";
  return fetchText(url,{headers:{"User-Agent":UA,"Accept":"application/json"}}).then(function(r){
    var d=parseJson(r.text);
    var title=clean(d.title||d.name||d.original_title||d.original_name);
    var date=clean(d.release_date||d.first_air_date);
    var year=parseInt(date.slice(0,4),10)||0;
    if(!title) throw new Error("TMDB title missing");
    return {title:title,year:year};
  });
}

function resultRows(j){
  var d=j&&j.data||{};
  if(Array.isArray(d.items)) return d.items;
  if(Array.isArray(d.list)) return d.list;
  return [];
}

function pickSubject(items,info,mediaType){
  var want=normalize(info.title), year=Number(info.year)||0;
  var targetTypes=mediaType==="tv"?[2,3]:[1];
  var best=null,bestScore=-999;

  (items||[]).forEach(function(x){
    x=x||{};
    var st=parseInt(x.subjectType,10)||0;
    if(targetTypes.indexOf(st)<0) return;

    var got=normalize(x.title);
    var score=-1;
    if(got===want) score=120;
    else if(got&&want&&(got.indexOf(want)>=0||want.indexOf(got)>=0)) score=80;
    if(score<0) return;

    var date=clean(x.releaseDate||x.release_date);
    var y=parseInt(date.slice(0,4),10)||0;
    if(year&&y){
      if(year===y) score+=25;
      else score-=40;
    }
    if(x.hasResource===true) score+=5;

    if(score>bestScore){ best=x; bestScore=score; }
  });

  return bestScore>=80 ? best : null;
}

function mediaTypeFromUrl(u){
  var s=clean(u).toLowerCase().split("?")[0];
  if(/\.m3u8$/.test(s)) return "hls";
  if(/\.mpd$/.test(s)) return "dash";
  return "mp4";
}

function qualityLabel(x){
  var q=clean(x && (x.resolutions||x.resolution||x.quality||x.label||"HD"));
  var m=q.match(/(2160|1440|1080|720|480|360|240)/);
  if(m) return m[1]==="2160"?"4K":m[1]+"p";
  return q||"HD";
}

function mediaRows(data,referer){
  var sets=[data&&data.streams,data&&data.hls,data&&data.dash];
  var out=[],seen={};

  for(var si=0;si<sets.length;si++){
    var a=Array.isArray(sets[si])?sets[si]:[];
    for(var i=0;i<a.length;i++){
      var x=a[i]||{};
      var u=clean(x.url||x.path||x.file||x.streamUrl);
      if(!/^https?:\/\//i.test(u)||seen[u]) continue;
      if(x.vipLocked===true) continue;
      seen[u]=1;

      var q=qualityLabel(x);
      var lang=clean(x.language||x.lang||x.audio||x.audioTrack||x.dub||"Original");
      out.push({
        name:"CineVibe · Server 1",
        title:"CineVibe · Server 1 · "+q+(lang&&lang!=="Original"?" · "+lang:""),
        url:u,
        quality:q,
        language:lang,
        type:mediaTypeFromUrl(u),
        provider:"cinevibe-server1",
        isDirect:true,
        headers:{
          "User-Agent":UA,
          "Referer":referer
        },
        subtitles:[]
      });
      if(out.length>=MAX_STREAMS) return out;
    }
  }
  return out;
}

function resolveMovieBox(tmdbId,mediaType,season,episode){
  var state={token:""};
  var started=Date.now();

  return Promise.all([
    getTmdbInfo(tmdbId,mediaType),
    request(state,API_BASE+"/home?host="+encodeURIComponent(SITE_HOST),{},SITE_ORIGIN)
  ]).then(function(pair){
    var info=pair[0], boot=pair[1];
    if(!info||!info.title) throw new Error("identity failed");
    if(!boot) throw new Error("bootstrap failed");
    if(!state.token) throw new Error("bootstrap returned no x-user token");

    log("BOOT ok · "+info.title+" · token=yes");

    return request(
      state,
      API_BASE+"/subject/search",
      {
        method:"POST",
        body:JSON.stringify({keyword:info.title,page:1,perPage:20})
      },
      SITE_ORIGIN
    ).then(function(search){
      if(!search) throw new Error("search failed");
      var items=resultRows(search.json);
      log("SEARCH · "+items.length+" results");

      var subject=pickSubject(items,info,mediaType);
      if(!subject) throw new Error("no strong title match");

      var sid=clean(subject.subjectId);
      var detail=clean(subject.detailPath);
      if(!sid||!detail) throw new Error("matched item missing id/path");

      log("MATCH · "+clean(subject.title)+" · "+sid);

      return request(
        state,
        API_BASE+"/media-player/get-domain",
        {},
        SITE_ORIGIN
      ).then(function(dom){
        var domain=clean(dom&&dom.json&&dom.json.data).replace(/\/$/,"");
        if(!domain) throw new Error("media-player/get-domain empty");

        log("DOMAIN · "+domain);

        var ref=domain+"/spa/videoPlayPage/movies/"+detail+
          "?id="+encodeURIComponent(sid)+
          "&type=/movie/detail"+
          "&detailSe="+encodeURIComponent(String(season||0))+
          "&detailEp="+encodeURIComponent(String(episode||0))+
          "&lang=en";

        var playUrl=domain+"/wefeed-h5api-bff/subject/play?subjectId="+
          encodeURIComponent(sid)+
          "&se="+encodeURIComponent(String(season||0))+
          "&ep="+encodeURIComponent(String(episode||0))+
          "&detailPath="+encodeURIComponent(detail);

        return request(
          state,
          playUrl,
          {
            headers:{
              "Referer":ref,
              "Origin":domain,
              "X-Source":""
            }
          },
          domain
        ).then(function(play){
          var data=play&&play.json&&play.json.data||{};
          if(!data.hasResource) throw new Error("play hasResource=false");

          var rows=mediaRows(data,ref);
          if(!rows.length) throw new Error("play returned no direct media");

          log("OK · "+rows.length+" streams · "+(Date.now()-started)+"ms");
          return rows;
        });
      });
    });
  });
}

function getStreams(tmdbId,mediaType,season,episode){
  mediaType=mediaType==="tv"?"tv":"movie";
  season=parseInt(season,10)||0;
  episode=parseInt(episode,10)||0;

  if(!tmdbId) return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode)) return Promise.resolve([]);

  log(mediaType+" "+tmdbId+(mediaType==="tv"?" S"+season+"E"+episode:""));

  return resolveMovieBox(String(tmdbId),mediaType,season,episode).catch(function(e){
    log("FAIL · "+(e&&e.message?e.message:e));
    return [];
  });
}

function onSettings(){
  return [
    {type:"header",label:"CineVibe Local · Server 1"},
    {
      type:"info",
      label:"使用 MovieBox 当前 H5 动态播放域名链路：bootstrap → search → get-domain → subject/play。"
    },
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"留空使用备用 Key；如遇 TMDB 限流可填写自己的 v3 API Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}

module.exports={
  getStreams:getStreams,
  onSettings:onSettings
};

// NoctraTV · Nesterov — current direct resolver.
//
// ZStream native reverse-engineering (2026-10) shows the Nesterov resolver uses
// the NextGenCloud/VaPlayer data shape:
//   ?tmdb=<id>&type=movie
//   ?tmdb=<id>&type=tv&season=<s>&episode=<e>
// and reads data.stream_urls plus subtitle fields.
//
// The player origin is nextgencloudfabric.com; the current data endpoint is
// streamdata.vaplayer.ru/api.php. No iframe, legacy Helios/AES envelope,
// WebAssembly, or external player fallback is used here.

var API="https://streamdata.vaplayer.ru/api.php";
var ORIGIN="https://nextgencloudfabric.com";
var REFERER=ORIGIN+"/";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}

function headers(){
  return {
    "User-Agent":UA,
    "Origin":ORIGIN,
    "Referer":REFERER,
    "Accept":"application/json, text/plain, */*"
  };
}

function hasTimers(){
  try{return typeof setTimeout==="function"&&typeof clearTimeout==="function";}catch(_){return false;}
}

function withTimeout(p,ms,label){
  if(!hasTimers())return p;
  return new Promise(function(resolve,reject){
    var done=false;
    var t=setTimeout(function(){
      if(done)return;
      done=true;
      reject(new Error(label+" timeout"));
    },ms);
    Promise.resolve(p).then(function(v){
      if(done)return;
      done=true;clearTimeout(t);resolve(v);
    },function(e){
      if(done)return;
      done=true;clearTimeout(t);reject(e);
    });
  });
}

function apiUrl(tmdbId,mediaType,season,episode){
  var q="tmdb="+encodeURIComponent(String(tmdbId))+
    "&type="+encodeURIComponent(mediaType==="tv"?"tv":"movie");
  if(mediaType==="tv"){
    q+="&season="+encodeURIComponent(String(season||1))+
      "&episode="+encodeURIComponent(String(episode||1));
  }
  return API+"?"+q;
}

function maxQuality(text){
  var s=String(text||""),m,max=0,re=/RESOLUTION=\d+x(\d+)/ig;
  while((m=re.exec(s))!==null){
    var h=parseInt(m[1],10)||0;
    if(h>max)max=h;
  }
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}

function normalizeSubs(json){
  var src=[];
  if(Array.isArray(json&&json.default_subs))src=json.default_subs;
  else if(json&&json.data&&Array.isArray(json.data.subtitles))src=json.data.subtitles;
  return src.filter(function(x){
    return x&&/^https?:\/\//i.test(clean(x.url||x.file));
  }).slice(0,12).map(function(x){
    var url=clean(x.url||x.file);
    var lang=clean(x.language||x.lang||x.label||x.code)||"Unknown";
    return {
      url:url,
      language:lang,
      name:lang+" [Nesterov]"
    };
  });
}

function verify(url,index,subs){
  var h=headers();
  return withTimeout(fetch(url,{headers:h}),8000,"HLS "+(index+1))
    .then(function(r){
      if(!r.ok)throw new Error("HLS HTTP "+r.status);
      return r.text();
    })
    .then(function(body){
      if(String(body||"").indexOf("#EXTM3U")<0)throw new Error("not HLS");
      var q=maxQuality(body);
      var title="NoctraTV · Nesterov · HLS "+(index+1)+" · "+q;
      return {
        name:title,
        title:title,
        url:url,
        quality:q,
        type:"hls",
        provider:"noctra-nesterov",
        headers:h,
        subtitles:subs
      };
    })
    .catch(function(e){
      console.log("[NoctraTV/Nesterov] stream "+(index+1)+" "+(e&&e.message?e.message:e));
      return null;
    });
}

function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);

  var url=apiUrl(tmdbId,mediaType,season,episode);
  return withTimeout(fetch(url,{headers:headers()}),9000,"Nesterov API")
    .then(function(r){
      if(!r.ok)throw new Error("API HTTP "+r.status);
      return r.json();
    })
    .then(function(json){
      var data=json&&json.data&&typeof json.data==="object"?json.data:{};
      var urls=Array.isArray(data.stream_urls)?data.stream_urls:[];
      urls=urls.map(clean).filter(function(u){return /^https?:\/\//i.test(u);});
      var subs=normalizeSubs(json);
      return Promise.all(urls.map(function(u,i){return verify(u,i,subs);}));
    })
    .then(function(rows){
      var out=[],seen={};
      (rows||[]).forEach(function(x){
        if(!x||!x.url||seen[x.url])return;
        seen[x.url]=1;out.push(x);
      });
      console.log("[NoctraTV/Nesterov] "+mediaType+" "+tmdbId+" streams="+out.length);
      return out;
    })
    .catch(function(e){
      console.log("[NoctraTV/Nesterov] "+(e&&e.message?e.message:e));
      return [];
    });
}

module.exports={
  getStreams:getStreams,
  apiUrl:apiUrl,
  maxQuality:maxQuality
};

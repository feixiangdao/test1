var ENC_API="https://enc-dec.app/api";
var VIDLINK_API="https://vidlink.pro/api/b";
var H={
  "User-Agent":"Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36",
  "Accept":"application/json,*/*",
  "Referer":"https://vidlink.pro/",
  "Origin":"https://vidlink.pro"
};

function requestJson(url){
  return fetch(url,{headers:H}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  });
}
function quality(v){
  var s=String(v||"").toLowerCase();
  if(s.indexOf("2160")>=0||s.indexOf("4k")>=0)return"2160p";
  if(s.indexOf("1440")>=0||s.indexOf("2k")>=0)return"1440p";
  if(s.indexOf("1080")>=0||s.indexOf("fhd")>=0)return"1080p";
  if(s.indexOf("720")>=0||s.indexOf("hd")>=0)return"720p";
  if(s.indexOf("480")>=0||s.indexOf("sd")>=0)return"480p";
  if(s.indexOf("360")>=0)return"360p";
  var m=s.match(/(\d{3,4})p?/);
  return m?m[1]+"p":"Auto";
}
function collect(data){
  var out=[],seen={};
  var rawSubs=(data&&data.subtitles)||(data&&data.stream&&data.stream.subtitles)||(data&&data.captions)||[];
  var subs=[];
  if(Array.isArray(rawSubs))rawSubs.forEach(function(x){
    if(x&&x.url)subs.push({url:x.url,language:x.language||x.lang||x.label||"Unknown",name:x.name||x.label||x.language||x.lang||"Unknown",headers:H});
  });
  function add(url,q,label){
    if(!url||typeof url!=="string"||!/^https?:\/\//i.test(url)||seen[url])return;
    seen[url]=1;
    var qq=quality(q||label||url);
    out.push({name:"NoctraTV · VidLink · "+qq,title:"VidLink · "+qq,url:url,quality:qq,provider:"noctra-vidlink",headers:H,subtitles:subs});
  }
  if(data&&data.stream&&data.stream.qualities&&typeof data.stream.qualities==="object"){
    Object.keys(data.stream.qualities).forEach(function(k){
      var x=data.stream.qualities[k];
      if(x)add(x.url,k,k);
    });
  }
  if(data&&data.url)add(data.url,data.quality||data.resolution||data.label,"direct");
  [data&&data.streams,data&&data.links].forEach(function(a){
    if(Array.isArray(a))a.forEach(function(x){if(x)add(x.url,x.quality||x.resolution||x.label||x.name,"list");});
  });
  if(data&&data.stream&&data.stream.playlist)add(data.stream.playlist,"Auto","playlist");
  return out;
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return requestJson(ENC_API+"/enc-vidlink?text="+encodeURIComponent(String(tmdbId)))
    .then(function(j){
      if(!j||!j.result)throw new Error("encrypt result missing");
      var p=mediaType==="tv"
        ?"/tv/"+encodeURIComponent(j.result)+"/"+encodeURIComponent(String(season))+"/"+encodeURIComponent(String(episode))
        :"/movie/"+encodeURIComponent(j.result);
      return requestJson(VIDLINK_API+p);
    })
    .then(function(j){return collect(j);})
    .catch(function(e){console.error("[NoctraTV/VidLink] "+(e&&e.message?e.message:e));return[];});
}

module.exports={getStreams:getStreams,collect:collect,quality:quality};

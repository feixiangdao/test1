var VIDNEST="https://new.vidnest.fun";
var UA="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36";
var ALPH="RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";

var MOVIE_BACKENDS=[
  {name:"Videasy",path:"videasy"},
  {name:"HollyMovieHD",path:"hollymoviehd"}
];
var TV_BACKENDS=[
  {name:"KlikXXI",path:"klikxxi"},
  {name:"Videasy",path:"videasy"},
  {name:"HollyMovieHD",path:"hollymoviehd"}
];

function clean(v){return v==null?"":String(v).trim();}
function utf8Decode(bytes){
  var out="",i=0;
  while(i<bytes.length){
    var c=bytes[i++];
    if(c<128){out+=String.fromCharCode(c);continue;}
    if((c&224)===192&&i<bytes.length){
      var c2=bytes[i++];out+=String.fromCharCode(((c&31)<<6)|(c2&63));continue;
    }
    if((c&240)===224&&i+1<bytes.length){
      var c2b=bytes[i++],c3=bytes[i++];out+=String.fromCharCode(((c&15)<<12)|((c2b&63)<<6)|(c3&63));continue;
    }
    if((c&248)===240&&i+2<bytes.length){
      var c2c=bytes[i++],c3b=bytes[i++],c4=bytes[i++],cp=((c&7)<<18)|((c2c&63)<<12)|((c3b&63)<<6)|(c4&63);
      cp-=65536;out+=String.fromCharCode(55296+(cp>>10),56320+(cp&1023));
    }
  }
  return out;
}
function decrypt(data){
  data=clean(data);if(!data)return null;
  var lookup={},i;for(i=0;i<ALPH.length;i++)lookup[ALPH.charAt(i)]=i;
  var bytes=[];
  for(i=0;i<data.length;i+=4){
    var chunk=(data.slice(i,i+4)+"====").slice(0,4),v=[],j;
    for(j=0;j<4;j++)v[j]=Object.prototype.hasOwnProperty.call(lookup,chunk.charAt(j))?lookup[chunk.charAt(j)]:64;
    bytes.push(((v[0]<<2)|(v[1]>>4))&255);
    if(v[2]!==64)bytes.push((((v[1]&15)<<4)|(v[2]>>2))&255);
    if(v[3]!==64)bytes.push((((v[2]&3)<<6)|v[3])&255);
  }
  var text=utf8Decode(bytes);
  try{return JSON.parse(text);}catch(e){
    var m=text.match(/\{[\s\S]*\}/);
    if(m)try{return JSON.parse(m[0]);}catch(_){}
    return null;
  }
}
function copyHeaders(src){
  var out={"User-Agent":UA,"Referer":"https://vidnest.fun/","Origin":"https://vidnest.fun"};
  if(src&&typeof src==="object"){
    Object.keys(src).forEach(function(k){out[k]=String(src[k]);});
  }
  return out;
}
function isDirectMedia(url,type){
  url=clean(url).toLowerCase();type=clean(type).toLowerCase();
  if(!/^https?:\/\//.test(url))return false;
  if(type==="mp4")return true;
  if(type==="hls"&&(/\.m3u8(?:[?#]|$)/.test(url)||/\/hls\//.test(url)||/\.txt(?:[?#]|$)/.test(url)||/goodstream\.cc\//.test(url)))return true;
  return /\.(m3u8|mp4)(?:[?#]|$)/.test(url);
}
function addCandidate(out,x,backend){
  if(!x||typeof x!=="object")return;
  var url=clean(x.url||x.link);
  var type=clean(x.type)||(/\.mp4(?:[?#]|$)/i.test(url)?"mp4":"hls");
  if(!isDirectMedia(url,type))return;
  var q=clean(x.quality||x.resolution)||"Auto";
  var headers=copyHeaders(x.headers);
  var name="OnlyFlix · NontonGo · "+backend+" · "+q;
  out.push({name:name,title:name,url:url,quality:q,type:type==="mp4"?"mp4":"hls",provider:"onlyflix-nontongo",headers:headers,subtitles:[]});
}
function extract(data,backend){
  var out=[],i;
  if(!data||typeof data!=="object")return out;
  if(Array.isArray(data.sources))for(i=0;i<data.sources.length;i++)addCandidate(out,data.sources[i],backend);
  if(Array.isArray(data.streams))for(i=0;i<data.streams.length;i++)addCandidate(out,data.streams[i],backend);
  if(Array.isArray(data.url))for(i=0;i<data.url.length;i++)addCandidate(out,data.url[i],backend);
  else if(typeof data.url==="string")addCandidate(out,{url:data.url,type:data.type,quality:data.quality,headers:data.headers},backend);
  if(data.data&&Array.isArray(data.data.downloads))for(i=0;i<data.data.downloads.length;i++)addCandidate(out,data.data.downloads[i],backend);
  return out;
}
function resolveBackend(tmdbId,mediaType,season,episode,b){
  var path=mediaType==="tv"
    ?"/"+b.path+"/tv/"+encodeURIComponent(String(tmdbId))+"/"+encodeURIComponent(String(season||1))+"/"+encodeURIComponent(String(episode||1))
    :"/"+b.path+"/movie/"+encodeURIComponent(String(tmdbId));
  return fetch(VIDNEST+path,{headers:{
    "User-Agent":"Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Accept":"application/json, */*",
    "Origin":"https://vidnest.fun",
    "Referer":"https://vidnest.fun/"
  }}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);
    return r.json();
  }).then(function(j){
    var data=j&&j.encrypted?decrypt(j.data):j;
    return extract(data,b.name);
  }).catch(function(e){
    console.log("[OnlyFlix/NontonGo] "+b.name+" "+(e&&e.message?e.message:e));
    return[];
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var list=mediaType==="tv"?TV_BACKENDS:MOVIE_BACKENDS;
  var i=0;
  function next(){
    if(i>=list.length)return Promise.resolve([]);
    var b=list[i++];
    return resolveBackend(tmdbId,mediaType,season,episode,b).then(function(rows){
      if(rows&&rows.length){
        console.log("[OnlyFlix/NontonGo] "+b.name+" streams="+rows.length);
        return rows;
      }
      return next();
    });
  }
  return next();
}
module.exports={getStreams:getStreams};

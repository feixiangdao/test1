var UA="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
var MAIN="https://nontongo.win";
var VIDNEST="https://new.vidnest.fun";
var VIDNEST_ALPH="RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
var VIDNEST_BACKENDS_TV=[
  {name:"KlikXXI",path:"klikxxi"},
  {name:"Videasy",path:"videasy"},
  {name:"HollyMovieHD",path:"hollymoviehd"},
  {name:"MovieBox",path:"moviebox"}
];
var VIDNEST_BACKENDS_MOVIE=[
  {name:"Videasy",path:"videasy"},
  {name:"HollyMovieHD",path:"hollymoviehd"},
  {name:"KlikXXI",path:"klikxxi"},
  {name:"MovieBox",path:"moviebox"}
];

function clean(v){return v==null?"":String(v).trim();}
function absUrl(base,ref){
  ref=clean(ref);
  if(/^https?:\/\//i.test(ref))return ref;
  try{return new URL(ref,base).toString();}catch(e){return ref;}
}
function stdQuality(w,h){
  w=parseInt(w||0,10)||0;h=parseInt(h||0,10)||0;
  if(w>=3500||h>=1800)return"2160p";
  if(w>=2400||h>=1300)return"1440p";
  if(w>=1800||h>=1000)return"1080p";
  if(w>=1200||h>=650)return"720p";
  if(w>=800||h>=440)return"480p";
  if(w>=600||h>=320)return"360p";
  if(w>=400||h>=220)return"240p";
  return h>0?(h+"p"):"Unknown";
}
function qualityDetail(v){
  return v.width&&v.height?v.quality+" ("+v.width+"×"+v.height+")":v.quality;
}
function parseMaster(text,masterUrl){
  var lines=String(text||"").replace(/\r/g,"").split("\n"),out=[];
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var attrs=line.slice(18),rm=attrs.match(/RESOLUTION=(\d+)x(\d+)/i),bm=attrs.match(/BANDWIDTH=(\d+)/i),uri="";
    for(var j=i+1;j<lines.length;j++){
      var n=lines[j].trim();
      if(!n||n.charAt(0)==="#")continue;
      uri=n;break;
    }
    if(!uri)continue;
    var w=rm?parseInt(rm[1],10):0,h=rm?parseInt(rm[2],10):0;
    out.push({url:absUrl(masterUrl,uri),width:w,height:h,quality:stdQuality(w,h),bandwidth:bm?parseInt(bm[1],10):0});
  }
  return out;
}
function cookieFromResponse(r){
  try{
    var s=clean(r.headers&&r.headers.get?r.headers.get("set-cookie"):"");
    var m=s.match(/PHPSESSID=([^;,\s]+)/i);
    return m?"PHPSESSID="+m[1]:"";
  }catch(e){return"";}
}
function warmMain(){
  return fetch(MAIN+"/",{headers:{"User-Agent":UA,"Accept":"text/html,*/*"}})
    .then(function(r){return cookieFromResponse(r);})
    .catch(function(){return"";});
}
function jsUnescape(s){
  return String(s||"")
    .replace(/\\x([0-9a-fA-F]{2})/g,function(_,h){return String.fromCharCode(parseInt(h,16));})
    .replace(/\\u([0-9a-fA-F]{4})/g,function(_,h){return String.fromCharCode(parseInt(h,16));})
    .replace(/\\n/g,"\n").replace(/\\r/g,"\r").replace(/\\t/g,"\t")
    .replace(/\\'/g,"'").replace(/\\\"/g,'"').replace(/\\\\/g,"\\");
}
function unpackPacker(html){
  html=String(html||"");
  var start=html.indexOf("eval(function(p,a,c,k,e,d)");
  if(start<0)return"";
  var end=html.indexOf("</script>",start);
  if(end<0)end=html.length;
  var block=html.slice(start,end).trim();
  if(block.charAt(block.length-1)===";")block=block.slice(0,-1);
  var marker="}('";
  var p0=block.indexOf(marker);
  if(p0<0)return"";
  var argStart=p0+marker.length;
  function readQuoted(pos){
    var out="",esc=false;
    for(var i=pos;i<block.length;i++){
      var ch=block.charAt(i);
      if(esc){out+="\\"+ch;esc=false;continue;}
      if(ch==="\\"){esc=true;continue;}
      if(ch==="'")return{value:out,end:i};
      out+=ch;
    }
    return null;
  }
  var first=readQuoted(argStart);
  if(!first)return"";
  var rest=block.slice(first.end+1);
  var nums=rest.match(/^,(\d+),(\d+),'/);
  if(!nums)return"";
  var radix=parseInt(nums[1],10),count=parseInt(nums[2],10);
  var dictPos=first.end+1+nums[0].length;
  var fourth=readQuoted(dictPos);
  if(!fourth)return"";
  var packed=jsUnescape(first.value),dict=jsUnescape(fourth.value).split("|");
  while(count--){
    if(dict[count]){
      var token=count.toString(radix);
      packed=packed.replace(new RegExp("\\b"+token+"\\b","g"),dict[count]);
    }
  }
  return packed;
}
function parseLinks(unpacked){
  var m=String(unpacked||"").match(/var\s+links\s*=\s*(\{[^;]+\})/);
  if(!m)return{};
  try{return JSON.parse(m[1]);}catch(e){return{};}
}
function decodeAtobIframe(html){
  var s=String(html||"");
  var m=s.match(/innerHTML\s*=\s*atob\(["']([^"']+)["']\)/i);
  if(!m)return"";
  try{
    var inner=atob(m[1]);
    var im=inner.match(/<iframe[^>]+src=["']([^"']+)/i);
    return im?im[1]:"";
  }catch(e){return"";}
}
function directIframe(html){
  var m=String(html||"").match(/<iframe[^>]+src=["']([^"']+)/i);
  return m?m[1]:"";
}
function expandHls(url,headers,label){
  headers=headers||{"User-Agent":UA};
  return fetch(url,{headers:headers}).then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text();
  }).then(function(text){
    if(String(text||"").indexOf("#EXTM3U")<0)throw new Error("not HLS");
    var vars=parseMaster(text,url);
    if(vars.length){
      return vars.map(function(v){
        var detail=qualityDetail(v),name="OnlyFlix · NontonGo · "+label+" · "+detail;
        return{name:name,title:name,url:v.url,quality:v.quality,type:"hls",provider:"onlyflix-nontongo",headers:headers,subtitles:[]};
      });
    }
    var name="OnlyFlix · NontonGo · "+label+" · HLS";
    return[{name:name,title:name,url:url,quality:"Unknown",type:"hls",provider:"onlyflix-nontongo",headers:headers,subtitles:[]}];
  }).catch(function(){return[];});
}
function chooseVibuxerHls(links,iframeUrl){
  var order=["hls2","hls4","hls3"],i=0;
  function next(){
    if(i>=order.length)return Promise.resolve([]);
    var key=order[i++],u=clean(links&&links[key]);
    if(!/^https?:\/\//i.test(u))return next();
    var h={"User-Agent":UA,"Referer":iframeUrl,"Accept":"application/vnd.apple.mpegurl,application/x-mpegURL,*/*"};
    return expandHls(u,h,"MIX").then(function(rows){return rows.length?rows:next();});
  }
  return next();
}
function resolveMovieMain(tmdb){
  return warmMain().then(function(cookie){
    var view=MAIN+"/stream/movie_upcloud/view1.php?id="+encodeURIComponent(tmdb)+"&type=movie";
    var h={"User-Agent":UA,"Referer":MAIN+"/","Accept":"text/html,*/*"};
    if(cookie)h.Cookie=cookie;
    return fetch(view,{headers:h}).then(function(r){
      if(!r.ok)throw new Error("view1 "+r.status);
      return r.text();
    }).then(function(html){
      var iframe=decodeAtobIframe(html)||directIframe(html);
      if(!iframe)throw new Error("vibuxer iframe missing");
      return fetch(iframe,{headers:{"User-Agent":UA,"Referer":view,"Accept":"text/html,*/*"}})
        .then(function(r){if(!r.ok)throw new Error("vibuxer "+r.status);return r.text();})
        .then(function(vhtml){
          var unpacked=unpackPacker(vhtml),links=parseLinks(unpacked);
          return chooseVibuxerHls(links,iframe);
        });
    });
  }).catch(function(e){
    console.log("[NontonGo/MIX] "+(e&&e.message?e.message:e));
    return[];
  });
}
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
      cp-=65536;out+=String.fromCharCode(55296+(cp>>10),56320+(cp&1023));continue;
    }
  }
  return out;
}
function decryptVidNest(data){
  data=clean(data);if(!data)return null;
  var lookup={},i;for(i=0;i<VIDNEST_ALPH.length;i++)lookup[VIDNEST_ALPH.charAt(i)]=i;
  var bytes=[];
  for(i=0;i<data.length;i+=4){
    var chunk=(data.slice(i,i+4)+"====").slice(0,4),v=[];
    for(var j=0;j<4;j++)v[j]=Object.prototype.hasOwnProperty.call(lookup,chunk.charAt(j))?lookup[chunk.charAt(j)]:64;
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
function vidnestCandidates(data,backend){
  var out=[];
  if(!data||typeof data!=="object")return out;
  function add(url,type,quality,headers,lang){
    url=clean(url);if(!url)return;if(url.indexOf("//")===0)url="https:"+url;
    if(!/^https?:\/\//i.test(url))return;
    out.push({url:url,type:clean(type)||(/\.mp4(?:[?#]|$)/i.test(url)?"mp4":"hls"),quality:clean(quality)||"Unknown",headers:headers||{},lang:clean(lang),backend:backend});
  }
  if(Array.isArray(data.sources))data.sources.forEach(function(x){if(x)add(x.url,x.type,x.quality,x.headers,x.language||x.lang);});
  if(Array.isArray(data.streams))data.streams.forEach(function(x){if(x)add(x.url,x.type,x.quality,x.headers,x.language||x.lang);});
  if(Array.isArray(data.url))data.url.forEach(function(x){if(x)add(x.link||x.url,x.type,x.resolution||x.quality,x.headers,x.lang||x.language);});
  else if(typeof data.url==="string")add(data.url,data.type,data.quality,data.headers,data.language||data.lang);
  if(data.data&&Array.isArray(data.data.downloads))data.data.downloads.forEach(function(x){if(x)add(x.url||x.link,x.type,x.resolution||x.quality,x.headers,x.lang||x.language);});
  return out;
}
function expandVidNestCandidate(c){
  var h={"User-Agent":UA,"Referer":"https://vidnest.fun/","Origin":"https://vidnest.fun"};
  if(c.headers&&typeof c.headers==="object")Object.keys(c.headers).forEach(function(k){h[k]=String(c.headers[k]);});
  if(c.type==="mp4"||/\.mp4(?:[?#]|$)/i.test(c.url)){
    var q=clean(c.quality)||"Unknown",name="OnlyFlix · NontonGo · VidNest/"+c.backend+" · "+q;
    return Promise.resolve([{name:name,title:name,url:c.url,quality:q,type:"mp4",provider:"onlyflix-nontongo",headers:h,subtitles:[]}]);
  }
  return expandHls(c.url,h,"VidNest/"+c.backend).then(function(rows){
    return rows&&rows.length?rows:[];
  });
}
function resolveVidNest(tmdb,type,season,episode){
  var list=type==="tv"?VIDNEST_BACKENDS_TV:VIDNEST_BACKENDS_MOVIE,i=0;
  function next(){
    if(i>=list.length)return Promise.resolve([]);
    var b=list[i++],path=type==="tv"
      ?"/"+b.path+"/tv/"+encodeURIComponent(tmdb)+"/"+encodeURIComponent(season||1)+"/"+encodeURIComponent(episode||1)
      :"/"+b.path+"/movie/"+encodeURIComponent(tmdb);
    var h={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0","Accept":"application/json, */*","Origin":"https://vidnest.fun","Referer":"https://vidnest.fun/"};
    return fetch(VIDNEST+path,{headers:h}).then(function(r){
      if(!r.ok)throw new Error(b.name+" "+r.status);
      return r.json();
    }).then(function(j){
      var data=j&&j.encrypted?decryptVidNest(j.data):j;
      var cs=vidnestCandidates(data,b.name);
      if(!cs.length)return next();
      var ci=0;
      function tryCandidate(){
        if(ci>=cs.length)return next();
        return expandVidNestCandidate(cs[ci++]).then(function(rows){return rows.length?rows:tryCandidate();});
      }
      return tryCandidate();
    }).catch(function(){return next();});
  }
  return next();
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  if(mediaType==="movie"){
    return resolveMovieMain(tmdbId).then(function(rows){
      if(rows.length){console.log("[OnlyFlix/NontonGo] main movie="+rows.length);return rows;}
      return resolveVidNest(tmdbId,"movie",1,1);
    }).catch(function(){return resolveVidNest(tmdbId,"movie",1,1);});
  }
  return resolveVidNest(tmdbId,"tv",season,episode).then(function(rows){
    console.log("[OnlyFlix/NontonGo] main tv="+rows.length);return rows;
  }).catch(function(){return[];});
}
module.exports={getStreams:getStreams};

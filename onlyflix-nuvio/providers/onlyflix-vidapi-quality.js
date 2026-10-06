// OnlyFlix · VidAPI — pure local with HLS quality expansion
var API="https://streamdata.vaplayer.ru/api.php";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
var REFS=["https://nextgencloudfabric.com/","https://brightpathsignals.com/"];
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
function parseMaster(text,masterUrl){
  var lines=String(text||"").replace(/\r/g,"").split("\n"),out=[];
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var attrs=line.slice(18),rm=attrs.match(/RESOLUTION=(\d+)x(\d+)/i),bm=attrs.match(/BANDWIDTH=(\d+)/i);
    var uri="";
    for(var j=i+1;j<lines.length;j++){
      var n=lines[j].trim();
      if(!n)continue;
      if(n.charAt(0)==="#")continue;
      uri=n;break;
    }
    if(!uri)continue;
    var w=rm?parseInt(rm[1],10):0,h=rm?parseInt(rm[2],10):0;
    out.push({url:absUrl(masterUrl,uri),width:w,height:h,quality:stdQuality(w,h),bandwidth:bm?parseInt(bm[1],10):0});
  }
  return out;
}
function readU16(b,i){return i+1<b.length?((b[i]<<8)|b[i+1]):0;}
function readU32(b,i){
  if(i+3>=b.length)return 0;
  return (((b[i]*16777216)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3])>>>0);
}
function mp4Dimensions(buf){
  try{
    var b=new Uint8Array(buf),types=["avc1","hvc1","hev1","vp09","av01"];
    function tag(i){return String.fromCharCode(b[i]||0,b[i+1]||0,b[i+2]||0,b[i+3]||0);}
    for(var i=4;i+34<b.length;i++){
      var t=tag(i);
      if(types.indexOf(t)>=0){
        var w=readU16(b,i+28),h=readU16(b,i+30);
        if(w>=100&&w<=8000&&h>=100&&h<=5000)return{width:w,height:h};
      }
    }
    for(var k=4;k+16<b.length;k++){
      if(tag(k)!=="tkhd")continue;
      var size=readU32(b,k-4),end=(k-4)+size;
      if(size>=20&&end<=b.length){
        var wf=readU32(b,end-8)/65536,hf=readU32(b,end-4)/65536;
        var w2=Math.round(wf),h2=Math.round(hf);
        if(w2>=100&&w2<=8000&&h2>=100&&h2<=5000)return{width:w2,height:h2};
      }
    }
  }catch(e){}
  return null;
}
function qualityDetail(v){
  return v.width&&v.height?v.quality+" ("+v.width+"×"+v.height+")":v.quality;
}

function apiUrl(id,type,s,e){
  var u=API+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie");
  if(type==="tv")u+="&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1));
  return u;
}
function subsOf(j){
  return j&&Array.isArray(j.default_subs)?j.default_subs.filter(function(s){return s&&s.url;}).slice(0,8).map(function(s){
    return{url:s.url,language:clean(s.lang||s.code||s.language)||"en",name:clean(s.label||s.lang||s.code||s.name)||"Subtitle"};
  }):[];
}
function expandMaster(url,index,subs){
  var h={"User-Agent":UA};
  return fetch(url,{headers:h}).then(function(r){
    if(!r.ok)throw new Error("master "+r.status);
    return r.text();
  }).then(function(txt){
    var variants=parseMaster(txt,url);
    if(!variants.length){
      var name="OnlyFlix · VidAPI · S"+index+" · Unknown";
      return[{name:name,title:name,url:url,quality:"Unknown",type:"hls",provider:"onlyflix-vidapi",headers:h,subtitles:subs}];
    }
    return variants.map(function(v){
      var detail=qualityDetail(v),name="OnlyFlix · VidAPI · S"+index+" · "+detail;
      return{name:name,title:name,url:v.url,quality:v.quality,type:"hls",provider:"onlyflix-vidapi",headers:h,subtitles:subs};
    });
  }).catch(function(){
    var name="OnlyFlix · VidAPI · S"+index+" · Unknown";
    return[{name:name,title:name,url:url,quality:"Unknown",type:"hls",provider:"onlyflix-vidapi",headers:h,subtitles:subs}];
  });
}
function normalizeAndExpand(j){
  var d=j&&j.data?j.data:null,rows=d&&Array.isArray(d.stream_urls)?d.stream_urls:[],subs=subsOf(j),masters=[],seen={};
  rows.forEach(function(x){
    var url=clean(x&&typeof x==="object"?x.url:x);
    if(/^https?:\/\//i.test(url)&&!seen[url]){seen[url]=1;masters.push(url);}
  });
  return Promise.all(masters.map(function(u,i){return expandMaster(u,i+1,subs);})).then(function(groups){
    var out=[];groups.forEach(function(g){out=out.concat(g||[]);});
    out.sort(function(a,b){
      var sa=parseInt((a.name.match(/S(\d+)/)||[])[1]||0,10),sb=parseInt((b.name.match(/S(\d+)/)||[])[1]||0,10);
      if(sa!==sb)return sa-sb;
      return parseInt(b.quality||0,10)-parseInt(a.quality||0,10);
    });
    return out;
  });
}
function tryRef(i,id,type,s,e){
  if(i>=REFS.length)return Promise.resolve([]);
  var ref=REFS[i];
  return fetch(apiUrl(id,type,s,e),{headers:{"User-Agent":UA,"Referer":ref,"Origin":ref.replace(/\/$/,""),"Accept":"application/json, text/plain, */*"}})
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
    .then(normalizeAndExpand)
    .then(function(out){return out.length?out:tryRef(i+1,id,type,s,e);})
    .catch(function(){return tryRef(i+1,id,type,s,e);});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tryRef(0,tmdbId,mediaType,season,episode).then(function(rows){
    console.log("[OnlyFlix/VidAPI] quality streams="+rows.length);return rows;
  }).catch(function(){return[];});
}
module.exports={getStreams:getStreams};
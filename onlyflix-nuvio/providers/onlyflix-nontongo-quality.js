// OnlyFlix · NontonGo — pure local with HLS/MP4 quality detection
var BASES=["https://sv2.nontongo.day","https://sv2.nontongo.stream"];
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
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

function page(base,id,type,s,e){
  return type==="tv"
    ?base+"/01russia/multisourcesoap.php?id="+encodeURIComponent(id)+"&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1))+"&type=tv"
    :base+"/01russia/multisourcesoap.php?id="+encodeURIComponent(id)+"&type=movie";
}
function parseSources(html){
  var m=String(html||"").match(/const\s+sources\s*=\s*(\[[\s\S]*?\]);/);
  if(!m)return[];try{return JSON.parse(m[1]);}catch(e){return[];}
}
function inspect(row,base){
  var raw=clean(row&&row.file);
  if(!/^https?:\/\//i.test(raw))return Promise.resolve([]);
  var requestUrl=raw.split("#")[0],source=clean(row&&row.html)||"Soap2";
  return fetch(requestUrl,{method:"GET",headers:{"User-Agent":UA,"Referer":base+"/","Accept":"*/*","Range":"bytes=0-65535"}})
    .then(function(r){
      if(!r.ok)return[];
      var ct="";try{ct=clean(r.headers&&r.headers.get?r.headers.get("content-type"):"").toLowerCase();}catch(e){}
      if(ct.indexOf("mpegurl")>=0||/\.m3u8(?:[?#]|$)/i.test(requestUrl)){
        return r.text().then(function(txt){
          var vars=parseMaster(txt,requestUrl);
          if(vars.length)return vars.map(function(v){
            var detail=qualityDetail(v),name="OnlyFlix · NontonGo · "+source+" · "+detail;
            return{name:name,title:name,url:v.url,quality:v.quality,type:"hls",provider:"onlyflix-nontongo",headers:{"User-Agent":UA},subtitles:[]};
          });
          var name="OnlyFlix · NontonGo · "+source+" · HLS (Unknown)";
          return[{name:name,title:name,url:raw,quality:"Unknown",type:"hls",provider:"onlyflix-nontongo",headers:{"User-Agent":UA},subtitles:[]}];
        });
      }
      if(ct.indexOf("video/mp4")>=0){
        return r.arrayBuffer().then(function(buf){
          var d=mp4Dimensions(buf),q=d?stdQuality(d.width,d.height):"Unknown",detail=d?q+" ("+d.width+"×"+d.height+")":"MP4 (Unknown)";
          var name="OnlyFlix · NontonGo · "+source+" · "+detail;
          return[{name:name,title:name,url:requestUrl,quality:q,type:"mp4",provider:"onlyflix-nontongo",headers:{"User-Agent":UA},subtitles:[]}];
        });
      }
      return[];
    }).catch(function(){return[];});
}
function tryBase(i,id,type,s,e){
  if(i>=BASES.length)return Promise.resolve([]);
  var base=BASES[i],u=page(base,id,type,s,e);
  return fetch(u,{headers:{"User-Agent":UA,"Referer":base+"/","Accept":"text/html,application/xhtml+xml,*/*"}})
    .then(function(r){if(!r.ok)throw new Error("page "+r.status);return r.text();})
    .then(function(html){
      var rows=parseSources(html).slice(0,8);
      if(!rows.length)throw new Error("sources missing");
      return Promise.all(rows.map(function(x){return inspect(x,base);})).then(function(groups){
        var out=[],seen={};
        groups.forEach(function(g){(g||[]).forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}});});
        return out.length?out:tryBase(i+1,id,type,s,e);
      });
    }).catch(function(){return tryBase(i+1,id,type,s,e);});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return tryBase(0,tmdbId,mediaType,season,episode).then(function(rows){
    console.log("[OnlyFlix/NontonGo] quality streams="+rows.length);return rows;
  }).catch(function(){return[];});
}
module.exports={getStreams:getStreams};
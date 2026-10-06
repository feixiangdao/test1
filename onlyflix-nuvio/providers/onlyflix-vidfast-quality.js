// OnlyFlix · VidFast — pure local with HLS quality expansion
var BASES=["https://vidfast.vc","https://vidfast.net","https://vidfast.pro"];
var ENC="https://enc-dec.app/api/enc-vidfast";
var DEC="https://enc-dec.app/api/dec-vidfast";
var VA="https://streamdata.vaplayer.ru/api.php";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
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

function qnum(q){var s=String(q||"").toLowerCase();if(/4k|2160/.test(s))return 2160;var m=s.match(/(\d{3,4})/);return m?parseInt(m[1],10):0;}
function token(page){
  var s=String(page||""),m;
  m=s.match(/\\\"(?:en|token)\\\":\\\"(.*?)\\\"/);if(m)return m[1];
  m=s.match(/"(?:en|token)"\s*:\s*"([^"]+)"/);if(m)return m[1];
  m=s.match(/'(?:en|token)'\s*:\s*'([^']+)'/);
  return m?m[1]:"";
}
function dec(text){
  return fetch(DEC,{
    method:"POST",
    headers:{"Content-Type":"application/json","User-Agent":UA},
    body:JSON.stringify({text:text,version:"1"})
  }).then(function(r){
    if(!r.ok)throw new Error("dec "+r.status);
    return r.json();
  }).then(function(d){return d&&d.result!=null?d.result:null;});
}
function extractBase(base,id,type,season,episode){
  var page=type==="tv"?base+"/tv/"+id+"/"+(season||1)+"/"+(episode||1)+"/":base+"/movie/"+id+"/";
  var h={
    "User-Agent":UA,
    "Referer":base+"/",
    "Origin":base,
    "Accept":"*/*",
    "X-Requested-With":"XMLHttpRequest",
    "Content-Type":"application/json"
  };
  return fetch(page,{headers:h}).then(function(r){
    if(!r.ok)throw new Error("page "+r.status);
    return r.text();
  }).then(function(txt){
    var t=token(txt);
    if(!t)throw new Error("token missing");
    return fetch(ENC+"?text="+encodeURIComponent(t)+"&version=1",{headers:{"User-Agent":UA}})
      .then(function(r){if(!r.ok)throw new Error("enc "+r.status);return r.json();});
  }).then(function(j){
    var x=j&&j.result?j.result:{};
    if(!x.servers||!x.stream)throw new Error("endpoints missing");
    if(x.token)h["X-CSRF-Token"]=x.token;
    return fetch(x.servers,{method:"POST",headers:h})
      .then(function(r){if(!r.ok)throw new Error("servers "+r.status);return r.text();})
      .then(dec)
      .then(function(list){
        if(!Array.isArray(list)||!list.length)return[];
        return Promise.all(list.map(function(s){
          if(!s||!s.data)return Promise.resolve([]);
          return fetch(x.stream+"/"+s.data,{method:"POST",headers:h})
            .then(function(r){if(!r.ok)throw new Error("stream "+r.status);return r.text();})
            .then(dec)
            .then(function(d){
              var u=clean(d&&(d.url||d.file));
              if(!/^https?:\/\//i.test(u))return[];
              var q=clean(d.quality||d.label||s.description||"Auto");
              if(/4k|2160/i.test(q))q="4K";
              else{var m=q.match(/(\d{3,4})/);if(m)q=m[1]+"p";}
              var subs=(d&&Array.isArray(d.tracks)?d.tracks:[]).map(function(t){
                var su=clean(t&&(t.file||t.url));
                if(!su)return null;
                return{url:su,language:clean(t.label||t.lang||"en"),name:clean(t.label||"Subtitle")};
              }).filter(Boolean).slice(0,8);
              var name="OnlyFlix · VidFast · Local · "+clean(s.name||"server")+" · "+q;
              return[{name:name,title:name,url:u,quality:q,type:/\.m3u8(?:[?#]|$)/i.test(u)?"hls":"file",provider:"onlyflix-vidfast",headers:{"User-Agent":UA,"Referer":base+"/","Origin":base},subtitles:subs}];
            }).catch(function(){return[];});
        })).then(function(groups){
          var out=[];
          groups.forEach(function(g){out=out.concat(g||[]);});
          return out;
        });
      });
  });
}
function nativeTry(i,id,type,s,e){
  if(i>=BASES.length)return Promise.resolve([]);
  return extractBase(BASES[i],id,type,s,e).then(function(rows){
    return rows.length?rows:nativeTry(i+1,id,type,s,e);
  }).catch(function(){
    return nativeTry(i+1,id,type,s,e);
  });
}
function vaTry(id,type,s,e){
  var u=VA+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie")+"&source=vidfast";
  if(type==="tv")u+="&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1));
  var refs=["https://vidfast.pro/","https://nextgencloudfabric.com/"];
  function next(i){
    if(i>=refs.length)return Promise.resolve([]);
    var ref=refs[i];
    return fetch(u,{headers:{"User-Agent":UA,"Referer":ref,"Origin":ref.replace(/\/$/,""),"Accept":"application/json, text/plain, */*"}})
      .then(function(r){if(!r.ok)throw new Error("VA "+r.status);return r.json();})
      .then(function(j){
        var rows=j&&j.data&&Array.isArray(j.data.stream_urls)?j.data.stream_urls:[],out=[],seen={};
        rows.forEach(function(x,n){
          var url=clean(x);
          if(!/^https?:\/\//i.test(url)||seen[url])return;
          seen[url]=1;
          var name="OnlyFlix · VidFast · Local VA · HLS "+(n+1);
          out.push({name:name,title:name,url:url,quality:"Auto",type:"hls",provider:"onlyflix-vidfast",headers:{"User-Agent":UA},subtitles:[]});
        });
        return out.length?out:next(i+1);
      }).catch(function(){return next(i+1);});
  }
  return next(0);
}
function expandVF(row){
  if(!row||row.type!=="hls"||!row.url)return Promise.resolve(row?[row]:[]);
  var h=row.headers||{"User-Agent":UA};
  return fetch(row.url,{headers:h}).then(function(r){if(!r.ok)throw new Error("master "+r.status);return r.text();}).then(function(txt){
    var vars=parseMaster(txt,row.url);
    if(!vars.length){
      if(!row.quality||row.quality==="Auto")row.quality="Unknown";
      return[row];
    }
    return vars.map(function(v){
      var detail=qualityDetail(v),name=row.name+" · "+detail;
      return{name:name,title:name,url:v.url,quality:v.quality,type:"hls",provider:"onlyflix-vidfast",headers:h,subtitles:row.subtitles||[]};
    });
  }).catch(function(){
    if(!row.quality||row.quality==="Auto")row.quality="Unknown";
    return[row];
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return nativeTry(0,tmdbId,mediaType,season,episode).then(function(rows){
    if(rows.length)return rows;
    return vaTry(tmdbId,mediaType,season,episode);
  }).then(function(rows){
    var base=[],seen={};
    (rows||[]).forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;base.push(x);}});
    return Promise.all(base.map(expandVF)).then(function(gs){
      var out=[],seen2={};
      gs.forEach(function(g){(g||[]).forEach(function(x){if(x&&x.url&&!seen2[x.url]){seen2[x.url]=1;out.push(x);}});});
      out.sort(function(a,b){return qnum(b.quality)-qnum(a.quality);});
      console.log("[OnlyFlix/VidFast] quality streams="+out.length);
      return out;
    });
  }).catch(function(){return[];});
}
module.exports={getStreams:getStreams};
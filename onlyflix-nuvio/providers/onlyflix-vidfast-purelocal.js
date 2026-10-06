// OnlyFlix · VidFast — pure local Nuvio resolver
var BASES=["https://vidfast.vc","https://vidfast.net","https://vidfast.pro"];
var ENC="https://enc-dec.app/api/enc-vidfast";
var DEC="https://enc-dec.app/api/dec-vidfast";
var VA="https://streamdata.vaplayer.ru/api.php";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
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
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);
  if(mediaType!=="movie"&&mediaType!=="tv")return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return nativeTry(0,tmdbId,mediaType,season,episode).then(function(rows){
    if(rows.length)return rows;
    return vaTry(tmdbId,mediaType,season,episode);
  }).then(function(rows){
    var out=[],seen={};
    (rows||[]).forEach(function(x){
      if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
    });
    out.sort(function(a,b){return qnum(b.quality)-qnum(a.quality);});
    console.log("[OnlyFlix/VidFast] pure-local streams="+out.length);
    return out;
  }).catch(function(e){
    console.error("[OnlyFlix/VidFast] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};
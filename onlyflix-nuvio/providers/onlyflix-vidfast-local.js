// OnlyFlix · VidFast — local direct protocol, cloud fallback
var BASES=["https://vidfast.vc","https://vidfast.net","https://vidfast.pro"];
var ENC="https://enc-dec.app/api/enc-vidfast";
var DEC="https://enc-dec.app/api/dec-vidfast";
var RESOLVER="https://onlyflix-resolver-feixiangdao.vercel.app/api/resolve";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function qnum(q){var s=String(q||"").toLowerCase();if(/4k|2160/.test(s))return 2160;var m=s.match(/(\d{3,4})/);return m?parseInt(m[1],10):0;}
function token(page){var s=String(page||""),m;m=s.match(/\\\"(?:en|token)\\\":\\\"(.*?)\\\"/);if(m)return m[1];m=s.match(/"(?:en|token)"\s*:\s*"([^"]+)"/);if(m)return m[1];m=s.match(/'(?:en|token)'\s*:\s*'([^']+)'/);return m?m[1]:"";}
function dec(text){return fetch(DEC,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":UA},body:JSON.stringify({text:text,version:"1"})}).then(function(r){if(!r.ok)throw new Error("dec "+r.status);return r.json();}).then(function(d){return d&&d.result!=null?d.result:null;});}
function extractBase(base,id,type,season,episode){
  var page=type==="tv"?base+"/tv/"+id+"/"+(season||1)+"/"+(episode||1)+"/":base+"/movie/"+id+"/";
  var h={"User-Agent":UA,"Referer":base+"/","Origin":base,"Accept":"*/*","X-Requested-With":"XMLHttpRequest","Content-Type":"application/json"};
  return fetch(page,{headers:h}).then(function(r){if(!r.ok)throw new Error("page "+r.status);return r.text();}).then(function(txt){
    var t=token(txt);if(!t)throw new Error("token missing");
    return fetch(ENC+"?text="+encodeURIComponent(t)+"&version=1",{headers:{"User-Agent":UA}}).then(function(r){if(!r.ok)throw new Error("enc "+r.status);return r.json();});
  }).then(function(j){
    var x=j&&j.result?j.result:{};if(!x.servers||!x.stream)throw new Error("endpoints missing");if(x.token)h["X-CSRF-Token"]=x.token;
    return fetch(x.servers,{method:"POST",headers:h}).then(function(r){if(!r.ok)throw new Error("servers "+r.status);return r.text();}).then(dec).then(function(list){
      if(!Array.isArray(list)||!list.length)return[];
      return Promise.all(list.map(function(s){
        if(!s||!s.data)return Promise.resolve([]);
        return fetch(x.stream+"/"+s.data,{method:"POST",headers:h}).then(function(r){if(!r.ok)throw new Error("stream "+r.status);return r.text();}).then(dec).then(function(d){
          var u=clean(d&&(d.url||d.file));if(!/^https?:\/\//i.test(u))return[];
          var q=clean(d.quality||d.label||s.description||"Auto");if(/4k|2160/i.test(q))q="4K";else{var m=q.match(/(\d{3,4})/);if(m)q=m[1]+"p";}
          var subs=(d&&Array.isArray(d.tracks)?d.tracks:[]).map(function(t){var su=clean(t&&(t.file||t.url));if(!su)return null;return{url:su,language:clean(t.label||t.lang||"en"),name:clean(t.label||"Subtitle")};}).filter(Boolean).slice(0,8);
          var name="OnlyFlix · VidFast · Local · "+clean(s.name||"server")+" · "+q;
          return[{name:name,title:name,url:u,quality:q,type:/\.m3u8(?:[?#]|$)/i.test(u)?"hls":"file",provider:"onlyflix-vidfast",headers:{"User-Agent":UA,"Referer":base+"/","Origin":base},subtitles:subs}];
        }).catch(function(){return[];});
      })).then(function(gs){var o=[];gs.forEach(function(g){o=o.concat(g||[]);});return o;});
    });
  });
}
function localTry(i,id,type,s,e){
  if(i>=BASES.length)return Promise.resolve([]);
  return extractBase(BASES[i],id,type,s,e).then(function(o){return o.length?o:localTry(i+1,id,type,s,e);}).catch(function(){return localTry(i+1,id,type,s,e);});
}
function cloud(id,type,s,e){
  var u=RESOLVER+"?tmdb="+encodeURIComponent(String(id))+"&type="+encodeURIComponent(type==="tv"?"tv":"movie")+"&source=vidfast";
  if(type==="tv")u+="&season="+encodeURIComponent(String(s||1))+"&episode="+encodeURIComponent(String(e||1));
  return fetch(u,{headers:{"User-Agent":UA,"Accept":"application/json"}}).then(function(r){if(!r.ok)throw new Error("cloud "+r.status);return r.json();}).then(function(j){
    var rows=j&&Array.isArray(j.streams)?j.streams:[],out=[],seen={};
    rows.forEach(function(x,i){var obj=x&&typeof x==="object"?x:null,url=clean(obj?obj.url:x);if(!/^https?:\/\//i.test(url)||seen[url])return;seen[url]=1;var q=clean(obj&&(obj.quality||obj.label))||"Auto";var name="OnlyFlix · VidFast · Cloud fallback · HLS "+(i+1);out.push({name:name,title:name,url:url,quality:q,type:"hls",provider:"onlyflix-vidfast",headers:{"User-Agent":UA},subtitles:[]});});
    return out;
  }).catch(function(){return[];});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId)return Promise.resolve([]);if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  return localTry(0,tmdbId,mediaType==="tv"?"tv":"movie",season,episode).then(function(rows){
    var out=[],seen={};(rows||[]).forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}});
    out.sort(function(a,b){return qnum(b.quality)-qnum(a.quality);});
    if(out.length){console.log("[OnlyFlix/VidFast] local streams="+out.length);return out;}
    return cloud(tmdbId,mediaType,season,episode);
  }).catch(function(){return cloud(tmdbId,mediaType,season,episode);});
}
module.exports={getStreams:getStreams};
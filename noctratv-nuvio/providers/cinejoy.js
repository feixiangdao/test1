// NoctraTV · CineJoy — Nuvio local scraper
// Current CineJoy headless protocol (2026): api.wing.st / cinejoy.pk.
// Flow: TMDB metadata -> /servers -> enc-cinejoy -> raw bytes POST /g
// -> dec-cinejoy -> validated direct HLS. No iframe/WebView fallback.

var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var API="https://api.wing.st";
var SITE="https://cinejoy.pk";
var ENCDEC="https://enc-dec.app/api";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
var PREF=["Lisbon","Scout","Solara","Riga","Athens","Nebula"];

function clean(v){return v==null?"":String(v).trim();}
function b64urlDecode(s){
  var std=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  while(std.length%4)std+="=";
  var bin=atob(std),out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i)&255;
  return out;
}
function b64urlEncode(bytes){
  var a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),bin="";
  for(var i=0;i<a.length;i++)bin+=String.fromCharCode(a[i]);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function headers(extra){
  var h={
    "User-Agent":UA,
    "Accept":"application/json, text/plain, */*",
    "Referer":SITE+"/",
    "Origin":SITE
  };
  Object.keys(extra||{}).forEach(function(k){h[k]=extra[k];});
  return h;
}
function getJson(url,h){
  return fetch(url,{headers:h||headers()}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.json();
  });
}
function postJson(url,obj,h){
  return fetch(url,{
    method:"POST",
    headers:h||headers({"Content-Type":"application/json"}),
    body:JSON.stringify(obj)
  }).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status+" "+url);
    return r.json();
  });
}
function tmdbInfo(id,type){
  var t=type==="tv"?"tv":"movie";
  var u=TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(TMDB_KEY)+"&append_to_response=external_ids";
  return getJson(u,{"User-Agent":UA,"Accept":"application/json"}).then(function(j){
    var title=t==="tv"?(j.name||j.original_name||""):(j.title||j.original_title||"");
    var date=j.release_date||j.first_air_date||"";
    return{
      title:title,
      year:date&&date.length>=4?date.slice(0,4):"",
      imdb:j.external_ids&&j.external_ids.imdb_id||""
    };
  });
}
function fetchServers(){
  return getJson(API+"/servers",headers()).then(function(j){
    var a=j&&j.servers;
    if(!Array.isArray(a))return PREF.slice();
    var names=a.map(function(x){return clean(x&&x.name||x);}).filter(Boolean);
    names.sort(function(a,b){
      var ia=PREF.indexOf(a),ib=PREF.indexOf(b);
      ia=ia<0?999:ia;ib=ib<0?999:ib;return ia-ib;
    });
    return names.length?names:PREF.slice();
  }).catch(function(){return PREF.slice();});
}
function buildTarget(server,info,id,type,season,episode){
  var q=[
    "title="+encodeURIComponent(info.title||""),
    "type="+(type==="tv"?"series":"movie"),
    "year="+encodeURIComponent(info.year||""),
    "imdb="+encodeURIComponent(info.imdb||""),
    "tmdb="+encodeURIComponent(String(id)),
    "server="+encodeURIComponent(server)
  ];
  if(type==="tv"){
    q.push("season="+encodeURIComponent(String(season||1)));
    q.push("episode="+encodeURIComponent(String(episode||1)));
  }
  return API+"/?"+q.join("&");
}
function resolveOne(server,info,id,type,season,episode){
  var target=buildTarget(server,info,id,type,season,episode);
  return getJson(ENCDEC+"/enc-cinejoy?url="+encodeURIComponent(target),{"User-Agent":UA,"Accept":"application/json"})
    .then(function(e){
      var r=e&&e.result||e;
      if(!r||!r.data||!r.state)throw new Error("enc incomplete");
      var body=b64urlDecode(r.data);
      return fetch(API+"/g",{
        method:"POST",
        headers:headers({"Content-Type":"application/octet-stream","Accept":"*/*"}),
        body:body
      }).then(function(gr){
        if(!gr.ok)throw new Error("gate HTTP "+gr.status);
        return gr.arrayBuffer();
      }).then(function(buf){
        return postJson(
          ENCDEC+"/dec-cinejoy",
          {text:b64urlEncode(new Uint8Array(buf)),state:r.state},
          {"User-Agent":UA,"Accept":"application/json","Content-Type":"application/json"}
        );
      });
    })
    .then(function(d){
      var data=d&&d.result&&d.result.data||d&&d.data||null;
      var streams=data&&data.stream;
      if(!streams)return[];
      var list=Array.isArray(streams)?streams:[streams],out=[];
      list.forEach(function(s){
        if(!s)return;
        var playlist=clean(s.playlist);
        if(/^https?:\/\//i.test(playlist)){
          out.push({
            name:"NoctraTV · CineJoy",
            title:"CineJoy · "+server+" · HLS",
            url:playlist,
            quality:"Auto",
            provider:"noctra-cinejoy",
            format:"m3u8",
            headers:{"User-Agent":UA,"Referer":SITE+"/","Origin":SITE},
            subtitles:[]
          });
        }
        var files=s.qualities||s.files||{};
        Object.keys(files).forEach(function(k){
          var u=clean(files[k]);
          if(!/^https?:\/\//i.test(u))return;
          out.push({
            name:"NoctraTV · CineJoy",
            title:"CineJoy · "+server+" · "+k,
            url:u,
            quality:k,
            provider:"noctra-cinejoy",
            format:/\.m3u8(?:\?|$)/i.test(u)?"m3u8":"video",
            headers:{"User-Agent":UA,"Referer":SITE+"/","Origin":SITE},
            subtitles:[]
          });
        });
      });
      return out;
    })
    .catch(function(e){
      console.log("[Noctra/CineJoy] "+server+" "+(e&&e.message?e.message:e));
      return[];
    });
}
function validateHls(s){
  if(!s||!s.url)return Promise.resolve(null);
  if(s.format!=="m3u8")return Promise.resolve(s);
  return fetch(s.url,{headers:s.headers||{}}).then(function(r){
    if(!r.ok)return null;
    return r.text();
  }).then(function(t){
    return /^#EXTM3U/m.test(String(t||""))?s:null;
  }).catch(function(){return null;});
}
function getStreams(tmdbId,mediaType,season,episode){
  if(tmdbId==null)return Promise.resolve([]);
  return Promise.all([tmdbInfo(tmdbId,mediaType),fetchServers()]).then(function(v){
    var info=v[0],servers=v[1];
    // Skip known anti-scrape Nebula and cap network work to four preferred branches.
    var use=servers.filter(function(x){return x!=="Nebula";}).slice(0,4);
    return Promise.all(use.map(function(s){
      return resolveOne(s,info,tmdbId,mediaType,season,episode);
    }));
  }).then(function(groups){
    var all=[],seen={};
    groups.forEach(function(g){(g||[]).forEach(function(x){
      if(x&&x.url&&!seen[x.url]){seen[x.url]=1;all.push(x);}
    });});
    return Promise.all(all.map(validateHls));
  }).then(function(rows){
    var out=rows.filter(Boolean);
    console.log("[Noctra/CineJoy] "+mediaType+" "+tmdbId+" streams="+out.length);
    return out;
  }).catch(function(e){
    console.log("[Noctra/CineJoy] "+(e&&e.message?e.message:e));
    return[];
  });
}
module.exports={getStreams:getStreams};

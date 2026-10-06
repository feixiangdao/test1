// NoctraTV · Novera · VidKing — Nuvio local scraper
// Local execution is intentional: the final CDN may block datacenter IPs.

var DEFAULT_API = "https://api.speedracelight.com";
var RUNTIME = { api:DEFAULT_API, origin:"https://www.vidking.net", discoveredAt:0 };
var PLAYER_ORIGINS = [
  "https://www.vidking.net","https://vidking.net","https://www.vidking.to","https://vidking.to",
  "https://player.videasy.to","https://player.videasy.net","https://player.videasy.com","https://player.videasy.cc"
];
var TMDB_KEY = "68e094699525b18a70bab2f86b1fa706";
var UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
var MAGIC = [109,118,109,49];
var HASH_TABLE = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925473888,2162078206,261488103,3248222580];
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function clean(v) { return v == null ? "" : String(v).trim(); }
function u32(x) { return x >>> 0; }
function mul(a,b) { return Math.imul(a,b) >>> 0; }
function rot(x,n) { x >>>= 0; n &= 31; return n === 0 ? x : ((x << n) | (x >>> (32-n))) >>> 0; }
function hash32(x) {
  x=u32(x); x^=x>>>16; x=mul(x,2246822507); x^=x>>>13; x=mul(x,3266489909); x^=x>>>16; return u32(x);
}
function fnv1a(str) {
  var h=2166136261;
  for(var i=0;i<str.length;i++) h=mul(h ^ str.charCodeAt(i),16777619);
  return hash32(h);
}
function init(seed,key) {
  var S=new Array(61);
  var a=u32(hash32(fnv1a(seed)^hash32(u32((key>>>0)^2654435769))));
  for(var i=0;i<8;i++) {
    if(((i*(i+1))&1)===0) {
      var idx=a%61;
      a=rot(a+u32(2654435769),7+(7&i));
      S[idx]=u32(a^hash32(a));
      a=hash32(u32(a+idx));
    } else {
      S[i]=HASH_TABLE[15&i];
    }
  }
  return {S:S,acc:u32(hash32(2779096485^a))};
}
function next(st,ctr) {
  var r=st.S,o=st.acc,n=o%61,inSet=0-Number(n in r),d=(r[n]||0)>>>0;
  var x=u32(d^mul(2654435769,ctr+1));
  var y=u32((o^x)|(o&x&inSet));
  var no=hash32(u32(rot(u32(y+o),31&n)^rot(o,31&Math.imul(n,7)))+2654435769);
  r[n]=no>>>0; st.acc=no; return no>>>0;
}
function keystream(seed,key,len) {
  var st=init(seed,key),out=new Uint8Array(len),ctr=0,i=0,b;
  while(i<len) {
    b=next(st,ctr++);
    out[i++]=b&255;
    if(i<len) out[i++]=(b>>>8)&255;
    if(i<len) out[i++]=(b>>>16)&255;
    if(i<len) out[i++]=(b>>>24)&255;
  }
  return out;
}
function b64urlBytes(s) {
  s=String(s||"").replace(/-/g,"+").replace(/_/g,"/").replace(/\s/g,"");
  while(s.length%4) s+="=";
  var out=[],i=0;
  while(i<s.length) {
    var c1=B64.indexOf(s.charAt(i++)), c2=B64.indexOf(s.charAt(i++));
    var c3=B64.indexOf(s.charAt(i++)), c4=B64.indexOf(s.charAt(i++));
    if(c1<0||c2<0) break;
    out.push(((c1<<2)|(c2>>4))&255);
    if(c3>=0) out.push((((c2&15)<<4)|(c3>>2))&255);
    if(c4>=0) out.push((((c3&3)<<6)|c4)&255);
  }
  return new Uint8Array(out);
}
function utf8(bytes) {
  if(typeof TextDecoder!=="undefined") {
    try { return new TextDecoder("utf-8").decode(bytes); } catch(_) {}
  }
  var encoded="";
  for(var i=0;i<bytes.length;i++) encoded += "%" + ("0"+bytes[i].toString(16)).slice(-2);
  try { return decodeURIComponent(encoded); } catch(_) {
    var s=""; for(var j=0;j<bytes.length;j++) s+=String.fromCharCode(bytes[j]); return s;
  }
}
function decryptPayload(payload,seed,key) {
  var data=b64urlBytes(payload);
  var ks=keystream(seed,key,data.length);
  for(var i=0;i<data.length;i++) data[i]^=ks[i];
  for(var j=0;j<MAGIC.length;j++) if(data[j]!==MAGIC[j]) throw new Error("decrypt magic mismatch");
  return JSON.parse(utf8(data.slice(MAGIC.length)));
}
function qs(obj) {
  var a=[];
  Object.keys(obj).forEach(function(k){ a.push(encodeURIComponent(k)+"="+encodeURIComponent(String(obj[k]))); });
  return a.join("&");
}
function fetchJson(url,options) {
  return fetch(url,options||{}).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status+" "+url); return r.json(); });
}
function fetchText(url,options) {
  return fetch(url,options||{}).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status+" "+url); return r.text(); });
}

function timeout(p,ms,label){
  return new Promise(function(resolve,reject){
    var done=false;
    var t=setTimeout(function(){if(done)return;done=true;reject(new Error(label+" timeout"));},ms);
    Promise.resolve(p).then(function(v){if(done)return;done=true;clearTimeout(t);resolve(v);},
      function(e){if(done)return;done=true;clearTimeout(t);reject(e);});
  });
}
function apiHeaders(origin){
  origin=clean(origin||RUNTIME.origin).replace(/\/$/,"");
  return{
    "Origin":origin,
    "Referer":origin+"/",
    "User-Agent":UA,
    "Accept":"application/json,text/plain,*/*",
    "Cache-Control":"no-cache, no-store, must-revalidate",
    "Pragma":"no-cache"
  };
}
function probeSeed(base,origin,id){
  base=clean(base).replace(/\/$/,"");
  if(!/^https:\/\/api\./i.test(base))return Promise.resolve(null);
  return timeout(fetch(base+"/seed?mediaId="+encodeURIComponent(String(id)),{
    headers:apiHeaders(origin)
  }),7000,"seed").then(function(r){
    if(!r.ok)return null;
    return r.json().catch(function(){return null;});
  }).then(function(j){
    var seed=clean(j&&j.seed);
    return seed?{api:base,origin:origin,seed:seed}:null;
  }).catch(function(){return null;});
}
function extractApiBases(s){
  s=String(s||"").replace(/\\\//g,"/");
  var re=/https:\/\/api\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/ig,m,out=[],seen={};
  while((m=re.exec(s))!==null){
    var u=clean(m[0]).replace(/\/$/,"");
    if(!u||/wingsdatabase\.com$/i.test(u)||seen[u])continue;
    seen[u]=1;out.push(u);
  }
  return out;
}
function scriptUrls(html,page){
  var re=/<script\b[^>]*\bsrc=["']([^"']+)["']/ig,m,out=[],seen={};
  while((m=re.exec(String(html||"")))!==null){
    try{
      var u=new URL(m[1],page).toString();
      if(/\.js(?:\?|$)/i.test(u)&&!seen[u]){seen[u]=1;out.push(u);}
    }catch(_){}
  }
  return out.slice(0,8);
}
function discoverAtOrigin(origin,id){
  var pages=/vidking/i.test(origin)?[origin+"/embed/movie/550",origin+"/"]:[origin+"/movie/550",origin+"/"];
  var pi=0,bases=[DEFAULT_API];
  function nextPage(){
    if(pi>=pages.length)return probeBases();
    var page=pages[pi++];
    return timeout(fetch(page,{headers:{"User-Agent":UA,"Accept":"text/html,*/*","Referer":origin+"/"}}),5000,"page")
      .then(function(r){if(!r.ok)throw new Error("page "+r.status);return r.text();})
      .then(function(html){
        bases=bases.concat(extractApiBases(html));
        var scripts=scriptUrls(html,page),si=0;
        function nextScript(){
          if(si>=scripts.length)return nextPage();
          var u=scripts[si++];
          return timeout(fetch(u,{headers:{"User-Agent":UA,"Referer":origin+"/"}}),5000,"script")
            .then(function(r){if(!r.ok)throw new Error("script "+r.status);return r.text();})
            .then(function(js){bases=bases.concat(extractApiBases(js));return nextScript();})
            .catch(function(){return nextScript();});
        }
        return nextScript();
      }).catch(function(){return nextPage();});
  }
  function probeBases(){
    var uniq=[],seen={},bi=0;
    bases.forEach(function(x){if(x&&!seen[x]){seen[x]=1;uniq.push(x);}});
    function next(){
      if(bi>=uniq.length)return Promise.resolve(null);
      var b=uniq[bi++];
      return probeSeed(b,origin,id).then(function(r){return r||next();});
    }
    return next();
  }
  return nextPage();
}
function discoverApi(id){
  var age=Date.now()-Number(RUNTIME.discoveredAt||0);
  if(RUNTIME.api&&age<6*60*60*1000){
    return probeSeed(RUNTIME.api,RUNTIME.origin,id).then(function(r){return r||fresh();});
  }
  return fresh();
  function fresh(){
    var oi=0;
    function nextOrigin(){
      if(oi>=PLAYER_ORIGINS.length)return Promise.resolve(null);
      var origin=PLAYER_ORIGINS[oi++];
      return probeSeed(DEFAULT_API,origin,id).then(function(r){
        if(r)return r;
        return discoverAtOrigin(origin,id);
      }).then(function(r){
        if(r){
          RUNTIME.api=r.api;RUNTIME.origin=r.origin;RUNTIME.discoveredAt=Date.now();
          console.log("[Noctra/Novera/VidKing] discovered "+r.api+" via "+r.origin);
          return r;
        }
        return nextOrigin();
      });
    }
    return nextOrigin();
  }
}

function getStreams(tmdbId, mediaType, season, episode) {
  var t = mediaType === "tv" ? "tv" : "movie";
  var tmdbUrl = "https://api.themoviedb.org/3/" + t + "/" + tmdbId +
    "?api_key=" + encodeURIComponent(TMDB_KEY) + "&append_to_response=external_ids";

  console.log("[Noctra/Novera/VidKing] "+t+" "+tmdbId);

  return fetchJson(tmdbUrl)
    .then(function(info) {
      var title=clean(info.title||info.name);
      var date=clean(info.release_date||info.first_air_date);
      var year=date ? date.slice(0,4) : "";
      var imdb=clean(info.imdb_id || (info.external_ids && info.external_ids.imdb_id));
      if(!title) throw new Error("TMDB title missing");

      return discoverApi(tmdbId).then(function(rt){
        if(!rt||!rt.seed)throw new Error("no live VidKing API discovered");
        return {title:title,year:year,imdb:imdb,seed:rt.seed,api:rt.api,origin:rt.origin};
      });
    })
    .then(function(meta) {
      var providers=[
        {name:"Yoru",endpoint:"cdn/sources-with-title"},
        {name:"Omen",endpoint:"lamovie/sources-with-title"}
      ];

      var jobs=providers.map(function(p) {
        var query=qs({
          title:meta.title,
          mediaType:t,
          year:meta.year,
          episodeId:String(episode||1),
          seasonId:String(season||1),
          tmdbId:String(tmdbId),
          imdbId:meta.imdb,
          enc:"2",
          seed:meta.seed,
          _t:String(Date.now())
        });

        return fetchText(meta.api+"/"+p.endpoint+"?"+query, {
          headers:{
            "Origin":meta.origin,
            "Referer":meta.origin+"/",
            "User-Agent":UA,
            "Cache-Control":"no-cache"
          }
        }).then(function(payload){
          var data=decryptPayload(payload,meta.seed,parseInt(tmdbId,10));
          var src=Array.isArray(data&&data.sources)?data.sources:[];
          return src.map(function(s){
            var url=clean(s&&s.url);
            if(!/^https?:\/\//i.test(url)) return null;
            var quality=clean(s.quality||"Auto");
            return {
              name:"NoctraTV · Novera · VidKing",
              title:"Novera · VidKing · "+p.name+" · "+quality,
              url:url,
              quality:quality,
              provider:"noctra-novera-vidking",
              headers:{
                "Referer":meta.origin+"/",
                "Origin":meta.origin,
                "User-Agent":UA
              },
              subtitles:[]
            };
          }).filter(Boolean);
        }).catch(function(e){
          console.log("[Noctra/Novera/VidKing] "+p.name+" "+(e&&e.message?e.message:e));
          return [];
        });
      });

      return Promise.all(jobs);
    })
    .then(function(groups){
      var out=[],seen={};
      (groups||[]).forEach(function(g){
        (g||[]).forEach(function(x){
          if(!x||!x.url||seen[x.url]) return;
          seen[x.url]=true; out.push(x);
        });
      });
      out.sort(function(a,b){
        return (parseInt(b.quality,10)||0)-(parseInt(a.quality,10)||0);
      });
      console.log("[Noctra/Novera/VidKing] streams="+out.length);
      return out;
    })
    .catch(function(e){
      console.error("[Noctra/Novera/VidKing] "+(e&&e.message?e.message:e));
      return [];
    });
}

module.exports = { getStreams: getStreams };

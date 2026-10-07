// YesMovies Local for Nuvio
// v0.2.6
// Flow:
// TMDB metadata -> YesMovies /searching JSON -> movie/season page
// -> S1: Nuvio episode number -> Ployan token -> direct HLS.
// -> S2: TMDB -> data.vidsrcme.ru -> WASM/ChaCha20 -> tokenized HLS.
// S2 is isolated: failure never blocks the proven S1 route.

var DEFAULT_BASES=[
  "https://ww2.yesmovies.ag",
  "https://yesmovies.ag",
  "https://ww1.yesmovies.ag"
];
var DEFAULT_TMDB_API_KEY="1865f43a0549ca50d341dd9ab8b29f49";
var UA="Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
var PLOYAN="https://ployan.me";
var S2_API="https://data.vidsrcme.ru/api.php";

var pageCache={};
var lookupCache={};
var warmCache={};
var s2Cache={};
var DIAG=[];

function diag(msg){
  msg=clean(msg).replace(/\s+/g," ").slice(0,160);
  if(msg&&DIAG.indexOf(msg)<0)DIAG.push(msg);
}
function statusRows(){
  var a=[];
  if(DIAG.length<=8)a=DIAG.slice(0);
  else a=DIAG.slice(0,5).concat(DIAG.slice(-3));
  var seen={},b=[];
  a.forEach(function(x){if(x&&!seen[x]){seen[x]=1;b.push(x);}});
  a=b;
  if(!a.length)a=["No route returned a stream"];
  return a.map(function(msg,i){
    var name="YesMovies · DIAG "+(i+1)+" · "+msg;
    return {
      name:name,title:name,
      url:"data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQojRVhULVgtVkVSU0lPTjozCiNFWFQtWC1FTkRMSVNUCg==",
      quality:"Status",type:"hls",
      provider:"yesmovies-direct",headers:{},subtitles:[]
    };
  });
}

function clean(v){return v==null?"":String(v).trim();}
function now(){return Date.now?Date.now():(new Date()).getTime();}
function settings(){try{return (typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS)||{};}catch(_){return{};}}
function log(s){try{console.log("[YesMovies] "+s);}catch(_){}}
function uniq(a){
  var out=[],seen={};
  (a||[]).forEach(function(v){
    v=clean(v); if(!v||seen[v])return; seen[v]=1; out.push(v);
  });
  return out;
}
function decodeHtml(s){
  return clean(s)
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function lower(v){return clean(v).toLowerCase().replace(/\s+/g," ");}
function simple(v){
  return lower(v).replace(/[\u2010-\u2015]/g,"-").replace(/[^a-z0-9]+/g," ").replace(/^\s+|\s+$/g,"");
}
function titleScore(a,b){
  var x=simple(a),y=simple(b);
  if(!x||!y)return 0;
  if(x===y)return 120;
  if(x.indexOf(y)>=0||y.indexOf(x)>=0)return 78;
  var xa=x.split(" "),ya=y.split(" "),hit=0;
  ya.forEach(function(t){if(t.length>1&&xa.indexOf(t)>=0)hit++;});
  return ya.length?Math.round(60*hit/ya.length):0;
}
function slugQuery(v){
  return encodeURIComponent(clean(v).replace(/[^A-Za-z0-9 ]+/g," ").replace(/\s+/g," ").trim()).replace(/%20/g,"+");
}
function absUrl(base,v){
  v=clean(v).replace(/\\\//g,"/");
  if(!v)return"";
  if(/^https?:\/\//i.test(v))return v;
  if(/^\/\//.test(v))return"https:"+v;
  var m=base.match(/^(https?:\/\/[^/]+)/i),origin=m?m[1]:base.replace(/\/$/,"");
  if(v.charAt(0)==="/")return origin+v;
  return origin+"/"+v.replace(/^\.\//,"");
}
function originOf(url){
  var m=clean(url).match(/^(https?:\/\/[^/]+)/i);return m?m[1]:"";
}
function mediaKind(url){
  url=clean(url);
  if(/\.m3u8(?:$|[?#])/i.test(url))return"hls";
  if(/\.mp4(?:$|[?#])/i.test(url))return"mp4";
  if(/\.mpd(?:$|[?#])/i.test(url))return"dash";
  return"";
}
function hasTimers(){try{return typeof setTimeout==="function";}catch(_){return false;}}
function timeout(p,ms,label){
  if(!hasTimers())return p;
  return Promise.race([
    p,
    new Promise(function(_,reject){
      setTimeout(function(){reject(new Error((label||"request")+" timeout"));},ms);
    })
  ]);
}
function baseHeaders(base,referer,accept){
  var h={
    "User-Agent":UA,
    "Accept":accept||"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Referer":referer||base+"/"
  };
  var o=originOf(base);
  if(o)h.Origin=o;
  return h;
}
function xhrHeaders(base,referer){
  var h=baseHeaders(base,referer,"application/json, text/javascript, */*; q=0.01");
  h["X-Requested-With"]="XMLHttpRequest";
  return h;
}
function fetchText(url,opt,ms,label){
  opt=opt||{};
  try{opt.skipSizeCheck=true;}catch(_){}
  if(/yesmovies\.ag/i.test(url)){
    try{opt.credentials="include";}catch(_){}
    try{opt.redirect="follow";}catch(_){}
  }
  return timeout(fetch(url,opt),ms||9000,label||url).then(function(r){
    if(!r||!r.ok)throw new Error((label||"HTTP")+" "+(r?r.status:"no-response"));
    return r.text();
  });
}
function cachedText(url,opt,ttl){
  var hit=pageCache[url];
  if(hit&&hit.expires>now())return Promise.resolve(hit.text);
  return fetchText(url,opt,9000,"page").then(function(t){
    pageCache[url]={expires:now()+(ttl||120000),text:t};
    return t;
  });
}
function jsonMaybe(t){
  t=clean(t);
  if(!t)return null;
  try{return JSON.parse(t);}catch(_){return null;}
}
function htmlFromAjax(t){
  var j=jsonMaybe(t);
  if(j&&typeof j==="object"){
    if(typeof j.html==="string")return j.html.replace(/\\\//g,"/").replace(/\\"/g,'"');
    if(j.data&&typeof j.data.html==="string")return j.data.html.replace(/\\\//g,"/").replace(/\\"/g,'"');
  }
  return t.replace(/\\\//g,"/").replace(/\\"/g,'"');
}
function currentBases(){
  var s=settings(),custom=clean(s.baseUrl),a=[];
  if(custom)a.push(custom.replace(/\/$/,""));
  DEFAULT_BASES.forEach(function(x){a.push(x);});
  return uniq(a);
}
function tmdbKey(){
  var s=settings(),k=clean(s.tmdbApiKey);
  if(k)return k;
  try{
    k=clean(typeof globalThis!=="undefined"&&globalThis.TMDB_API_KEY);
    if(k)return k;
  }catch(_){}
  return DEFAULT_TMDB_API_KEY;
}

function tmdbInfo(id,type){
  var key=tmdbKey();
  if(!key)return Promise.reject(new Error("TMDB key unavailable"));
  var t=type==="tv"?"tv":"movie";
  var u="https://api.themoviedb.org/3/"+t+"/"+encodeURIComponent(String(id))+
    "?api_key="+encodeURIComponent(key)+"&append_to_response=external_ids&language=en-US";
  return fetchText(u,{headers:{"User-Agent":UA,"Accept":"application/json"}},8000,"TMDB").then(function(t){
    var j=JSON.parse(t),title=clean(j.title||j.name),orig=clean(j.original_title||j.original_name);
    var date=clean(j.release_date||j.first_air_date);
    return{
      title:title||orig,
      originalTitle:orig,
      year:parseInt(date.slice(0,4),10)||0,
      imdbId:clean(j.external_ids&&j.external_ids.imdb_id)
    };
  });
}

function extractMovieLinks(html,base){
  var out=[],re=/<a\b[^>]*href=["']([^"']*\/movie\/[^"']+-\d+\.html)["'][^>]*>/ig,m;
  while((m=re.exec(String(html||"")))!==null){
    var tag=m[0],url=absUrl(base,m[1]),tm=tag.match(/\btitle=["']([^"']+)["']/i);
    var pos=m.index,chunk=String(html||"").slice(Math.max(0,pos-500),Math.min(String(html||"").length,pos+1400));
    var title=tm?decodeHtml(tm[1]):"";
    if(!title){
      var hm=chunk.match(/class=["'][^"']*mli-info[^"']*["'][^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if(hm)title=decodeHtml(hm[1].replace(/<[^>]+>/g," "));
    }
    if(!title){
      var am=chunk.match(/<a\b[^>]*href=["'][^"']*\/movie\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
      if(am)title=decodeHtml(am[1].replace(/<[^>]+>/g," "));
    }
    var ym=chunk.match(/(?:jt-info|release|year)[^>]*>[^0-9]{0,20}(19\d{2}|20\d{2})/i);
    if(!ym)ym=chunk.match(/\b(19\d{2}|20\d{2})\b/);
    var idm=url.match(/-(\d+)\.html(?:$|[?#])/i);
    var slugm=url.match(/\/movie\/([^/?#]+)-(\d+)\.html/i);
    if(idm)out.push({url:url,id:idm[1],slug:slugm?slugm[1]:"",title:title,year:ym?parseInt(ym[1],10)||0:0});
  }
  var seen={},ded=[];
  out.forEach(function(x){if(!seen[x.url]){seen[x.url]=1;ded.push(x);}});
  return ded;
}
function scoreCandidate(c,info,type,season){
  var s=Math.max(titleScore(c.title,info.title),titleScore(c.title,info.originalTitle));
  var ct=lower(c.title);
  if(type==="tv"){
    if(ct.indexOf("season "+season)>=0)s+=35;
    else if(ct.match(/season\s+\d+/))s-=25;
  }else if(ct.match(/season\s+\d+/))s-=35;
  if(info.year&&c.year)s+=(Math.abs(info.year-c.year)<=1?18:-8);
  return s;
}
function searchUrls(base,q){
  var e=slugQuery(q);
  return [
    base+"/movie/search/"+e+".html",
    base+"/search/"+e+"/page-1.html",
    base+"/search/"+e+".html"
  ];
}
function exactSlugUrls(base,info,type,season){
  var names=[];
  function add(x){x=clean(x);if(x&&names.indexOf(x)<0)names.push(x);}
  add(info.title);add(info.originalTitle);
  if(type==="tv"){
    add(info.title+" Season "+season);
    add(info.originalTitle+" Season "+season);
  }
  var out=[];
  names.forEach(function(n){
    var sl=lower(n).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    if(!sl)return;
    out.push(base+"/movie/"+sl+".html");
    if(info.year)out.push(base+"/movie/"+sl+"-"+info.year+".html");
  });
  return out;
}
function directSlugProbe(base,info,type,season){
  var urls=exactSlugUrls(base,info,type,season),i=0;
  function next(){
    if(i>=urls.length)return Promise.resolve([]);
    var u=urls[i++];
    return cachedText(u,{headers:baseHeaders(base,base+"/yes.html")},10000)
      .then(function(h){
        var title=stripTags((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
        if(/404\s+not\s+found/i.test(title)||/404\s+not\s+found/i.test(h.slice(0,1200))){
          diag("SLUG · "+u+" · 404");return next();
        }
        var m=u.match(/\/movie\/([^\/?#]+?)-(\d+)\.html/i);
        if(m){
          diag("SLUG · direct hit id "+m[2]);
          return [{url:u,id:m[2],slug:m[1],title:title||m[1]}];
        }
        diag("SLUG · "+u+" · page exists but no numeric movie id");
        return next();
      })
      .catch(function(e){diag("SLUG · "+u+" · "+(e&&e.message?e.message:e));return next();});
  }
  return warmBase(base).then(next);
}
function filterUrls(base,type,year){
  var kind=type==="tv"?"series":"movies", y=year||"all";
  return [
    base+"/movie/filter/"+kind+"/latest/all/all/"+y+"/all/all/page-1.html",
    base+"/movie/filter/"+kind+"/latest/all/all/"+y+"/all/all/",
    base+"/movie/filter/"+kind+".html"
  ];
}
function scanFilter(base,info,type,season){
  var urls=filterUrls(base,type,info.year),i=0;
  function next(){
    if(i>=urls.length)return Promise.resolve([]);
    var u=urls[i++];
    return cachedText(u,{headers:baseHeaders(base,base+"/")},90000)
      .then(function(h){
        var rows=extractMovieLinks(h,base);
        if(rows.length){
          var ranked=rows.slice().sort(function(a,b){
            return scoreCandidate(b,info,type,season)-scoreCandidate(a,info,type,season);
          });
          var sc=ranked.length?scoreCandidate(ranked[0],info,type,season):0;
          diag("FILTER · "+u+" · "+rows.length+" items · best score "+sc);
          if(sc>=35)return ranked;
        }else diag("FILTER · "+u+" · parsed 0 items");
        return next();
      })
      .catch(function(e){
        diag("FILTER · "+u+" · "+(e&&e.message?e.message:e));
        return next();
      });
  }
  return warmBase(base).then(next);
}
function warmBase(base){
  if(warmCache[base])return warmCache[base];
  warmCache[base]=fetchText(base+"/",{headers:baseHeaders(base,base+"/")},7000,"warmup")
    .then(function(t){
      diag("WARMUP · "+base+" · ok "+String(t||"").length+" bytes");
      return true;
    })
    .catch(function(e){
      diag("WARMUP · "+base+" · "+(e&&e.message?e.message:e));
      return false;
    });
  return warmCache[base];
}
function searchOne(base,q){
  var urls=searchUrls(base,q),i=0;
  function next(){
    if(i>=urls.length)return Promise.resolve([]);
    var u=urls[i++];
    return cachedText(u,{headers:baseHeaders(base,base+"/")},90000)
      .then(function(h){
        var rows=extractMovieLinks(h,base);
        if(rows.length){
          diag("SEARCH · "+u+" · ok "+rows.length+" results");
          log("search "+u+" => "+rows.length);return rows;
        }
        diag("SEARCH · "+u+" · HTTP 200 but parsed 0 results");
        return next();
      })
      .catch(function(e){
        var m="search "+u+" · "+(e&&e.message?e.message:e);
        log(m);diag(m);return next();
      });
  }
  return warmBase(base).then(next);
}
function queriesFor(info,type,season){
  var q=[];
  if(type==="tv"){
    q.push(info.title+" Season "+season);
    if(info.originalTitle&&lower(info.originalTitle)!==lower(info.title))q.push(info.originalTitle+" Season "+season);
  }
  q.push(info.title);
  if(info.originalTitle&&lower(info.originalTitle)!==lower(info.title))q.push(info.originalTitle);
  return uniq(q);
}
function apiFindPage(info,type,season){
  var bases=currentBases(),bi=0;
  function normalizeTitle(v){
    return simple(v).replace(/\s+season\s+\d+$/i,"").trim();
  }
  function tokenQueries(v){
    var stop={the:1,a:1,an:1,and:1,or:1,of:1,to:1,in:1,on:1,for:1,with:1,at:1,by:1,from:1,season:1};
    var parts=normalizeTitle(v).split(/\s+/).filter(function(x){return x&&x.length>=3&&!stop[x];});
    var out=[];
    parts.forEach(function(x){if(out.indexOf(x)<0)out.push(x);});
    if(!out.length&&parts.length===0){
      var one=normalizeTitle(v);if(one)out.push(one);
    }
    return out;
  }
  var queries=[];
  function addTokens(v){
    tokenQueries(v).forEach(function(x){if(queries.indexOf(x)<0)queries.push(x);});
  }
  addTokens(info.title);
  addTokens(info.originalTitle);

  function scoreRows(arr,q){
    var wantType=type==="tv"?"s":"m";
    var target=normalizeTitle(info.title||info.originalTitle||q);
    return arr.map(function(x){
      var title=decodeHtml(x&&x.t),baseTitle=normalizeTitle(title),sc=0;
      if(clean(x&&x.d)===wantType)sc+=45; else sc-=80;
      if(baseTitle===target)sc+=140;
      else sc+=Math.max(titleScore(baseTitle,target),titleScore(baseTitle,normalizeTitle(q)));
      if(type==="tv"){
        if(Number(x&&x.n)===Number(season))sc+=80; else sc-=60;
      }else if(info.year&&Number(x&&x.y)===Number(info.year))sc+=35;
      return{x:x,score:sc,title:title};
    }).sort(function(a,b){return b.score-a.score;});
  }

  function tryBase(base){
    var qi=0;
    function nextQuery(){
      if(qi>=queries.length)return Promise.resolve(null);
      var q=queries[qi++];
      var u=base+"/searching?q="+encodeURIComponent(q)+"&limit=40&offset=0";
      return fetchText(u,{headers:baseHeaders(base,base+"/search.html","application/json, text/plain, */*")},9000,"searching")
        .then(function(t){
          var j=jsonMaybe(t),arr=j&&Array.isArray(j.data)?j.data:[];
          diag("SEARCHING · token "+q+" · "+arr.length);
          if(!arr.length)return nextQuery();
          var ranked=scoreRows(arr,q),best=ranked[0];
          if(!best||best.score<120){
            diag("SEARCHING · token "+q+" · best "+(best?best.score:0));
            return nextQuery();
          }
          var slug=clean(best.x.s),idm=slug.match(/-(\d+)$/);
          if(!slug||!idm){
            diag("SEARCHING · result missing internal id");
            return nextQuery();
          }
          return{
            url:base+"/movie/"+slug+".html",
            id:idm[1],
            slug:slug,
            title:best.title,
            year:Number(best.x.y)||0,
            base:base
          };
        }).catch(function(e){
          diag("SEARCHING · token "+q+" · "+(e&&e.message?e.message:e));
          return nextQuery();
        });
    }
    return nextQuery();
  }

  function nextBase(){
    if(bi>=bases.length)return Promise.reject(new Error("YesMovies search API unavailable"));
    var base=bases[bi++];
    return tryBase(base).then(function(match){
      if(match){
        diag("MATCH · "+match.title+" · id "+match.id+" · API");
        return match;
      }
      return nextBase();
    });
  }

  diag("TMDB · "+(info.title||"?")+(type==="tv"?(" · S"+season):""));
  return nextBase();
}

function findPage(info,type,season){
  return apiFindPage(info,type,season);
}

function bytesToHex(a){
  var out="",i;
  for(i=0;i<a.length;i++)out+=(a[i]<16?"0":"")+a[i].toString(16);
  return out;
}
function hexToBytes(h){
  h=clean(h);var a=new Uint8Array(Math.floor(h.length/2)),i;
  for(i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16)||0;
  return a;
}
function utf8Bytes(v){
  var s=unescape(encodeURIComponent(String(v))),a=new Uint8Array(s.length),i;
  for(i=0;i<s.length;i++)a[i]=s.charCodeAt(i)&255;
  return a;
}
function utf8Hex(v){return bytesToHex(utf8Bytes(v));}
function randomHex(n){
  try{
    if(typeof __crypto_get_random_values_hex==="function"){
      var x=clean(__crypto_get_random_values_hex(n));
      if(x.length===n*2)return x;
    }
  }catch(_){}
  try{
    var a=new Uint8Array(n);
    if(typeof crypto!=="undefined"&&crypto.getRandomValues){crypto.getRandomValues(a);return bytesToHex(a);}
  }catch(_){}
  var out="",i;
  for(i=0;i<n;i++){var b=Math.floor(Math.random()*256);out+=(b<16?"0":"")+b.toString(16);}
  return out;
}
function ployanToken(plaintext){
  var saltHex=randomHex(8),ivHex=randomHex(12),passHex=utf8Hex("player"),dataHex=utf8Hex(plaintext);
  try{
    if(typeof __crypto_pbkdf2_hex==="function"&&typeof __crypto_aes_encrypt_hex==="function"){
      var keyHex=__crypto_pbkdf2_hex(passHex,saltHex,1000,256,"SHA256");
      var cipherHex=__crypto_aes_encrypt_hex("AES-GCM",keyHex,ivHex,dataHex);
      if(keyHex&&cipherHex)return Promise.resolve(saltHex+"-"+ivHex+"-"+cipherHex);
    }
  }catch(e){log("native crypto "+(e&&e.message?e.message:e));}
  try{
    var subtle=(typeof crypto!=="undefined"&&crypto.subtle)?crypto.subtle:null;
    if(!subtle)throw new Error("crypto unavailable");
    return subtle.importKey("raw",utf8Bytes("player"),"PBKDF2",false,["deriveKey"])
      .then(function(material){
        return subtle.deriveKey(
          {name:"PBKDF2",salt:hexToBytes(saltHex),iterations:1000,hash:"SHA-256"},
          material,{name:"AES-GCM",length:256},false,["encrypt"]
        );
      }).then(function(key){
        return subtle.encrypt({name:"AES-GCM",iv:hexToBytes(ivHex)},key,utf8Bytes(plaintext));
      }).then(function(buf){
        return saltHex+"-"+ivHex+"-"+bytesToHex(new Uint8Array(buf));
      });
  }catch(e){
    return Promise.reject(e);
  }
}
function subtitleId(mid,eid){
  var s=String(mid)+"-"+String(eid),out="",i,b;
  for(i=0;i<s.length;i++){b=s.charCodeAt(i)^0x13;out+=(b<16?"0":"")+b.toString(16);}
  return out;
}

function attr(tag,name){
  var re=new RegExp("\\b"+name+"=[\"']([^\"']*)[\"']","i"),m=String(tag||"").match(re);
  return m?decodeHtml(m[1]):"";
}
function parseEpisodeItems(html){
  html=htmlFromAjax(html);
  var out=[],re=/<li\b([^>]*\bep-item\b[^>]*)>([\s\S]*?)<\/li>/ig,m;
  while((m=re.exec(html))!==null){
    var tag=m[1],body=m[2],id=attr(tag,"data-id"),server=attr(tag,"data-server"),label="";
    var am=body.match(/<a\b[^>]*\btitle=["']([^"']+)["']/i);
    if(am)label=decodeHtml(am[1]);
    if(!label){
      var tm=body.match(/>([^<>]{1,80})<\/a>/i);
      if(tm)label=decodeHtml(tm[1]);
    }
    if(id)out.push({id:id,server:server||"?",label:label});
  }
  if(!out.length){
    var parts=html.split(/ep-item/i);
    for(var i=1;i<parts.length;i++){
      var c=parts[i].slice(0,1000),idm=c.match(/data-id=["']([^"']+)["']/i),sm=c.match(/data-server=["']([^"']+)["']/i),lm=c.match(/title=["']([^"']+)["']/i);
      if(idm)out.push({id:idm[1],server:sm?sm[1]:"?",label:lm?decodeHtml(lm[1]):""});
    }
  }
  return out;
}
function wantEpisode(row,type,episode){
  if(type==="movie")return true;
  var n=Number(episode)||1,l=lower(row.label);
  if(!l)return false;
  var m=l.match(/episode\s*0*(\d+)/i);
  return !!(m&&Number(m[1])===n);
}
function loadEpisodeItems(match,type,episode){
  var eid=type==="tv"?(Number(episode)||1):1;
  diag("EPISODES · "+(type==="tv"?("TV E"+eid):"movie")+" · direct id "+eid);
  return Promise.resolve([{id:String(eid),server:"1",label:type==="tv"?("Episode "+eid):"Movie"}]);
}

function directUrlsFromObject(obj){
  var out=[];
  function walk(v,depth){
    if(depth>8||v==null)return;
    if(typeof v==="string"){
      var s=v.replace(/\\\//g,"/");
      var re=/https?:\/\/[^"'<>\\\s]+/ig,m;
      while((m=re.exec(s))!==null){
        var u=m[0].replace(/[),;]+$/,"");
        if(mediaKind(u))out.push(u);
      }
      return;
    }
    if(Array.isArray(v)){v.forEach(function(x){walk(x,depth+1);});return;}
    if(typeof v==="object"){
      Object.keys(v).forEach(function(k){walk(v[k],depth+1);});
    }
  }
  walk(obj,0);
  return uniq(out);
}
function urlsFromSourcePayload(t){
  var out=[],j=jsonMaybe(t);
  if(j)out=out.concat(directUrlsFromObject(j));
  var s=String(t||"").replace(/\\\//g,"/");
  var patterns=[
    /(?:file|src|source)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/ig,
    /["'](https?:\/\/[^"']+\.(?:m3u8|mp4|mpd)(?:\?[^"']*)?)["']/ig
  ];
  patterns.forEach(function(re){
    var m;while((m=re.exec(s))!==null){if(mediaKind(m[1]))out.push(m[1]);}
  });
  return uniq(out);
}
function embedUrlFromPayload(t,base){
  var j=jsonMaybe(t),c=[];
  if(j){
    ["src","url","embed","link"].forEach(function(k){if(j[k])c.push(j[k]);});
    if(j.data){["src","url","embed","link"].forEach(function(k){if(j.data[k])c.push(j.data[k]);});}
  }
  var s=String(t||"").replace(/\\\//g,"/");
  var re=/(?:iframe[^>]+src|src|url|embed)\s*[:=]\s*["']([^"']+)["']/ig,m;
  while((m=re.exec(s))!==null)c.push(m[1]);
  c=c.map(function(x){return absUrl(base,x);}).filter(function(x){return /^https?:\/\//i.test(x);});
  return uniq(c);
}
function nestedMedia(pageUrl,referer,depth){
  depth=depth||0;
  if(depth>2)return Promise.resolve([]);
  if(mediaKind(pageUrl))return Promise.resolve([{url:pageUrl,referer:referer}]);
  var base=originOf(pageUrl)||originOf(referer);
  return fetchText(pageUrl,{headers:baseHeaders(base,referer||base+"/","text/html,application/xhtml+xml,*/*")},8000,"embed").then(function(t){
    var direct=urlsFromSourcePayload(t).map(function(u){return{url:u,referer:pageUrl};});
    if(direct.length)return direct;
    var embeds=embedUrlFromPayload(t,pageUrl).filter(function(u){return u!==pageUrl;}).slice(0,3);
    if(!embeds.length)return[];
    return Promise.all(embeds.map(function(u){return nestedMedia(u,pageUrl,depth+1).catch(function(){return[];});}))
      .then(function(gs){var a=[];gs.forEach(function(g){a=a.concat(g||[]);});return a;});
  }).catch(function(){return[];});
}

function tokenXY(base,match,row){
  var u=base+"/ajax/movie_token?eid="+encodeURIComponent(row.id)+"&mid="+encodeURIComponent(match.id)+"&_="+now();
  return fetchText(u,{headers:xhrHeaders(base,match.url)},7000,"token").then(function(t){
    var x="",y="",mx=t.match(/(?:^|[^A-Za-z0-9_])_?x\s*=\s*["']([^"']+)["']/),my=t.match(/(?:^|[^A-Za-z0-9_])_?y\s*=\s*["']([^"']+)["']/);
    if(mx)x=mx[1]; if(my)y=my[1];
    if(!x||!y){
      var j=jsonMaybe(t);
      if(j){x=clean(j.x||j._x);y=clean(j.y||j._y);}
    }
    if(x&&y){log("token plain server="+row.server);return{x:x,y:y};}
    diag("TOKEN · server "+row.server+" token present but x/y not directly readable");
    throw new Error("token obfuscated");
  });
}
function getSourcePayloads(match,row){
  var base=match.base,hs=xhrHeaders(base,match.url),jobs=[];
  var embed=base+"/ajax/movie_embed/"+encodeURIComponent(row.id);
  jobs.push(fetchText(embed,{headers:hs},7000,"movie_embed").then(function(t){return{kind:"embed",text:t,url:embed};}).catch(function(){return null;}));
  var raw=base+"/ajax/movie_sources/"+encodeURIComponent(row.id);
  jobs.push(fetchText(raw,{headers:hs},7000,"movie_sources raw").then(function(t){return{kind:"sources",text:t,url:raw};}).catch(function(){return null;}));
  jobs.push(tokenXY(base,match,row).then(function(p){
    var u=raw+"?x="+encodeURIComponent(p.x)+"&y="+encodeURIComponent(p.y);
    return fetchText(u,{headers:hs},7000,"movie_sources token").then(function(t){return{kind:"sources",text:t,url:u};});
  }).catch(function(){return null;}));
  try{
    var form="eid="+encodeURIComponent(row.id);
    var ph=xhrHeaders(base,match.url);
    ph["Content-Type"]="application/x-www-form-urlencoded; charset=UTF-8";
    jobs.push(fetchText(base+"/ajax/movie_sources/",{method:"POST",headers:ph,body:form},7000,"movie_sources post")
      .then(function(t){return{kind:"sources",text:t,url:base+"/ajax/movie_sources/"};}).catch(function(){return null;}));
  }catch(_){}
  return Promise.all(jobs).then(function(a){
    var ok=(a||[]).filter(Boolean);
    if(!ok.length)diag("SOURCES · server "+row.server+" all movie_embed/movie_sources requests failed");
    return ok;
  });
}
function fetchPloyanSubtitles(mid,eid){
  var sid=subtitleId(mid,eid);
  var u=PLOYAN+"/sub/"+sid+"/index.json";
  var h={"User-Agent":UA,"Accept":"application/json, text/plain, */*","Referer":PLOYAN+"/","Origin":PLOYAN};
  return fetchText(u,{headers:h},7000,"ployan subtitles").then(function(t){
    var j=jsonMaybe(t),arr=Array.isArray(j)?j:[];
    var out=[];
    arr.forEach(function(x){
      if(!x||!x.file)return;
      var su=/^https?:\/\//i.test(x.file)?x.file:(PLOYAN+String(x.file));
      out.push({
        url:su,
        language:clean(x.lang)||"und",
        name:clean(x.label)||clean(x.lang)||"Subtitle",
        headers:{"Referer":PLOYAN+"/","User-Agent":UA}
      });
    });
    diag("SUB · "+out.length+" track(s)");
    return out;
  }).catch(function(e){
    log("subtitle "+(e&&e.message?e.message:e));
    diag("SUB · unavailable");
    return[];
  });
}

function resolveRow(match,row){
  var sv="1",eid=clean(row.id)||"1";
  var stamp=Math.floor(now()/1000);
  var plain=String(match.id)+"+"+eid+"+"+sv+"+"+stamp;
  return Promise.all([
    ployanToken(plain).then(function(token){
      var watch=PLOYAN+"/watch/?v"+sv+eid;
      var h={"User-Agent":UA,"Accept":"application/json, text/plain, */*","Referer":watch,"Origin":PLOYAN};
      return fetchText(PLOYAN+"/get/"+token,{headers:h},9000,"ployan get");
    }),
    fetchPloyanSubtitles(match.id,eid)
  ]).then(function(parts){
    var t=parts[0],subs=parts[1]||[],j=jsonMaybe(t);
    if(!j||Number(j.code)!==200||!j.info){
      diag("PLOYAN · invalid response for episode "+eid);
      throw new Error("ployan refused token");
    }
    if(clean(j.mode)!=="direct"){
      diag("PLOYAN · server 1 mode "+clean(j.mode));
      throw new Error("ployan mode is not direct");
    }
    var hls=PLOYAN+"/hls/"+clean(j.info)+"/master.m3u8";
    diag("PLOYAN · direct HLS resolved · episode "+eid);
    return[{url:hls,referer:PLOYAN+"/",server:"1",subtitles:subs}];
  });
}

function stdQuality(w,h){
  w=parseInt(w||0,10)||0;h=parseInt(h||0,10)||0;
  if(w>=3500||h>=1800)return"2160p";
  if(w>=2400||h>=1300)return"1440p";
  if(w>=1800||h>=1000)return"1080p";
  if(w>=1200||h>=650)return"720p";
  if(w>=800||h>=440)return"480p";
  if(w>=600||h>=320)return"360p";
  return h>0?(h+"p"):"Auto";
}
function parseMaster(text,masterUrl){
  var lines=String(text||"").replace(/\r/g,"").split("\n"),out=[];
  for(var i=0;i<lines.length;i++){
    var line=lines[i].trim();
    if(line.indexOf("#EXT-X-STREAM-INF:")!==0)continue;
    var rm=line.match(/RESOLUTION=(\d+)x(\d+)/i),uri="";
    for(var j=i+1;j<lines.length;j++){
      var n=lines[j].trim();if(!n)continue;if(n.charAt(0)==="#")continue;uri=n;break;
    }
    if(uri){
      var w=rm?parseInt(rm[1],10):0,h=rm?parseInt(rm[2],10):0;
      out.push({url:absUrl(masterUrl,uri),quality:stdQuality(w,h),width:w,height:h});
    }
  }
  return out;
}
function playbackHeaders(referer){
  var base=originOf(referer)||referer,h={"User-Agent":UA,"Referer":referer||base+"/"};
  if(base)h.Origin=base;
  return h;
}
function verifyAndExpand(row){
  var kind=mediaKind(row.url),h=playbackHeaders(row.referer);
  if(kind==="hls"){
    return fetchText(row.url,{headers:h},8000,"HLS").then(function(t){
      if(t.indexOf("#EXTM3U")<0)throw new Error("not HLS");
      var vars=parseMaster(t,row.url);
      if(!vars.length){var qm=t.match(/\/(2160|1440|1080|720|480|360)\//);return[{url:row.url,quality:qm?(qm[1]+"p"):"Auto",type:"hls",headers:h,server:row.server,subtitles:row.subtitles||[]}];}
      return vars.map(function(v){return{url:v.url,quality:v.quality,type:"hls",headers:h,server:row.server,subtitles:row.subtitles||[]};});
    });
  }
  if(kind==="mpd"){
    return fetchText(row.url,{headers:h},8000,"DASH").then(function(t){
      if(t.indexOf("<MPD")<0&&t.indexOf("<mpd")<0)throw new Error("not DASH");
      return[{url:row.url,quality:"Auto",type:"dash",headers:h,server:row.server}];
    });
  }
  if(kind==="mp4"){
    var hh=playbackHeaders(row.referer);hh.Range="bytes=0-63";
    return timeout(fetch(row.url,{headers:hh}),8000,"MP4").then(function(r){
      if(!r||!r.ok)throw new Error("MP4 "+(r?r.status:"no-response"));
      delete hh.Range;
      return[{url:row.url,quality:"Auto",type:"mp4",headers:hh,server:row.server}];
    });
  }
  return Promise.resolve([]);
}


/* =========================
 * S2 isolated resolver
 * Current chain verified against Interstellar:
 * data.vidsrcme.ru API -> encrypted stream_urls + wasm_url
 * -> recover ChaCha20 key from WASM data segments -> HLS.
 * ========================= */
function s2FetchOk(url,opt,label,ms){
  opt=opt||{};
  try{opt.skipSizeCheck=true;}catch(_){}
  return timeout(fetch(url,opt),ms||10000,label||url).then(function(r){
    if(!r||!r.ok)throw new Error((label||"HTTP")+" "+(r?r.status:"no-response"));
    return r;
  });
}
function s2Rd32(b,o){return ((b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0);}
function s2Rotl(x,n){return ((x<<n)|(x>>>(32-n)))>>>0;}
function s2ChaChaBlock(k,c,n){
  var st=[1634760805,857760878,2036477234,1797285236,k[0],k[1],k[2],k[3],k[4],k[5],k[6],k[7],c>>>0,n[0]>>>0,n[1]>>>0,n[2]>>>0];
  var x=st.slice();
  function q(a,b,c0,d){
    x[a]=(x[a]+x[b])>>>0;x[d]=s2Rotl(x[d]^x[a],16);
    x[c0]=(x[c0]+x[d])>>>0;x[b]=s2Rotl(x[b]^x[c0],12);
    x[a]=(x[a]+x[b])>>>0;x[d]=s2Rotl(x[d]^x[a],8);
    x[c0]=(x[c0]+x[d])>>>0;x[b]=s2Rotl(x[b]^x[c0],7);
  }
  for(var i=0;i<10;i++){
    q(0,4,8,12);q(1,5,9,13);q(2,6,10,14);q(3,7,11,15);
    q(0,5,10,15);q(1,6,11,12);q(2,7,8,13);q(3,4,9,14);
  }
  var out=new Uint8Array(64);
  for(var j=0;j<16;j++){
    var w=(x[j]+st[j])>>>0;
    out[j*4]=w&255;out[j*4+1]=(w>>>8)&255;out[j*4+2]=(w>>>16)&255;out[j*4+3]=(w>>>24)&255;
  }
  return out;
}
function s2Leb(b,p){
  var r=0,shift=0,v=0;
  do{
    if(p>=b.length)throw new Error("WASM leb overflow");
    v=b[p++];r|=(v&127)<<shift;
    if((v&128)===0)break;
    shift+=7;
  }while(shift<35);
  return[r>>>0,p];
}
function s2WasmSegments(b){
  if(!b||b.length<8||b[0]!==0||b[1]!==97||b[2]!==115||b[3]!==109)throw new Error("bad WASM");
  var out=[],p=8;
  while(p<b.length){
    var id=b[p++],r=s2Leb(b,p),len=r[0];p=r[1];
    var end=p+len;if(end>b.length)throw new Error("WASM section overflow");
    if(id===11){
      r=s2Leb(b,p);var cnt=r[0];p=r[1];
      for(var i=0;i<cnt;i++){
        r=s2Leb(b,p);var flags=r[0];p=r[1];var off=-1;
        if(flags===0||flags===1){
          if(flags===1){r=s2Leb(b,p);p=r[1];}
          if(b[p]===0x41){p++;r=s2Leb(b,p);off=r[0];p=r[1];}
          if(b[p]===0x0b)p++;
        }else if(flags===2){
          r=s2Leb(b,p);p=r[1];
          if(b[p]===0x41){p++;r=s2Leb(b,p);off=r[0];p=r[1];}
          if(b[p]===0x0b)p++;
        }
        r=s2Leb(b,p);var dl=r[0];p=r[1];
        var data=b.slice(p,p+dl);p+=dl;
        if(off>=0)out.push({off:off,data:data});
      }
    }
    p=end;
  }
  return out;
}
function s2RecoverKey(wasm,enc){
  var segs=s2WasmSegments(wasm),base=null;
  for(var i=0;i<segs.length;i++){
    if(segs[i].off===0&&segs[i].data.length>=32){base=segs[i];break;}
  }
  if(!base)throw new Error("WASM base key segment missing");
  var nonce=[s2Rd32(enc,0),s2Rd32(enc,4),s2Rd32(enc,8)];
  for(var c=0;c<segs.length;c++){
    var d=segs[c];
    if(d.off<256||d.data.length<32)continue;
    var kw=[];
    for(var j=0;j<8;j++)kw.push((s2Rd32(base.data,j*4)^s2Rd32(d.data,j*4))>>>0);
    var ks=s2ChaChaBlock(kw,0,nonce);
    if(((enc[12]^ks[0])&255)===104&&((enc[13]^ks[1])&255)===116&&((enc[14]^ks[2])&255)===116&&((enc[15]^ks[3])&255)===112)return kw;
  }
  throw new Error("ChaCha key recovery failed");
}
function s2Base64Bytes(s){
  s=clean(s).replace(/\s+/g,"");
  var abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out=[],buf=0,bits=0;
  for(var i=0;i<s.length;i++){
    var ch=s.charAt(i);if(ch==="=")break;
    var v=abc.indexOf(ch);if(v<0)continue;
    buf=(buf<<6)|v;bits+=6;
    if(bits>=8){bits-=8;out.push((buf>>bits)&255);}
  }
  return new Uint8Array(out);
}
function s2Utf8(b){
  var str="",i;
  for(i=0;i<b.length;i++)str+=String.fromCharCode(b[i]);
  try{return decodeURIComponent(escape(str));}catch(_){return str;}
}
function s2DecryptUrls(encB64,wasm){
  var enc=s2Base64Bytes(encB64);
  if(enc.length<16)throw new Error("encrypted stream_urls too short");
  var key=s2RecoverKey(wasm,enc);
  var nonce=[s2Rd32(enc,0),s2Rd32(enc,4),s2Rd32(enc,8)];
  var ct=enc.slice(12),out=new Uint8Array(ct.length);
  for(var b=0;b<Math.ceil(ct.length/64);b++){
    var ks=s2ChaChaBlock(key,b,nonce);
    for(var j=0;j<64&&b*64+j<ct.length;j++)out[b*64+j]=ct[b*64+j]^ks[j];
  }
  return s2Utf8(out).split(/\r?\n/).map(clean).filter(function(x){return /^https?:\/\//i.test(x);});
}
function s2QualityFromName(name){
  var m=clean(name).match(/(?:\[|\.|\s)(2160|1440|1080|720|480|360)p(?:\]|\.|\s|\/)/i);
  return m?m[1]+"p":"Auto";
}
function s2TokenFromText(t){
  t=clean(t);if(!t)return"";
  if(t.charAt(0)==="{"){
    try{var j=JSON.parse(t);return clean(j.token||j.data||j.result);}catch(_){}
  }
  return t;
}
function s2PrepareUrl(u){
  var o=originOf(u);if(!o)return Promise.resolve(null);
  return s2FetchOk(o+"/generate.php",{headers:{"User-Agent":UA,"Accept":"*/*"}},"S2 token",7000)
    .then(function(r){return r.text();})
    .then(function(t){
      var tok=s2TokenFromText(t);
      if(!tok)return u;
      return u+(u.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(tok);
    }).catch(function(){return u;});
}
function s2ApiPayload(id,type,season,episode){
  var u=S2_API+"?type="+(type==="tv"?"tv":"movie")+"&tmdb="+encodeURIComponent(id)+"&stream_urls";
  if(type==="tv")u+="&season="+encodeURIComponent(season)+"&episode="+encodeURIComponent(episode);
  return s2FetchOk(u,{
    headers:{
      "User-Agent":UA,
      "Accept":"application/json",
      "Referer":"https://cloudorchestranova.com/"
    }
  },"S2 API",10000).then(function(r){return r.json();});
}
function s2ExtractRawUrls(j){
  if(!j||String(j.status_code)!=="200"||!j.data)throw new Error("API status "+(j&&j.status_code));
  var su=j.data.stream_urls,file=clean(j.data.file_name);
  if(Array.isArray(su))return Promise.resolve({urls:su,file:file});
  if(typeof su!=="string"||!su||!j.vs||!j.vs.wasm_url)throw new Error("encrypted stream data missing");
  return s2FetchOk(j.vs.wasm_url,{
    headers:{"User-Agent":UA,"Referer":"https://cloudorchestranova.com/"}
  },"S2 WASM",10000)
    .then(function(r){return r.arrayBuffer();})
    .then(function(buf){
      var urls=s2DecryptUrls(su,new Uint8Array(buf));
      return{urls:urls,file:file};
    });
}
function s2VerifyOne(raw,fallbackQ){
  return s2PrepareUrl(raw).then(function(u){
    if(!u)return[];
    return fetchText(u,{headers:{"User-Agent":UA}},9000,"S2 HLS").then(function(t){
      if(t.indexOf("#EXTM3U")<0)throw new Error("not HLS");
      var vars=parseMaster(t,u);
      if(vars.length){
        return vars.map(function(v){
          return{url:v.url,quality:v.quality||fallbackQ||"Auto",type:"hls",headers:{"User-Agent":UA},server:"2",subtitles:[]};
        });
      }
      var qm=t.match(/\/(2160|1440|1080|720|480|360)(?:p)?\//i);
      return[{url:u,quality:qm?(qm[1]+"p"):(fallbackQ||"Auto"),type:"hls",headers:{"User-Agent":UA},server:"2",subtitles:[]}];
    });
  }).catch(function(e){
    log("S2 host "+originOf(raw)+" "+(e&&e.message?e.message:e));
    return[];
  });
}
function resolveS2Streams(id,type,season,episode){
  var key=[type,id,season||0,episode||0].join(":");
  var hit=s2Cache[key];
  if(hit&&hit.expires>now())return Promise.resolve(hit.rows);
  return s2ApiPayload(id,type,season,episode)
    .then(function(j){
      var f=clean(j&&j.data&&j.data.file_name);
      log("S2 API "+(f||"200"));
      return s2ExtractRawUrls(j);
    })
    .then(function(x){
      var fallback=s2QualityFromName(x.file);
      log("S2 decrypted urls="+x.urls.length+" fallback="+fallback);
      if(!x.urls.length)throw new Error("no decrypted URLs");
      return Promise.all(x.urls.slice(0,4).map(function(u){return s2VerifyOne(u,fallback);}));
    })
    .then(function(groups){
      var all=[];groups.forEach(function(g){all=all.concat(g||[]);});
      var seen={},out=[];
      all.forEach(function(x){
        var k=x.url+"|"+x.quality;
        if(!seen[k]){seen[k]=1;out.push(x);}
      });
      out.sort(function(a,b){return(parseInt(b.quality,10)||0)-(parseInt(a.quality,10)||0);});
      var rows=out.map(function(x){
        var q=x.quality||"Auto",name="YesMovies · S2 · "+q;
        return{name:name,title:name,url:x.url,quality:q,type:"hls",provider:"yesmovies-direct",headers:x.headers||{"User-Agent":UA},subtitles:[],server:"2"};
      });
      s2Cache[key]={expires:now()+10*60*1000,rows:rows};
      if(rows.length)diag("S2 · "+rows.length+" playable HLS");
      else diag("S2 · no playable HLS");
      return rows;
    })
    .catch(function(e){
      var m=e&&e.message?e.message:e;
      log("S2 ERROR "+m);
      diag("S2 · "+m);
      s2Cache[key]={expires:now()+2*60*1000,rows:[]};
      return[];
    });
}

function resolveStreams(id,type,season,episode){
  var key=[type,id,season||0,episode||0].join(":");
  var hit=lookupCache[key];
  if(hit&&hit.expires>now())return Promise.resolve(hit.rows);
  return tmdbInfo(id,type).then(function(info){
    log(type+" "+id+" "+info.title+(type==="tv"?" S"+season+"E"+episode:""));
    return findPage(info,type,season);
  }).then(function(match){
    return loadEpisodeItems(match,type,episode).then(function(items){
      return Promise.all(items.slice(0,12).map(function(row){return resolveRow(match,row).catch(function(e){log("resolve row "+row.server+" "+(e&&e.message?e.message:e));return[];});}));
    });
  }).then(function(groups){
    var rows=[];groups.forEach(function(g){rows=rows.concat(g||[]);});
    var seen={},ded=[];
    rows.forEach(function(r){if(r.url&&!seen[r.url]){seen[r.url]=1;ded.push(r);}});
    if(!ded.length){diag("MEDIA · no direct candidates from selected servers");throw new Error("no direct media candidates");}
    return Promise.all(ded.slice(0,12).map(function(r){return verifyAndExpand(r).catch(function(e){log("verify "+r.url.slice(0,100)+" "+(e&&e.message?e.message:e));return[];});}));
  }).then(function(groups){
    var v=[];groups.forEach(function(g){v=v.concat(g||[]);});
    var seen={},out=[];
    v.forEach(function(r){
      var k=r.url+"|"+r.quality;
      if(!seen[k]){seen[k]=1;out.push(r);}
    });
    out.sort(function(a,b){
      var sa=parseInt(a.server||0,10)||0,sb=parseInt(b.server||0,10)||0;
      if(sa!==sb)return sa-sb;
      return (parseInt(b.quality||0,10)||0)-(parseInt(a.quality||0,10)||0);
    });
    var finalRows=out.map(function(r,i){
      var q=r.quality||"Auto",s=r.server&&r.server!=="?"?("S"+r.server):("S"+(i+1));
      var name="YesMovies · "+s+" · "+q;
      return{name:name,title:name,url:r.url,quality:q,type:r.type,provider:"yesmovies-direct",headers:r.headers,subtitles:r.subtitles||[]};
    });
    lookupCache[key]={expires:now()+20*60*1000,rows:finalRows};
    log("verified streams="+finalRows.length);
    if(!finalRows.length)diag("VERIFY · all direct candidates failed validation");
    return finalRows.length?finalRows:statusRows();
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  DIAG=[];
  mediaType=mediaType==="tv"?"tv":"movie";
  if(!tmdbId){diag("INPUT · missing TMDB id");return Promise.resolve(statusRows());}
  if(mediaType==="tv"&&(!season||!episode)){diag("INPUT · TV season/episode missing");return Promise.resolve(statusRows());}
  var id=String(tmdbId);
  return Promise.all([
    resolveStreams(id,mediaType,season,episode).catch(function(e){
      var m=e&&e.message?e.message:e;
      log("S1 ERROR "+m);diag("S1 · "+m);return[];
    }),
    resolveS2Streams(id,mediaType,season,episode)
  ]).then(function(groups){
    var all=[],seen={},out=[];
    groups.forEach(function(g){
      (g||[]).forEach(function(r){
        if(!r||r.quality==="Status"||/^data:/i.test(clean(r.url)))return;
        var k=clean(r.url)+"|"+clean(r.quality)+"|"+clean(r.name);
        if(!seen[k]){seen[k]=1;all.push(r);}
      });
    });
    all.sort(function(a,b){
      var sa=/· S(\d+)/.test(a.name||"")?parseInt(RegExp.$1,10):9;
      var sb=/· S(\d+)/.test(b.name||"")?parseInt(RegExp.$1,10):9;
      if(sa!==sb)return sa-sb;
      return(parseInt(b.quality,10)||0)-(parseInt(a.quality,10)||0);
    });
    out=all;
    log("combined verified streams="+out.length);
    return out.length?out:statusRows();
  }).catch(function(e){
    var m=e&&e.message?e.message:e;
    log("ERROR "+m);diag("RUNTIME · "+m);
    return statusRows();
  });
}
function onSettings(){
  return[
    {type:"header",label:"YesMovies Local"},
    {type:"info",label:"使用 YesMovies 当前 /searching + Ployan S1，并并行尝试 S2（VidSrc/VSEmbed WASM/ChaCha20）真实 HLS。"},
    {
      type:"text",
      key:"baseUrl",
      label:"YesMovies 域名（可选）",
      description:"默认依次尝试 ww2.yesmovies.ag、yesmovies.ag、ww1.yesmovies.ag。若网站更换域名，可在这里覆盖，例如 https://ww3.example.com",
      defaultValue:""
    },
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"用于把 Nuvio 的 TMDB ID 转成英文片名/年份。留空时使用现有备用 Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}
module.exports={getStreams:getStreams,onSettings:onSettings};

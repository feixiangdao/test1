// NOVIPNOAD binary probe A
function clean(v){return v==null?"":String(v).trim();}
function log(s){try{console.log("[NOVIPNOAD] "+s);}catch(e){}}
function diag(s){s=clean(s).replace(/\s+/g," ").slice(0,180);if(s&&DIAG.indexOf(s)<0)DIAG.push(s);}
function statusRows(){
  var a=DIAG.length?DIAG.slice(-6):["No stream returned"];
  return a.map(function(msg,i){
    var name="NOVIPNOAD · DIAG "+(i+1)+" · "+msg;
    return{name:name,title:name,url:"data:application/vnd.apple.mpegurl;base64,I0VYVE0zVQojRVhULVgtVkVSU0lPTjozCiNFWFQtWC1FTkRMSVNUCg==",quality:"Status",type:"hls",provider:"novipnoad-local",headers:{},subtitles:[]};
  });
}
function settings(){try{return typeof globalThis!=="undefined"&&globalThis.SCRAPER_SETTINGS||{};}catch(e){return {};}}
function browserUa(){var s=settings(),u=clean(s.browserUserAgent);return u||UA;}
function browserCookie(){return clean(settings().browserCookie);}
function siteHeaders(ref,json){
  var h={
    "User-Agent":browserUa(),
    "Accept":json?"application/json,text/plain,*/*":"text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language":"zh-CN,zh;q=0.9,en;q=0.7",
    "Referer":ref||SITE_CANDIDATES[0]+"/"
  };
  var ck=browserCookie();if(ck)h["Cookie"]=ck;
  return h;
}
function htmlDecode(s){return clean(s).replace(/&#0*38;|&#x0*26;/gi,"&").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&#x27;/gi,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();}
function norm(s){return htmlDecode(s).toLowerCase().replace(/[\u3010\u3011\[\]()（）《》:：·._-]+/g," ").replace(/[^0-9a-z\u00c0-\u024f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g," ").replace(/\s+/g," ").trim();}
function safeUrl(u){u=clean(u);if(!/^https?:\/\/[^\s"'<>]+$/i.test(u)||u.length>4096)return false;var m=u.match(/^https?:\/\/([^/?#]+)/i),a=m&&m[1];if(!a||a.indexOf("@")>=0||a.charAt(0)==="[")return false;var h=a.split(":")[0].toLowerCase();if(!h||h.indexOf(".")<0||/^(?:localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(h))return false;return true;}
function abs(u,base){u=htmlDecode(u).replace(/\\\//g,"/");if(u.indexOf("//")===0)u="https:"+u;if(/^https?:\/\//i.test(u))return safeUrl(u)?u:"";if(u.charAt(0)==="/"&&base){var m=base.match(/^(https?:\/\/[^/]+)/);if(m){u=m[1]+u;return safeUrl(u)?u:"";}}return"";}
function headers(ref,json){return{"User-Agent":browserUa(),"Accept":json?"application/json,text/plain,*/*":"text/html,application/xhtml+xml,*/*;q=0.8","Accept-Language":"zh-CN,zh;q=0.9,en;q=0.7","Referer":ref||SITE_CANDIDATES[0]+"/"};}
function fetchText(url,h){
  if(!safeUrl(url))return Promise.reject(new Error("invalid URL"));
  var o={method:"GET",headers:h||{}};
  try{o.skipSizeCheck=true;}catch(e){}
  if(/novipnoad\.(?:ca|uk|net)|player\.novipnoad\.net/i.test(url)){
    try{o.credentials="include";}catch(e){}
    try{o.redirect="follow";}catch(e){}
  }
  return fetch(url,o).then(function(r){
    if(!r||!r.ok)throw new Error("HTTP "+(r?r.status:"unknown"));
    return r.text();
  });
}
function fetchJson(url,h){return fetchText(url,h).then(function(t){return JSON.parse(t);});}
function tmdbMeta(id,type){
  var key=clean(settings().tmdbApiKey);if(!key){try{key=clean(globalThis.TMDB_API_KEY);}catch(e){}}if(!key)key=DEFAULT_TMDB_API_KEY;
  var kind=type==="tv"?"tv":"movie",base="https://api.themoviedb.org/3/"+kind+"/"+encodeURIComponent(String(id));
  var zh=base+"?api_key="+encodeURIComponent(key)+"&language=zh-CN";
  var en=base+"?api_key="+encodeURIComponent(key)+"&language=en-US&append_to_response=translations,alternative_titles";
  return Promise.all([fetchJson(zh,{"Accept":"application/json"}),fetchJson(en,{"Accept":"application/json"})]).then(function(a){
    var z=a[0]||{},e=a[1]||{},d=clean(e.release_date||e.first_air_date||z.release_date||z.first_air_date),aliases=[];
    function add(v){v=clean(v);if(v&&aliases.indexOf(v)<0)aliases.push(v);}
    add(z.title||z.name);
    var trs=e.translations&&e.translations.translations||[];
    trs.forEach(function(t){
      if(!t||clean(t.iso_639_1).toLowerCase()!=="zh")return;
      var data=t.data||{};add(data.title||data.name);
    });
    var alt=e.alternative_titles||{},rows=alt.titles||alt.results||[];
    rows.forEach(function(t){
      var cc=clean(t&&t.iso_3166_1).toUpperCase();
      if(cc==="CN"||cc==="HK"||cc==="TW"||cc==="SG"||cc==="MO")add(t&&t.title);
    });
    return{
      zh:clean(z.title||z.name),
      en:clean(e.title||e.name),
      original:clean(e.original_title||e.original_name||z.original_title||z.original_name),
      aliases:aliases.slice(0,10),
      year:/^\d{4}/.test(d)?d.slice(0,4):""
    };
  }).catch(function(err){diag("TMDB · "+(err&&err.message||err));log("TMDB metadata: "+(err&&err.message||err));return null;});
}
function uniq(a){var o=[],seen={};(a||[]).forEach(function(v){v=clean(v);var k=norm(v);if(v&&k&&!seen[k]){seen[k]=1;o.push(v);}});return o;}
function titleHasAny(title,terms){var n=norm(title);for(var i=0;i<terms.length;i++){var q=norm(terms[i]);if(q&&n.indexOf(q)>=0)return true;}return false;}
function parseVideoItems(html,base){var s=clean(html),out=[],re=/<(?:article|div)\b[^>]*class=["'][^"']*\bvideo-item\b[^"']*["'][^>]*>[\s\S]*?<\/(?:article|div)>/ig,m;while((m=re.exec(s))!==null&&out.length<80){var b=m[0],lm=b.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i),tm=b.match(/class=["'][^"']*\bitem-head\b[^"']*["'][\s\S]*?<h3\b[^>]*>([\s\S]*?)<\/h3>/i);if(!lm||!tm)continue;var u=abs(lm[1],base),t=htmlDecode(tm[1]);if(u&&t)out.push({url:u,title:t});}if(out.length)return out;var re2=/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,2500}?<h3\b[^>]*>([\s\S]*?)<\/h3>/ig;while((m=re2.exec(s))!==null&&out.length<80){var u2=abs(m[1],base),t2=htmlDecode(m[2]);if(u2&&t2&&!out.some(function(x){return x.url===u2;}))out.push({url:u2,title:t2});}return out;}
function cnSeasonNum(s){s=clean(s);if(/^\d+$/.test(s))return parseInt(s,10);var map={"一":1,"二":2,"两":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10};if(map[s])return map[s];if(/^十[一二三四五六七八九]$/.test(s))return 10+map[s.charAt(1)];if(/^[二三四五六七八九]十$/.test(s))return map[s.charAt(0)]*10;if(/^[二三四五六七八九]十[一二三四五六七八九]$/.test(s))return map[s.charAt(0)]*10+map[s.charAt(2)];return 0;}
function episodeInfo(title){var t=clean(title),m,sm=t.match(/第\s*([0-9一二两三四五六七八九十]{1,3})\s*季/i),seasonHint=sm?cnSeasonNum(sm[1]):1,seasonExplicit=!!sm;
  m=t.match(/[（(](\d{1,3})\s*集全[）)]|(?:全|共)\s*(\d{1,3})\s*集/i);if(m){var n=parseInt(m[1]||m[2],10),c=[];for(var k=1;k<=n&&k<=100;k++)c.push(k);return{season:seasonHint,episodes:c,explicitSeason:seasonExplicit,complete:true};}
  m=t.match(/(?:^|[^0-9])S(\d{1,2})\s*E(\d{1,3})\s*[-~—–至]\s*(?:E)?(\d{1,3})(?:[^0-9]|$)/i);if(m){var x=parseInt(m[2],10),y=parseInt(m[3],10),aa=[];for(var i=x;i<=y&&i<x+50;i++)aa.push(i);return{season:parseInt(m[1],10),episodes:aa,explicitSeason:true};}
  m=t.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i);if(m)return{season:parseInt(m[1],10),episodes:[parseInt(m[2],10)],explicitSeason:true};
  m=t.match(/(?:^|[^0-9])(\d{1,3})\s*[-~—–至]\s*(\d{1,3})(?:[^0-9]|$)/);if(m){var p=parseInt(m[1],10),q=parseInt(m[2],10),bb=[];for(var j=p;j<=q&&j<p+50;j++)bb.push(j);return{season:seasonHint,episodes:bb,explicitSeason:seasonExplicit};}
  m=t.match(/(?:^|[^0-9])(?:E|EP|第)\s*0*(\d{1,3})\s*(?:集)?(?:[^0-9]|$)/i);if(m)return{season:seasonHint,episodes:[parseInt(m[1],10)],explicitSeason:seasonExplicit};
  m=t.match(/(?:^|\s|】|\])0*(\d{1,3})(?=\s*(?:\[|〖|【|$))/);if(m)return{season:seasonHint,episodes:[parseInt(m[1],10)],explicitSeason:seasonExplicit};
  return{season:seasonHint,episodes:[],explicitSeason:seasonExplicit};}
function chooseMovie(items,terms,year){
  var cand=[],rejected=[];
  (items||[]).forEach(function(it){
    if(!/\/movie\//i.test(it.url)||!titleHasAny(it.title,terms))return;
    var ys=it.title.match(/(?:19|20)\d{2}/g)||[];
    if(year&&ys.length&&ys.indexOf(year)<0){rejected.push(it.title);return;}
    var score=0,nt=norm(it.title);
    terms.forEach(function(x){var q=norm(x);if(q&&nt.indexOf(q)>=0)score+=q.length;});
    if(year&&ys.indexOf(year)>=0)score+=1000;
    cand.push({it:it,score:score});
  });
  if(!cand.length&&rejected.length)diag("YEAR-MISS · wanted "+year+" · got "+rejected.slice(0,2).join(" | "));
  cand.sort(function(a,b){return b.score-a.score;});
  if(!cand.length)return null;
  if(cand.length>1&&cand[0].score===cand[1].score&&cand[0].it.url!==cand[1].it.url)return null;
  return cand[0].it;
}

function getStreams(id, mediaType, season, episode){return Promise.resolve([{name:"PROBE A OK",title:"PROBE A OK",url:"https://example.com/a.m3u8",quality:"Probe",type:"hls",provider:"probe-a",headers:{},subtitles:[]}]);}
module.exports={getStreams:getStreams};

// NOVIPNOAD binary probe B
function chooseTv(items,terms,season,episode){var exact=[],complete=[];(items||[]).forEach(function(it){if(!/\/(?:tv|anime|shows)\//i.test(it.url)||!titleHasAny(it.title,terms))return;var ep=episodeInfo(it.title);if(ep.explicitSeason&&ep.season!==season)return;if(season>1&&!ep.explicitSeason)return;if(ep.episodes.indexOf(episode)>=0){exact.push(it);return;}if(ep.complete&&season===1&&ep.episodes.indexOf(episode)>=0)complete.push(it);});var a=exact.length?exact:complete;if(a.length!==1)return null;return a[0];}
function wpSearch(base,query){
  var u=base+"/wp-json/wp/v2/posts?search="+encodeURIComponent(query)+"&per_page=20";
  return fetchText(u,siteHeaders(base+"/",true)).then(function(t){
    var rows;
    try{rows=JSON.parse(t);}catch(e){throw new Error("invalid JSON");}
    if(!Array.isArray(rows))throw new Error("invalid JSON shape");
    var out=[];
    rows.forEach(function(x){
      if(!x)return;
      var link=abs(x.link||"",base),title=htmlDecode(x.title&&x.title.rendered||"");
      var content=x.content&&x.content.rendered||"";
      if(link&&title)out.push({url:link,title:title,content:content,postId:x.id||0});
    });
    diag("WPSEARCH · "+query+" · "+out.length+" results");
    return out;
  });
}
function htmlSearch(base,query){
  var u=base+"/?s="+encodeURIComponent(query);
  return fetchText(u,siteHeaders(base+"/",false)).then(function(html){
    if(/Just a moment|challenge-platform|Access denied/i.test(html))throw new Error("challenge");
    var items=parseVideoItems(html,base);
    diag("HTMLSEARCH · "+base+" · "+query+" · "+items.length+" results");
    return items;
  });
}
function searchOne(base,query){
  return wpSearch(base,query).catch(function(e){
    diag("WPERR · "+query+" · "+(e&&e.message||e));
    throw e;
  });
}
function discoverDetail(meta,type,season,episode){
  if(!meta)return Promise.resolve(null);
  var terms=uniq([meta.zh,meta.en,meta.original].concat(meta.aliases||[]));
  if(!terms.length)return Promise.resolve(null);
  diag("TERMS · "+terms.slice(0,6).join(" | "));
  var bases=SITE_CANDIDATES.slice(),bi=0;
  function tryBase(){
    if(bi>=bases.length)return Promise.resolve(null);
    var base=bases[bi++],qi=0,all=[];
    function nextQ(){
      if(qi>=terms.length){
        var picked=type==="tv"?chooseTv(all,terms,season,episode):chooseMovie(all,terms,meta.year);
        if(picked){picked.base=base;return Promise.resolve(picked);}
        diag("BASEMISS · "+base+" · parsed "+all.length+" unique items");
        return tryBase();
      }
      var q=terms[qi++];
      return searchOne(base,q).then(function(items){
        items.forEach(function(it){if(!all.some(function(x){return x.url===it.url;}))all.push(it);});
        return nextQ();
      }).catch(function(e){
        diag("SEARCHERR · "+q+" · "+(e&&e.message||e));
        log(base+" search "+q+": "+(e&&e.message||e));
        return Promise.reject(e);
      });
    }
    return nextQ();
  }
  return tryBase();
}
function parsePlayInfo(html){var m=clean(html).match(/<script[^>]*>\s*window\.playInfo\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);if(!m)m=clean(html).match(/window\.playInfo\s*=\s*(\{[^;]+\})\s*;/i);if(!m)return null;try{return JSON.parse(m[1]);}catch(e){try{var vid=(m[1].match(/["']?vid["']?\s*:\s*["']([^"']*)["']/i)||[])[1]||"",pkey=(m[1].match(/["']?pkey["']?\s*:\s*["']([^"']*)["']/i)||[])[1]||"";return{vid:htmlDecode(vid),pkey:htmlDecode(pkey)};}catch(e2){return null;}}}
function parseEpisodeButtons(html){var out=[],re=/<[^>]+class=["'][^"']*\bmultilink-btn\b[^"']*["'][^>]*data-vid=["']([^"']+)["'][^>]*>([\s\S]*?)<\//ig,m;while((m=re.exec(clean(html)))!==null&&out.length<100){var v=clean(m[1]),label=htmlDecode(m[2]);if(v)out.push({vid:v,label:label});}return out;}
function buttonEpisode(label){var m=clean(label).match(/(?:S(\d{1,2})\s*)?(?:E|EP)?\s*0*(\d{1,3})/i);return m?{season:m[1]?parseInt(m[1],10):1,episode:parseInt(m[2],10)}:null;}
function selectVids(html,playInfo,type,season,episode,pageTitle){var pkey=clean(playInfo&&playInfo.pkey),vid=clean(playInfo&&playInfo.vid);if(!pkey)return[];if(vid){if(type==="tv"){var ei=episodeInfo(pageTitle);if(ei.explicitSeason&&ei.season!==season)return[];if(ei.episodes.length&&ei.episodes.indexOf(episode)<0)return[];if(season>1&&!ei.explicitSeason)return[];}return[{vid:vid,pkey:pkey,label:type==="tv"?("E"+episode):"Main"}];}var btn=parseEpisodeButtons(html);if(type==="movie")return btn.map(function(b,i){return{vid:b.vid,pkey:pkey,label:b.label||("Line "+(i+1))};});var match=[];btn.forEach(function(b){var e=buttonEpisode(b.label);if(e&&e.episode===episode&&(season===1||e.season===season))match.push({vid:b.vid,pkey:pkey,label:b.label||("E"+episode)});});if(match.length===1)return match;if(!match.length&&season===1&&episode>=1&&episode<=btn.length){var b=btn[episode-1];return[{vid:b.vid,pkey:pkey,label:b.label||("E"+episode)}];}return[];}
function parseVKeyText(s){s=clean(s);var m=s.match(/sessionStorage\.setItem\(\s*(["'])vkey\1\s*,\s*(["'])(\{[\s\S]*?\})\2\s*\)/i);if(m){try{return JSON.parse(m[3]);}catch(e){}}m=s.match(/\{\s*ckey\s*:\s*["'](\w+)["']\s*,\s*ref\s*:\s*["'](.*?)["']\s*,\s*ip\s*:\s*["'](.*?)["']\s*,\s*time\s*:\s*["'](\d+)["']\s*\}/i);return m?{ckey:m[1],ref:m[2],ip:m[3],time:m[4]}:null;}
function parseVKeyByEval(js){
  var generated="",captured="";
  try{
    var NativeFunction=Function;
    var nothing=function(){return undefined;};
    var ss={
      setItem:function(k,v){if(String(k)==="vkey")captured=String(v);},
      getItem:function(){return null;},
      removeItem:nothing
    };
    var ctx={
      direction:"ltr",fillStyle:"",filter:"",font:"",fontKerning:"",fontStretch:"",
      fontVariantCaps:"normal",globalAlpha:1,globalCompositeOperation:"",
      imageSmoothingEnabled:true,imageSmoothingQuality:"low",letterSpacing:"0px",
      lineCap:"butt",lineDashOffset:0,lineJoin:"miter",lineWidth:1,miterLimit:10,
      shadowBlur:0,shadowColor:"rgba(0, 0, 0, 0)",shadowOffsetX:0,shadowOffsetY:0,
      strokeStyle:"#000000",textAlign:"start",textBaseline:"alphabetic",
      textRendering:"auto",wordSpacing:"0px"
    };
    ["arc","arcTo","beginPath","bezierCurveTo","clearRect","clip","closePath",
     "createConicGradient","createImageData","createLinearGradient","createPattern",
     "createRadialGradient","drawFocusIfNeeded","drawImage","ellipse","fill","fillRect",
     "fillText","getContextAttributes","getImageData","getLineDash","getTransform",
     "isContextLost","isPointInPath","isPointInStroke","lineTo","measureText","moveTo",
     "putImageData","quadraticCurveTo","rect","reset","resetTransform","restore","rotate",
     "roundRect","save","scale","setLineDash","setTransform","stroke","strokeRect",
     "strokeText","transform","translate"].forEach(function(k){ctx[k]=nothing;});
    var canvas={
      height:1,width:1,style:{},
      captureStream:function(){return{};},
      getContext:function(){return ctx;},
      toBlob:function(){return{};},
      toDataURL:function(){return{};},
      transferControlToOffscreen:function(){return{};},
      setAttribute:nothing,appendChild:nothing
    };
    var doc={
      head:{appendChild:nothing,removeChild:nothing},
      body:{appendChild:nothing,removeChild:nothing},
      documentElement:{},
      visibilityState:"visible",
      referrer:SITE_CANDIDATES[0]+"/",
      cookie:"",
      createElement:function(t){return String(t).toLowerCase()==="canvas"?canvas:{style:{},setAttribute:nothing,appendChild:nothing};},
      querySelector:function(){return null;},
      querySelectorAll:function(){return[];},
      getElementById:function(){return null;}
    };
    var nav={
      appCodeName:"Mozilla",appName:"Netscape",
      appVersion:"5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      userAgent:browserUa(),platform:"Win32",product:"Gecko",productSub:"20030107",
      vendor:"Google Inc.",vendorSub:"",language:"zh-CN",languages:["zh-CN","zh","en"]
    };
    var perf={timeOrigin:Date.now(),clearMarks:nothing,clearMeasures:nothing,mark:nothing,measure:nothing,now:function(){return Date.now()-this.timeOrigin;}};
    var loc={href:PLAYER+"/v1/",origin:PLAYER,protocol:"https:",host:"player.novipnoad.net",hostname:"player.novipnoad.net",pathname:"/v1/"};
    var scr={width:1080,height:2400,availWidth:1080,availHeight:2400,colorDepth:24,pixelDepth:24};
    var evalHook=function(code){generated=String(code||"");return undefined;};
    var FunctionHook=function(){
      var args=[].slice.call(arguments),code=args.length?String(args[args.length-1]||""):"";
      return function(){generated=code;return undefined;};
    };
    var win={
      sessionStorage:ss,navigator:nav,location:loc,document:doc,screen:scr,performance:perf,
      innerWidth:1080,innerHeight:2200,devicePixelRatio:1,
      eval:evalHook,Function:FunctionHook,requestAnimationFrame:nothing
    };
    win.window=win;win.self=win;win.top=win;win.parent=win;
    var safeFetch=function(){throw new Error("network disabled");};
    var safeTimer=function(fn){if(typeof fn==="function")fn();return 1;};
    var fn=NativeFunction(
      "window","self","sessionStorage","navigator","document","location","screen","performance",
      "eval","Function","requestAnimationFrame","fetch","XMLHttpRequest","setTimeout","clearTimeout",
      '"use strict";\n'+js+'\n;if(typeof __==="function"){__();}\n;return true;'
    );
    fn(win,win,ss,nav,doc,loc,scr,perf,evalHook,FunctionHook,nothing,safeFetch,
      function(){throw new Error("XHR disabled");},safeTimer,nothing);
    if(captured){
      try{return JSON.parse(captured);}catch(e){var direct=parseVKeyText(captured);if(direct)return direct;}
    }
    if(generated){
      diag("VKEY-GENERATED · "+generated.length+" chars");
      var vk=parseVKeyText(generated);
      if(vk)return vk;
      try{
        var run=NativeFunction("window","sessionStorage",generated);
        run(win,ss);
        if(captured){
          try{return JSON.parse(captured);}catch(e2){return parseVKeyText(captured);}
        }
      }catch(e3){diag("VKEY-GENEXEC · "+(e3&&e3.message||e3));}
    }
    return null;
  }catch(e){
    diag("VKEY-EVAL · "+(e&&e.message||e));
    return null;
  }
}
function extractIntegrityScripts(html){
  var out=[],re=/<script\b[^>]*>([\s\S]*?)<\/script>/ig,m;
  while((m=re.exec(clean(html)))!==null&&out.length<40){
    var js=clean(m[1]);
    if(!js)continue;
    if(/vkey|sessionStorage|完整性|device|ckey|JSON\.stringify/i.test(js))out.push(js);
  }
  return out;
}
function parseVKeyFromHtml(html){
  var scripts=extractIntegrityScripts(html);
  diag("VKEY-SCRIPTS · "+scripts.length);
  for(var i=0;i<scripts.length;i++){
    var js=scripts[i],vk=parseVKeyByEval(js)||parseVKeyObfuscated(js);
    if(vk&&vk.ckey&&vk.time){
      diag("VKEY-SCRIPT · hit "+(i+1));
      return vk;
    }
  }
  return null;
}
function parseVKeyObfuscated(js){var direct=parseVKeyText(js);if(direct)return direct;var m2=js.match(/var\s+[A-Za-z_$][\w$]*=\[(\[[0-9,\[\]]+\])\];/),m1=js.match(/var\s+[A-Za-z_$][\w$]*=\s*\[([\d,]+)\];/);if(m2&&m1){try{var arr=JSON.parse("["+m2[1].replace(/,$/,"")+"]"),keys=m1[1].split(",").map(Number),str="";if(arr.length===keys.length){arr.forEach(function(a,i){a.forEach(function(v){str+=String.fromCharCode(v^keys[i]);});});direct=parseVKeyText(str);if(direct)return direct;}}catch(e){}}if(m1){var nums=m1[1].split(",").map(Number),ab=js.match(/var\s+[A-Za-z_$][\w$]*=(\d+),*[A-Za-z_$][\w$]*=(\d+);var\s+[A-Za-z_$][\w$]*='';/);if(ab){var x=parseInt(ab[1],10),d=parseInt(ab[2],10),s1=nums.map(function(v){return String.fromCharCode((v-d)^x);}).join("");direct=parseVKeyText(s1);if(direct)return direct;}var aa=js.match(/var\s+[A-Za-z_$][\w$]*=(\d+);var\s+[A-Za-z_$][\w$]*='';/);if(aa){var k=parseInt(aa[1],10),s2=nums.map(function(v){return String.fromCharCode(v^k);}).join("");direct=parseVKeyText(s2);if(direct)return direct;}}var chunks=[],cr=/[A-Za-z_$][\w$]*\+='([A-Za-z0-9+/=]+)'\+[A-Za-z_$][\w$]*;/g,cm;while((cm=cr.exec(js))!==null)chunks.push(cm[1]);if(chunks.length){try{var raw=atob(chunks.join("")),vals=raw.split(",").map(Number),vr=/var\s+([A-Za-z_$][\w$]*)=([0-9()+\-*/%<>&|^!~]+);/g,vm,args={};while((vm=vr.exec(js))!==null){var ex=vm[2];if(!/^[0-9()+\-*/%<>&|^!~]+$/.test(ex))continue;try{args[vm[1]]=Number(Function('"use strict";return ('+ex+');')());}catch(e){}}var de=js.match(/var\s+[A-Za-z_$][\w$]*=\([A-Za-z_$][\w$]*-([A-Za-z_$][\w$]*)\)\^([A-Za-z_$][\w$]*)\^\(\([A-Za-z_$][\w$]*\*([A-Za-z_$][\w$]*)\)%256\);/);if(de&&args[de[1]]!=null&&args[de[2]]!=null&&args[de[3]]!=null){var a0=args[de[1]],a1=args[de[2]],a2=args[de[3]],s3=vals.map(function(v,i){return String.fromCharCode((v-a0)^a1^((i*a2)%256));}).join("");direct=parseVKeyText(s3);if(direct)return direct;}}catch(e){}}return null;}
function b64bytes(s){var b=atob(clean(s)),a=[];for(var i=0;i<b.length;i++)a.push(b.charCodeAt(i)&255);return a;}
function rc4(key,data){var S=[],j=0,i;for(i=0;i<256;i++)S[i]=i;for(i=0;i<256;i++){j=(j+S[i]+key.charCodeAt(i%key.length))&255;var t=S[i];S[i]=S[j];S[j]=t;}var out=[],x=0,y=0;for(i=0;i<data.length;i++){x=(x+1)&255;y=(y+S[x])&255;var z=S[x];S[x]=S[y];S[y]=z;out.push(data[i]^S[(S[x]+S[y])&255]);}return out;}
function bytesToLatin1(a){var s="";for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return s;}
function encParam(v){
  v=clean(v);
  try{return encodeURIComponent(decodeURIComponent(v));}
  catch(e){return encodeURIComponent(v);}
}
function queryUrl(base,obj){var q=[],sep=base.indexOf("?")>=0?"&":"?";Object.keys(obj).forEach(function(k){q.push(encodeURIComponent(k)+"="+encParam(obj[k]));});return base+sep+q.join("&");}
function resolveVid(v,pkey,detailUrl,siteBase){var p1=PLAYER+"/v1/?url="+encParam(v)+"&pkey="+encParam(pkey)+"&ref="+encParam(detailUrl);return fetchText(p1,headers(detailUrl,false)).then(function(h1){var dm=h1.match(/params\[['"]device['"]\]\s*=\s*['"](\w+)['"]/i);if(!dm)throw new Error("PLAYER1 device not found");var marker="/*-- 浏览器完整性检查 --*/",part=h1.indexOf(marker)>=0?h1.slice(h1.indexOf(marker)+marker.length):"";if(part)part=part.split("</script>")[0].replace(/^\s*<script[^>]*>/i,"");var vk=parseVKeyFromHtml(h1)||(part?(parseVKeyByEval(part)||parseVKeyObfuscated(part)):null)||parseVKeyObfuscated(h1);if(!vk||!vk.ckey||!vk.time)throw new Error("PLAYER1 vkey decode failed");var p2=PLAYER+"/v1/player.php?id="+encodeURIComponent(v)+"&device="+encodeURIComponent(dm[1]);return fetchText(p2,headers(p1,false)).then(function(h2){var jm=h2.match(/const\s+jsapi\s*=\s*['"](.*?)['"]\s*;/i);if(!jm)throw new Error("PLAYER2 jsapi not found");var ju=queryUrl(jm[1],{ckey:String(vk.ckey).toUpperCase(),ref:vk.ref||"",ip:vk.ip||"",time:vk.time||""});return fetchText(ju,headers(PLAYER+"/",false)).then(function(js){var em=js.match(/var\s+videoUrl\s*=\s*JSON\.decrypt\(\s*['"](.*?)['"]\s*\)\s*;/i);if(!em)throw new Error("PLAYER3 encrypted videoUrl not found");var dec=bytesToLatin1(rc4(FALLBACK_RC4_KEY,b64bytes(em[1]))),obj=JSON.parse(dec);return obj&&Array.isArray(obj.quality)?obj.quality:[];});});});}
function streamType(u,t){var s=clean(t).toLowerCase(),p=clean(u).split(/[?#]/)[0].toLowerCase();if(s.indexOf("m3u8")>=0||/\.m3u8$/.test(p))return"hls";if(s.indexOf("mp4")>=0||/\.mp4$/.test(p))return"mp4";if(s.indexOf("mpd")>=0||/\.mpd$/.test(p))return"dash";return"";}
function qualityName(q){var n=clean(q&&q.name);if(n)return n;var u=clean(q&&q.url),m=u.match(/(?:^|[^0-9])(2160|1440|1080|720|480|360)p?(?:[^0-9]|$)/i);return m?m[1]+"p":"Auto";}

function getStreams(id, mediaType, season, episode){return Promise.resolve([{name:"PROBE B OK",title:"PROBE B OK",url:"https://example.com/b.m3u8",quality:"Probe",type:"hls",provider:"probe-b",headers:{},subtitles:[]}]);}
module.exports={getStreams:getStreams};

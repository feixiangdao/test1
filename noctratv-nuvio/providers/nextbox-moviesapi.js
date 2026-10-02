// NoctraTV · Nextbox · MoviesAPI — direct HLS resolver.
// Current chain: moviesapi.club page -> iframe -> P.A.C.K.E.R. -> HLS.

var BASE="https://moviesapi.club";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim()}
function absUrl(u,base){
  u=clean(u);if(!u)return"";
  if(/^https?:\/\//i.test(u))return u;
  if(/^\/\//.test(u))return"https:"+u;
  try{return new URL(u,base).href}catch(_){}
  var m=String(base||"").match(/^(https?:\/\/[^/]+)/i);
  if(m&&u.charAt(0)==="/")return m[1]+u;
  return"";
}
function decodeJs(raw){
  return String(raw||"")
    .replace(/\\u([0-9a-fA-F]{4})/g,function(_,h){return String.fromCharCode(parseInt(h,16))})
    .replace(/\\x([0-9a-fA-F]{2})/g,function(_,h){return String.fromCharCode(parseInt(h,16))})
    .replace(/\\n/g,"\n").replace(/\\r/g,"\r").replace(/\\t/g,"\t")
    .replace(/\\b/g,"\b").replace(/\\f/g,"\f")
    .replace(/\\([\\'"])/g,"$1");
}
function parseQuoted(s,pos){
  while(pos<s.length&&/\s/.test(s.charAt(pos)))pos++;
  var q=s.charAt(pos);if(q!=="'"&&q!=='"')return null;
  var raw="",i=pos+1,esc=false,ch;
  for(;i<s.length;i++){
    ch=s.charAt(i);
    if(esc){raw+="\\"+ch;esc=false;continue}
    if(ch==="\\"){esc=true;continue}
    if(ch===q)return{value:decodeJs(raw),end:i+1};
    raw+=ch;
  }
  return null;
}
function nextNumber(s,pos){
  while(pos<s.length&&!/[0-9]/.test(s.charAt(pos)))pos++;
  var m=s.slice(pos).match(/^(\d+)/);
  return m?{value:parseInt(m[1],10),end:pos+m[1].length}:null;
}
function baseWord(n,radix){
  var chars="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if(radix<=36)return n.toString(radix);
  if(n<radix)return chars.charAt(n);
  return baseWord(Math.floor(n/radix),radix)+chars.charAt(n%radix);
}
function unpackPacker(script){
  script=String(script||"");
  var marker=script.indexOf("}(");
  if(marker<0)return"";
  var p=parseQuoted(script,marker+2);if(!p)return"";
  var a=nextNumber(script,p.end);if(!a)return"";
  var c=nextNumber(script,a.end);if(!c)return"";
  var qi=c.end;
  while(qi<script.length&&script.charAt(qi)!=="'"&&script.charAt(qi)!=='"')qi++;
  var k=parseQuoted(script,qi);if(!k)return"";
  var words=k.value.split("|"),out=p.value,i,key,val;
  for(i=c.value-1;i>=0;i--){
    val=words[i]||"";if(!val)continue;
    key=baseWord(i,a.value);
    out=out.replace(new RegExp("\\b"+key+"\\b","g"),val);
  }
  return out;
}
function iframeFrom(html,pageUrl){
  var m=String(html||"").match(/<iframe[^>]+(?:src|data-src)\s*=\s*["']([^"']+)["']/i);
  return m?absUrl(m[1],pageUrl):"";
}
function mediaFrom(script){
  var s=String(script||""),m;
  m=s.match(/sources\s*:\s*\[\s*\{[^}]*?file\s*:\s*["']([^"']+)["']/i);
  if(!m)m=s.match(/["']sources["']\s*:\s*\[\s*\{[^}]*?["']file["']\s*:\s*["']([^"']+)["']/i);
  if(!m)m=s.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  return m?clean(m[1]).replace(/\\\//g,"/"):"";
}
function maxQuality(body){
  var max=0,m,re=/RESOLUTION=\d+x(\d+)/gi,s=String(body||"");
  while((m=re.exec(s))!==null)max=Math.max(max,parseInt(m[1],10)||0);
  return max?max+"p":"Auto";
}
function fetchText(url,referer){
  return fetch(url,{headers:{"User-Agent":UA,"Referer":referer||BASE+"/","Accept":"text/html,application/xhtml+xml,*/*"}})
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.text()});
}
function verify(url,referer){
  return fetch(url,{headers:{"User-Agent":UA,"Referer":referer,"Accept":"application/vnd.apple.mpegurl, application/x-mpegURL, */*"}})
    .then(function(r){if(!r.ok)throw new Error("HLS HTTP "+r.status);return r.text()})
    .then(function(b){if(String(b).indexOf("#EXTM3U")!==0)throw new Error("not HLS");return maxQuality(b)});
}
function pageUrl(tmdbId,mediaType,season,episode){
  return mediaType==="tv"
    ?BASE+"/tv/"+encodeURIComponent(String(tmdbId))+"-"+encodeURIComponent(String(season||1))+"-"+encodeURIComponent(String(episode||1))
    :BASE+"/movie/"+encodeURIComponent(String(tmdbId));
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var page=pageUrl(tmdbId,mediaType,season,episode),iframe="";
  return fetchText(page,BASE+"/").then(function(html){
    iframe=iframeFrom(html,page);
    if(!iframe)throw new Error("iframe missing");
    return fetchText(iframe,page);
  }).then(function(html){
    var idx=html.indexOf("eval(function(p,a,c,k,e,d)");
    var unpacked=idx>=0?unpackPacker(html.slice(idx)):html;
    var media=mediaFrom(unpacked||html);
    if(!media)throw new Error("m3u8 missing after unpack");
    return verify(media,iframe).then(function(q){return{url:media,quality:q}});
  }).then(function(v){
    var name="NoctraTV · Nextbox · MoviesAPI · "+v.quality;
    console.log("[NoctraTV/Nextbox/MoviesAPI] "+mediaType+" "+tmdbId+" verified=1");
    return[{name:name,title:name,url:v.url,quality:v.quality,type:"hls",
      provider:"noctra-nextbox-moviesapi",
      headers:{"User-Agent":UA,"Referer":iframe},subtitles:[]}];
  }).catch(function(e){
    console.error("[NoctraTV/Nextbox/MoviesAPI] "+(e&&e.message?e.message:e));
    return[];
  });
}

module.exports={getStreams:getStreams,pageUrl:pageUrl,unpackPacker:unpackPacker,iframeFrom:iframeFrom,mediaFrom:mediaFrom};

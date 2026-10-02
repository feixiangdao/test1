// NoctraTV · CineSrc — direct HLS generator for the current CineSrc chain.
// Mapped from noctratv.com's "CineSrc" source.
// Does not open the embed/player page. It deterministically builds the current
// CineSrc master HLS and verifies #EXTM3U before returning it to Nuvio.

var V_PARAM="_v=34403446";
var N_D="4860ac8bfddb";
var A_D="224eff10e662e9635c9f671cf46351dcd69af42b1edd56f5e5fa21751f44b9c8";
var LS=[17,91,203,44,8,177,62,239,119,3,154,81,28,210,101,7];
var WA="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var CDN="https://glendale-plumbing.com";
var REFERER="https://cinesrc.st/";
var ORIGIN="https://cinesrc.st";
var UA="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143 Mobile Safari/537.36";

function u32(x){return x>>>0}
function imul(a,b){return Math.imul(a,b)>>>0}
function ab(e){
  var t=u32(e);
  t=u32(t^(t>>>16));
  t=imul(t,2146121005);
  t=u32(t^(t>>>15));
  t=imul(t,2221713035);
  return u32(t^(t>>>16));
}
function asciiBytes(s){
  var out=new Uint8Array(String(s).length),i;
  for(i=0;i<out.length;i++)out[i]=String(s).charCodeAt(i)&255;
  return out;
}
function sD(e){
  var t=asciiBytes(A_D);
  var r=Math.min(Math.max(e+17,32),128);
  var n=new Array(r),a=2166136261>>>0,s;
  for(s=0;s<r;s++){
    a=u32(a^(t[s%t.length]&255));
    a=ab(u32(a+LS[s%LS.length]+imul(2654435761,s)));
    n[s]=a&255;
  }
  return n;
}
function iD(e){
  var out="",r=0,n,a,s;
  while(r<e.length){
    n=e[r];
    a=r+1<e.length?e[r+1]:null;
    s=r+2<e.length?e[r+2]:null;
    out+=WA.charAt(n>>>2);
    out+=WA.charAt(((n&3)<<4)|((a==null?0:a)>>>4));
    if(a==null)break;
    out+=WA.charAt(((a&15)<<2)|((s==null?0:s)>>>6));
    if(s==null)break;
    out+=WA.charAt(s&63);
    r+=3;
  }
  return out;
}
function generateDirectHlsUrl(tmdbId,mediaType,season,episode){
  var isTv=mediaType==="tv";
  var ss=isTv?Number(season||1):0;
  var ee=isTv?Number(episode||1):0;
  var str=N_D+":"+(isTv?"s":"m")+":"+String(tmdbId)+":"+ss+":"+ee;
  var a=asciiBytes(str),sd=sD(a.length),buf=new Array(a.length+2),l;
  buf[0]=a.length&255;
  buf[1]=(a.length>>>8)&255;
  var o=u32((2654435769>>>0)^a.length);
  for(l=0;l<a.length;l++){
    o=ab(u32(o+sd[l%sd.length]+LS[l%LS.length]+l));
    buf[l+2]=((a[l]^(o&255))^sd[(7*l+3)%sd.length])&255;
  }
  return CDN+"/c/v1/"+iD(buf)+"/master.m3u8?"+V_PARAM;
}
function headers(){
  return{
    "User-Agent":UA,
    "Referer":REFERER,
    "Origin":ORIGIN,
    "Accept":"application/vnd.apple.mpegurl, application/x-mpegURL, */*"
  };
}
function maxQuality(body){
  var max=0,m,re=/RESOLUTION=\d+x(\d+)/gi,s=String(body||"");
  while((m=re.exec(s))!==null)max=Math.max(max,parseInt(m[1],10)||0);
  if(max>=2160)return"4K";
  if(max>=1440)return"1440p";
  if(max>=1080)return"1080p";
  if(max>=720)return"720p";
  if(max>=480)return"480p";
  return max?max+"p":"Auto";
}
function verify(url){
  return fetch(url,{headers:headers()}).then(function(r){
    if(!r.ok)throw new Error("HLS HTTP "+r.status);
    return r.text();
  }).then(function(body){
    if(String(body).indexOf("#EXTM3U")!==0)throw new Error("not HLS");
    return{url:url,quality:maxQuality(body)};
  });
}
function getStreams(tmdbId,mediaType,season,episode){
  if(!tmdbId||(mediaType!=="movie"&&mediaType!=="tv"))return Promise.resolve([]);
  if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
  var u=generateDirectHlsUrl(tmdbId,mediaType,season,episode);
  return verify(u).then(function(v){
    var q=v.quality==="Auto"?"1080p":v.quality;
    var name="NoctraTV · CineSrc · "+q;
    console.log("[NoctraTV/CineSrc] "+mediaType+" "+tmdbId+" verified=1");
    return[{
      name:name,title:name,url:v.url,quality:q,type:"hls",
      provider:"noctra-cinesrc",headers:headers(),subtitles:[]
    }];
  }).catch(function(e){
    console.error("[NoctraTV/CineSrc] "+(e&&e.message?e.message:e));
    return[];
  });
}

module.exports={
  getStreams:getStreams,
  generateDirectHlsUrl:generateDirectHlsUrl,
  maxQuality:maxQuality
};

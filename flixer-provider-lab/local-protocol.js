/* Flixer Local request/signature adapter; standalone JavaScript, no Node or proxy. */
(function (root) {
"use strict";
var API="https://plsdontscrapemelove.flixer.su";
var SITE="https://flixer.su";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function bytesASCII(s){var a=[];s=String(s);for(var i=0;i<s.length;i++){a.push(s.charCodeAt(i)&255)}return a;}
function rotr(x,n){return(x>>>n)|(x<<(32-n));}
function sha256(input){
 var len=input.length,total=((len+9+63)>>6)<<6,data=new Uint8Array(total),i;
 for(i=0;i<len;i++)data[i]=input[i];
 data[len]=128;
 var bits=len*8,hi=Math.floor(bits/4294967296),lo=bits>>>0;
 for(i=0;i<4;i++){data[total-8+i]=(hi>>>((3-i)*8))&255;data[total-4+i]=(lo>>>((3-i)*8))&255;}
 var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 for(var o=0;o<total;o+=64){
  var w=new Uint32Array(64);
  for(i=0;i<16;i++)w[i]=((data[o+i*4]<<24)|(data[o+i*4+1]<<16)|(data[o+i*4+2]<<8)|data[o+i*4+3])>>>0;
  for(i=16;i<64;i++){
   var q=w[i-15],z=w[i-2];
   w[i]=(w[i-16]+(rotr(q,7)^rotr(q,18)^(q>>>3))+w[i-7]+(rotr(z,17)^rotr(z,19)^(z>>>10)))>>>0;
  }
  var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
  for(i=0;i<64;i++){
   var t1=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;
   var t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
   h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
  H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
 }
 var out=[];for(i=0;i<8;i++){for(var j=3;j>=0;j--)out.push((H[i]>>>(j*8))&255)}return out;
}
function base64(bytes){
 var abc="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",s="";
 for(var i=0;i<bytes.length;i+=3){
  var a=bytes[i],b=i+1<bytes.length?bytes[i+1]:0,c=i+2<bytes.length?bytes[i+2]:0;
  var n=(a<<16)|(b<<8)|c;
  s+=abc[(n>>>18)&63]+abc[(n>>>12)&63]+(i+1<bytes.length?abc[(n>>>6)&63]:"=")+(i+2<bytes.length?abc[n&63]:"=");
 }return s;
}
function hmac(key,msg){
 var k=bytesASCII(key),i;
 if(k.length>64)k=sha256(k);
 var ipad=[],opad=[];
 for(i=0;i<64;i++){var b=k[i]||0;ipad.push(b^54);opad.push(b^92);}
 return base64(sha256(opad.concat(sha256(ipad.concat(bytesASCII(msg))))));
}
function nonce(){
 var b=new Uint8Array(16);
 if(root.crypto&&typeof root.crypto.getRandomValues==="function")root.crypto.getRandomValues(b);
 else for(var i=0;i<b.length;i++)b[i]=Math.floor(Math.random()*256);
 return base64(b).replace(/[\/+=]/g,"").slice(0,22);
}
function fingerprint(){
 var canvasPrefix="iVBORw0KGgoAAAANSUhEUgAAASwA";
 var s="1365x900:24:"+UA.slice(0,50)+":Win32:en-US:"+new Date().getTimezoneOffset()+":"+canvasPrefix;
 var h=0;for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;
 return Math.abs(h).toString(36);
}
function apiPath(tmdbId,mediaType,season,episode){
 var id=String(tmdbId);
 if(!/^\d{1,10}$/.test(id))return "";
 if(mediaType==="movie")return"/api/tmdb/movie/"+id+"/images";
 if(mediaType!=="tv")return"";
 var s=String(season),e=String(episode);
 if(!/^\d{1,3}$/.test(s)||!/^\d{1,3}$/.test(e)||Number(s)>99||Number(e)<1)return"";
 return"/api/tmdb/tv/"+id+"/season/"+Number(s)+"/episode/"+Number(e)+"/images";
}
function syncTime(){
 var start=Date.now();
 return fetch(API+"/api/time?t="+start,{headers:{"Accept":"application/json","Referer":SITE+"/","User-Agent":UA}})
 .then(function(r){if(!r.ok)throw Error("Time HTTP "+r.status);return r.json()})
 .then(function(o){
  var end=Date.now(),t=Number(o&&o.timestamp);
  return isFinite(t)&&t>1000000000?(t*1000+(end-start)/2-end):0;
 }).catch(function(){return 0});
}
function fetchCipher(key,path,server,offset){
 var timestamp=Math.floor((Date.now()+offset)/1000),n=nonce();
 var msg=key+":"+timestamp+":"+n+":"+path;
 var headers={"X-Api-Key":key,"X-Request-Timestamp":String(timestamp),"X-Request-Nonce":n,
 "X-Request-Signature":hmac(key,msg),"X-Client-Fingerprint":fingerprint(),
 "X-Fingerprint-Lite":"b4f8a1fc72e905d63e","Accept":"text/plain","Referer":SITE+"/","User-Agent":UA};
 if(server){headers["X-Only-Sources"]="1";headers["X-Server"]=server;}
 return fetch(API+path,{headers:headers}).then(function(r){
   if(!r.ok)throw Error("API HTTP "+r.status);
   return r.text();
 });
}
function extract(data,server){
 var a=data&&data.sources;
 if(a&&a.sources)a=a.sources;
 if(!Array.isArray(a))a=[a||{}];
 var streams=[];
 for(var i=0;i<a.length;i++){
   var x=a[i],url=typeof x==="string"?x:x&&(x.url||x.file||x.stream);
   if(typeof url!=="string"||!/^https:\/\//i.test(url))continue;
   var type=/\.mp4(?:[?#]|$)/i.test(url)?"mp4":/\.mpd(?:[?#]|$)/i.test(url)?"dash":"hls";
   streams.push({name:"Flixer Local · "+server,title:"Flixer · "+server+" · Auto",url:url,
     quality:"Auto",type:type,provider:"flixer-local-alpha",headers:{"Referer":SITE+"/","Origin":SITE,"User-Agent":UA}});
 }
 return streams;
}
function getStreams(tmdbId,mediaType,season,episode){
 var p=apiPath(tmdbId,mediaType,season,episode);
 if(!p)return Promise.resolve([]);
 return Promise.resolve().then(function(){
  if(typeof get_img_key!=="function"||typeof process_img_data!=="function")throw Error("Decoder unavailable");
  return get_img_key();
 }).then(function(key){
  if(typeof key!=="string"||key.length!==64)throw Error("Invalid decoder key");
  return syncTime().then(function(offset){
    return fetchCipher(key,p,"",offset).catch(function(){return""}).then(function(){
      return fetchCipher(key,p,"alpha",offset);
    });
  }).then(function(cipher){
    return Promise.resolve(process_img_data(cipher,key)).then(function(plaintext){
      return extract(JSON.parse(plaintext),"Alpha");
    });
  });
 }).catch(function(e){console.log("[Flixer Local] "+String(e).slice(0,120));return[]});
}
function onSettings(){return[{type:"header",label:"Flixer Local"},{type:"info",label:"Pure local Alpha HLS decoder. No Vercel or remote resolver. Quality is determined by HLS master playlist."}]}
if(typeof module!=="undefined"&&module.exports)module.exports={getStreams:getStreams,onSettings:onSettings};
root.__flixerLocalProtocolTest={hmac:hmac,apiPath:apiPath,extract:extract};
})(typeof globalThis!=="undefined"?globalThis:this);

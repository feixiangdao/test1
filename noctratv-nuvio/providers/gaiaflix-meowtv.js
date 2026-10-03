// NoctraTV · Gaiaflix · MeowTV — Nuvio local scraper
// Current MeowTV v4 flow: ALTCHA challenge -> single-use UA-bound ticket -> encrypted stream -> dec-meowtv.
// Uses current upstream server IDs instead of stale UI aliases. No iframe fallback.

var ROOT="https://api.meowtv.ru";
var API_BASE=ROOT+"/streams";
var CHALLENGE_URL=ROOT+"/altcha/challenge";
var TICKET_URL=API_BASE+"/ticket";
var DEC_URL="https://enc-dec.app/api/dec-meowtv";
var ORIGIN="https://meowtv.ru";
var REFERER="https://meowtv.ru/";
var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
var SERVERS=[
  {id:"v4:English",label:"English",language:"English"},
  {id:"pseudo",label:"Auto",language:"Multi"},
  {id:"tik",label:"TCloud",language:"Multi"},
  {id:"v4:Hindi",label:"Hindi",language:"Hindi"}
];

function clean(v){return v==null?"":String(v).trim();}
function qnum(v){var s=String(v||"").toLowerCase();if(/2160|4k/.test(s))return 2160;var m=s.match(/(1080|720|480|360)/);return m?parseInt(m[1],10):0;}
function qlabel(url){var n=qnum(url);return n?n+"p":"Auto";}
function bytesToHex(buf){
  var a=new Uint8Array(buf),s="";
  for(var i=0;i<a.length;i++)s+=a[i].toString(16).padStart(2,"0");
  return s;
}
function subtle(){
  try{
    if(globalThis.crypto&&globalThis.crypto.subtle)return globalThis.crypto.subtle;
    if(typeof require!=="undefined"){
      var c=require("node:crypto");
      if(c&&c.webcrypto&&c.webcrypto.subtle)return c.webcrypto.subtle;
    }
  }catch(_){}
  return null;
}
function utf8(s){
  if(typeof TextEncoder!=="undefined")return new TextEncoder().encode(String(s));
  var out=[],str=unescape(encodeURIComponent(String(s)));
  for(var i=0;i<str.length;i++)out.push(str.charCodeAt(i));
  return new Uint8Array(out);
}

function solveChallenge(ch){
  var sub=subtle();
  if(!sub) return Promise.reject(new Error("WebCrypto unavailable"));
  var algorithm=clean(ch&&ch.algorithm)||"SHA-256";
  var challenge=clean(ch&&ch.challenge).toLowerCase();
  var salt=clean(ch&&ch.salt);
  var signature=clean(ch&&ch.signature);
  var max=Number(ch&&ch.maxnumber);
  if(!challenge||!salt||!isFinite(max)||max<0) return Promise.reject(new Error("bad ALTCHA challenge"));

  var n=0;
  function loop(){
    if(n>max)throw new Error("ALTCHA solution not found");
    var cur=n++;
    return sub.digest(algorithm,utf8(salt+String(cur))).then(function(buf){
      if(bytesToHex(buf).toLowerCase()===challenge){
        return {algorithm:algorithm,challenge:challenge,number:cur,salt:salt,signature:signature};
      }
      return loop();
    });
  }
  return loop();
}

function mintTicket(){
  return fetch(CHALLENGE_URL,{
    headers:{"User-Agent":UA,"Accept":"application/json, */*","Referer":REFERER}
  }).then(function(r){
    if(!r.ok)throw new Error("challenge HTTP "+r.status);
    return r.json();
  }).then(solveChallenge).then(function(altcha){
    return fetch(TICKET_URL,{
      method:"POST",
      headers:{
        "User-Agent":UA,
        "Content-Type":"application/json",
        "Accept":"application/json, */*",
        "Origin":ORIGIN,
        "Referer":REFERER
      },
      body:JSON.stringify({altcha:altcha})
    });
  }).then(function(r){
    if(!r.ok)throw new Error("ticket HTTP "+r.status);
    return r.json();
  }).then(function(j){
    var t=clean(j&&j.ticket);
    if(!t)throw new Error("ticket missing");
    return t;
  });
}

function apiUrl(tmdbId,mediaType,season,episode,server){
  var id=encodeURIComponent(String(tmdbId));
  if(mediaType==="tv"){
    return API_BASE+"/tv/"+id+"/"+encodeURIComponent(String(season||1))+"/"+encodeURIComponent(String(episode||1))+"?s="+encodeURIComponent(server);
  }
  return API_BASE+"/movie/"+id+"?s="+encodeURIComponent(server);
}

function fetchEncrypted(url,ticket){
  return fetch(url,{
    headers:{
      "User-Agent":UA,
      "Accept":"application/json, text/plain, */*",
      "Referer":REFERER,
      "Origin":ORIGIN,
      "x-stream-ticket":ticket
    }
  }).then(function(r){
    return r.text().then(function(t){
      if(!r.ok&& !t)throw new Error("HTTP "+r.status);
      if(!clean(t)||/^</.test(clean(t)))throw new Error("bad payload");
      var j;
      try{j=JSON.parse(t);}catch(_){throw new Error("invalid JSON");}
      if(j&&j.error)throw new Error(String(j.error));
      return j;
    });
  });
}

function decrypt(data){
  return fetch(DEC_URL,{
    method:"POST",
    headers:{
      "User-Agent":UA,
      "Content-Type":"application/json",
      "Accept":"application/json, */*"
    },
    body:JSON.stringify({data:data})
  }).then(function(r){
    if(!r.ok)throw new Error("decrypt HTTP "+r.status);
    return r.json();
  }).then(function(j){
    if(!j||j.status!==200||!j.result)throw new Error(clean(j&&j.error)||"decrypt failed");
    return j.result;
  });
}

function one(tmdbId,mediaType,season,episode,server,attempt){
  attempt=attempt||0;
  return mintTicket().then(function(ticket){
    return fetchEncrypted(apiUrl(tmdbId,mediaType,season,episode,server.id),ticket);
  }).then(decrypt).then(function(d){
    var media=clean(d&&d.url);
    if(!/^https?:\/\//i.test(media))return null;
    var headers={"User-Agent":UA,"Referer":REFERER,"Origin":ORIGIN};
    var upstream=d&&d.headers&&typeof d.headers==="object"?d.headers:{};
    Object.keys(upstream).forEach(function(k){var v=clean(upstream[k]);if(v)headers[k]=v;});
    var q=qlabel(media);
    return{
      name:"NoctraTV · Gaiaflix · MeowTV",
      title:"Gaiaflix · MeowTV · "+server.label+" · "+server.id+" · "+q,
      url:media,
      quality:q,
      language:server.language,
      provider:"noctra-gaiaflix-meowtv",
      headers:headers,
      subtitles:[]
    };
  }).catch(function(e){
    var msg=e&&e.message?e.message:String(e);
    if(attempt<1&&/ticket|used|expired|mismatch|410|401/i.test(msg)){
      return one(tmdbId,mediaType,season,episode,server,attempt+1);
    }
    console.log("[Noctra/Gaiaflix/MeowTV] "+server.id+" "+msg);
    return null;
  });
}

function getStreams(tmdbId,mediaType,season,episode){
  // Keep concurrency modest because each branch solves its own ALTCHA ticket.
  var out=[];
  var seen={};
  var i=0;
  function next(){
    if(i>=SERVERS.length)return Promise.resolve(out);
    var s=SERVERS[i++];
    return one(tmdbId,mediaType,season,episode,s,0).then(function(x){
      if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}
      return next();
    });
  }
  return next().then(function(rows){
    rows.sort(function(a,b){return qnum(b.quality)-qnum(a.quality);});
    console.log("[Noctra/Gaiaflix/MeowTV] "+mediaType+" "+tmdbId+" streams="+rows.length);
    return rows;
  }).catch(function(e){
    console.log("[Noctra/Gaiaflix/MeowTV] "+(e&&e.message?e.message:e));
    return[];
  });
}

module.exports={getStreams:getStreams};

// NoctraTV · Novera · VidRock Luna
var API="https://vidrock.ru";
var KEY="7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function b64bytes(s){s=String(s||"").replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";var bin=atob(s),a=[];for(var i=0;i<bin.length;i++)a.push(bin.charCodeAt(i));return a;}
function hex(h){var a=[];for(var i=0;i<h.length;i+=2)a.push(parseInt(h.substr(i,2),16));return a;}
function utf8(a){if(typeof TextDecoder!=="undefined"){try{return new TextDecoder("utf-8").decode(new Uint8Array(a));}catch(_){}}var s="";for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);try{return decodeURIComponent(escape(s));}catch(_){return s;}}
function decrypt(payload){return Promise.resolve().then(function(){var sub=globalThis.crypto&&globalThis.crypto.subtle;if(!sub)return null;var d=b64bytes(payload);if(d.length<=12)return null;return sub.importKey("raw",new Uint8Array(hex(KEY)),{name:"AES-GCM"},false,["decrypt"]).then(function(k){return sub.decrypt({name:"AES-GCM",iv:new Uint8Array(d.slice(0,12)),tagLength:128},k,new Uint8Array(d.slice(12)));}).then(function(buf){return utf8(Array.from(new Uint8Array(buf)));}).catch(function(){return null;});});}
function getStreams(tmdbId,mediaType,season,episode){
  var type=mediaType==="tv"?"tv":"movie";
  var q=type==="tv"?String(tmdbId)+"_"+String(season||1)+"_"+String(episode||1):String(tmdbId);
  return fetch(API+"/api/"+type+"/"+q+"/",{headers:{"User-Agent":UA,"Origin":API,"Referer":API+"/"}}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();}).then(function(j){
    var key=Object.keys(j||{}).find(function(k){return String(k).toLowerCase()==="luna";});
    if(!key)return [];
    var enc=j[key]&&(j[key].url||j[key]);if(!enc||typeof enc!=="string")return [];
    return decrypt(enc).then(function(url){
      if(!url||!/^https?:\/\//i.test(url))return [];
      return [{name:"NoctraTV · Novera · VidRock Luna",title:"Novera · VidRock · Luna",url:url,quality:"720p",provider:"noctra-novera-vidrock-luna",headers:{"User-Agent":UA,"Origin":API,"Referer":API+"/"},subtitles:[]}];
    });
  }).catch(function(e){console.log("[Noctra/Novera/VidRock/Luna] "+(e&&e.message?e.message:e));return[];});
}
module.exports={getStreams:getStreams};

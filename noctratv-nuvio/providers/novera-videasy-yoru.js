// NoctraTV · Novera · Videasy Yoru
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var TMDB="https://api.themoviedb.org/3";
var DEC="https://enc-dec.app/api/dec-videasy";
var BASES=["https://api.videasy.net","https://api.speedracelight.com","https://api.videasy.to"];
var PLAYER="https://player.videasy.net";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function meta(id,type){var t=type==="tv"?"tv":"movie";return fetch(TMDB+"/"+t+"/"+id+"?api_key="+TMDB_KEY+"&append_to_response=external_ids",{headers:{"User-Agent":UA}}).then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();}).then(function(d){var date=clean(t==="tv"?d.first_air_date:d.release_date);return{type:t,title:clean(t==="tv"?d.name:d.title),year:date?date.slice(0,4):"",imdb:clean(d&&d.external_ids&&d.external_ids.imdb_id)};});}
function build(base,m,id){return base+"/cdn/sources-with-title?title="+encodeURIComponent(m.title)+"&mediaType="+encodeURIComponent(m.type)+"&year="+encodeURIComponent(m.year)+"&tmdbId="+encodeURIComponent(String(id))+"&imdbId="+encodeURIComponent(m.imdb);}
function dec(t,id){return fetch(DEC,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":UA},body:JSON.stringify({text:t,id:String(id)})}).then(function(r){if(!r.ok)throw new Error("DEC "+r.status);return r.json();}).then(function(d){return d&&d.result?d.result:d;});}
function oneBase(base,m,id){return fetch(build(base,m,id),{headers:{"User-Agent":UA,"Accept":"*/*","Origin":PLAYER,"Referer":PLAYER+"/"}}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.text();}).then(function(t){if(!clean(t)||/^</.test(clean(t)))throw new Error("bad payload");return dec(t,id);}).then(function(d){var a=d&&Array.isArray(d.sources)?d.sources:[];return a.map(function(x){var u=clean(x&&(x.url||x.file));if(!/^https?:\/\//i.test(u))return null;var q=clean(x.quality)||"Auto";return{name:"NoctraTV · Novera · Videasy Yoru",title:"Novera · Videasy · Yoru · "+q,url:u,quality:q,provider:"noctra-novera-videasy-yoru",headers:{"User-Agent":UA,"Origin":PLAYER,"Referer":PLAYER+"/"},subtitles:[]};}).filter(Boolean);});}
function getStreams(tmdbId,mediaType,season,episode){if(mediaType==="tv")return Promise.resolve([]);return meta(tmdbId,mediaType).then(function(m){var i=0;function next(){if(i>=BASES.length)return[];var b=BASES[i++];return oneBase(b,m,tmdbId).then(function(a){return a&&a.length?a:next();}).catch(function(){return next();});}return next();}).catch(function(e){console.log("[Noctra/Novera/Videasy/Yoru] "+(e&&e.message?e.message:e));return[];});}
module.exports={getStreams:getStreams};

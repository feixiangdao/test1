var BASES=["https://nontongo.win","https://www.nontongo.win"];
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";
function clean(v){return v==null?"":String(v).trim();}
function timeout(ms){return new Promise(function(resolve){setTimeout(function(){resolve({__timeout:true});},ms);});}
function timedFetch(url,opt,ms){return Promise.race([fetch(url,opt),timeout(ms||6500)]).then(function(r){if(r&&r.__timeout)throw new Error("timeout");return r;});}
function rows(html,base){
 var m=String(html||"").match(/(?:const\s+sources\s*=|sources\s*:)\s*(\[[^\]]+\])/i); if(!m)return[];
 var a=[]; try{a=JSON.parse(m[1]);}catch(e){return[];}
 return a.map(function(s){var u=clean(s&&(s.file||s.src||s.url)); if(!/^https?:\/\//i.test(u))return null;
   var q=clean(s.label||s.quality||"Auto"),name="OnlyFlix · Server 2 · NontonGo · "+q;
   return{name:name,title:name,url:u,quality:q,provider:"onlyflix-nontongo",headers:{"User-Agent":UA,"Referer":base+"/"},subtitles:[]};
 }).filter(Boolean);
}
function page(base,id,type,s,e){return type==="tv"?base+"/stream/tv_upcloud/view1.php?id="+encodeURIComponent(id)+"&s="+encodeURIComponent(s||1)+"&e="+encodeURIComponent(e||1):base+"/stream/movie_upcloud/view1.php?id="+encodeURIComponent(id)+"&type=movie";}
function tryBase(i,id,type,s,e){
 if(i>=BASES.length)return Promise.resolve([]);
 var b=BASES[i];
 return timedFetch(page(b,id,type,s,e),{headers:{"User-Agent":UA,"Referer":b+"/","Accept":"text/html,*/*"}},6500)
  .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.text();})
  .then(function(t){var x=rows(t,b);return x.length?x:tryBase(i+1,id,type,s,e);})
  .catch(function(){return tryBase(i+1,id,type,s,e);});
}
function getStreams(tmdbId,mediaType,season,episode){
 if(!tmdbId)return Promise.resolve([]); if(mediaType==="tv"&&(!season||!episode))return Promise.resolve([]);
 return Promise.race([tryBase(0,tmdbId,mediaType,season,episode),timeout(14000)]).then(function(x){
   if(x&&x.__timeout)return[]; console.log("[OnlyFlix/NontonGo] streams="+(x||[]).length); return x||[];
 }).catch(function(){return[];});
}
module.exports={getStreams:getStreams};
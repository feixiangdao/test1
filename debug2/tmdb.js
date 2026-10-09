// NOVIPNOAD Stage TMDB Safe v0.1.1
function clean(v){return v==null?"":String(v).trim();}
function row(label){
  return [{name:label,title:label,url:"https://example.com/tmdb-safe.m3u8",quality:"Diag",type:"hls",provider:"novipnoad-stage-tmdb-safe",headers:{},subtitles:[]}];
}
function requestTmdb(id){
  if(typeof fetch!=="function")return Promise.resolve({error:"fetch missing"});
  var key="1865f43a0549ca50d341dd9ab8b29f49";
  var url="https://api.themoviedb.org/3/movie/"+encodeURIComponent(String(id))+"?api_key="+encodeURIComponent(key)+"&language=en-US";
  return fetch(url,{method:"GET",headers:{"Accept":"application/json"}}).then(function(r){
    if(!r)return {error:"no response"};
    if(!r.ok)return {error:"HTTP "+r.status};
    return r.text().then(function(t){
      try{
        var j=JSON.parse(t);
        return {title:clean(j.title||j.name),year:clean(j.release_date||j.first_air_date).slice(0,4)};
      }catch(e){return {error:"JSON "+String(e&&e.message||e)};}
    });
  }).catch(function(e){return {error:String(e&&e.message||e)};});
}
function getStreams(id,mediaType,season,episode){
  var work=requestTmdb(id);
  if(typeof setTimeout==="function"){
    var timer=new Promise(function(resolve){setTimeout(function(){resolve({timeout:true});},15000);});
    return Promise.race([work,timer]).then(function(r){
      if(r&&r.timeout)return row("TMDB TIMEOUT");
      if(r&&r.error)return row("TMDB FAIL · "+r.error);
      return row("TMDB OK · "+(r.title||"?")+" · "+(r.year||"?"));
    }).catch(function(e){return row("TMDB THROW · "+String(e&&e.message||e));});
  }
  return work.then(function(r){
    if(r&&r.error)return row("TMDB FAIL · "+r.error);
    return row("TMDB OK · "+(r.title||"?")+" · "+(r.year||"?"));
  }).catch(function(e){return row("TMDB THROW · "+String(e&&e.message||e));});
}
module.exports={getStreams:getStreams};

// Nuvio generic fetch diagnostic
function row(label){
  return [{name:label,title:label,url:"https://example.com/probe.m3u8",quality:"Diag",type:"hls",provider:"generic-fetch-probe",headers:{},subtitles:[]}];
}
function getStreams(id,mediaType,season,episode){
  if(typeof fetch!=="function") return Promise.resolve(row("FETCH MISSING"));
  return fetch("https://example.com",{method:"GET"}).then(function(r){
    if(!r) return row("FETCH NO RESPONSE");
    return r.text().then(function(t){
      return row("FETCH OK · HTTP "+r.status+" · "+String(t||"").length+" bytes");
    });
  }).catch(function(e){
    return row("FETCH FAIL · "+String(e&&e.message||e));
  });
}
module.exports={getStreams:getStreams};

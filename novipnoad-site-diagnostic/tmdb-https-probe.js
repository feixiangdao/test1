// TMDB transport-only probe. No API key, no cookies, no media links.
// 1 = fetch exception, 2 = missing response, 3 = expected API auth rejection,
// 4 = HTTPS 2xx, 5 = any other HTTP status.
function diagnosticRows(code) {
  var rows=[];
  for (var i=0;i<code;i++) rows.push({
    name:'TMDB HTTPS CODE '+code,
    title:'TMDB HTTPS CODE '+code,
    url:'https://example.com/tmdb-transport-probe-'+(i+1)+'.m3u8',
    quality:'Diagnostic', type:'hls', provider:'tmdb-https-probe',headers:{},subtitles:[]
  });
  return rows;
}
async function getStreams(){
  try{
    var response=await fetch('https://api.themoviedb.org/3/configuration',{
      method:'GET',headers:{'Accept':'application/json'}
    });
    if(!response)return diagnosticRows(2);
    var status=Number(response.status)||0;
    if(status===401||status===403)return diagnosticRows(3);
    if(status>=200&&status<=299)return diagnosticRows(4);
    return diagnosticRows(5);
  }catch(e){return diagnosticRows(1);}
}
module.exports={getStreams:getStreams};

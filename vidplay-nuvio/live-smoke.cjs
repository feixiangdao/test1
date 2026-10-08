// Read-only live integration smoke test. No credentials, Cloudflare bypass or playback claims.
const provider=require('./providers/vidplay.js');
const originalFetch=globalThis.fetch.bind(globalThis);
let requests=[];
globalThis.SCRAPER_SETTINGS={};
globalThis.fetch=async function(url,opt){
  const address=String(url);
  const signal=AbortSignal.timeout(12000);
  try{
    const res=await originalFetch(address,{...(opt||{}),signal});
    requests.push({path:new URL(address).pathname,status:res.status,contentType:res.headers.get('content-type')||''});
    return res;
  }catch(e){
    requests.push({path:new URL(address).pathname,error:e.name+': '+e.message.slice(0,110)});
    throw e;
  }
};
(async()=>{
  for(const test of [{name:'Life (2017) movie V3',id:395992,type:'movie'},{name:'Abbott Elementary S1E1',id:125935,type:'tv',season:1,episode:1}]){
    requests=[];
    const start=Date.now();
    const streams=await provider.getStreams(test.id,test.type,test.season,test.episode);
    console.log('LIVE_CASE',JSON.stringify({
      case:test.name,
      durationMs:Date.now()-start,
      count:streams.length,
      requests:requests,
      returnedFormats:streams.map(x=>x.type),
      verdict:streams.length?'CANDIDATES_NEED_NUVIO_PLAYBACK_VERIFICATION':'NO_PLAYABLE_CANDIDATES'
    }));
  }
})().catch(e=>{console.log('SMOKE_ERROR',e.stack||e);process.exitCode=1});

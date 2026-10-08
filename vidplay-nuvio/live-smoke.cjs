// Live V1-only smoke test. Uses no credentials and no mocked HTTP responses. All metadata / YTHD / player requests are live.
// No bypass or claims of Nuvio playback.
const provider=require("./providers/vidplay.js");
const nativeFetch=globalThis.fetch.bind(globalThis);
let requests=[];
globalThis.SCRAPER_SETTINGS={};
globalThis.fetch=async function(url,opts){
  const addr=String(url);
  try{
    const response=await nativeFetch(addr,{...(opts||{}),signal:AbortSignal.timeout(9500)});
    const u=new URL(addr);
    requests.push({host:u.host,path:u.pathname,status:response.status});
    return response;
  }catch(e){
    let u=new URL(addr);
    requests.push({host:u.host,path:u.pathname,error:e.name+":"+e.message.slice(0,80)});
    throw e;
  }
};
(async()=>{
  const start=Date.now();
  const rows=await provider.getStreams(395992,"movie");
  console.log("LIVE_V1",JSON.stringify({
    test:"Life (2017); live public keyless metadata and actual V1",ms:Date.now()-start,
    streamCount:rows.length,quality:rows.map(x=>x.quality),formats:rows.map(x=>x.type),
    requestedServices:requests,
    v2v3Attempted:requests.some(x=>/mov_vplay[23]|tv_vplay[23]/.test(x.path)),
    mediaVerified:rows.length>0,
    note:rows.length?"Nuvio device playback still unverified":"No media available to CI; not a playback result"
  }));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

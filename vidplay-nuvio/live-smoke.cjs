// Live V1 smoke for the actual user-tested Kung Fu Panda (TMDB 9502) and Life (395992).
// No browser cookies, secrets or mocked HTTP. Never log signed media URLs.
const provider=require("./providers/vidplay.js");
const nativeFetch=globalThis.fetch.bind(globalThis);
let requests=[];
globalThis.SCRAPER_SETTINGS={};
globalThis.fetch=async function(url,opts){
  const addr=String(url);
  try{
    const response=await nativeFetch(addr,{...(opts||{}),signal:AbortSignal.timeout(9000)});
    const u=new URL(addr);
    requests.push({host:u.host,pathTail:u.pathname.split("/").pop()?.slice(-24),status:response.status});
    return response;
  }catch(e){
    const u=new URL(addr);
    requests.push({host:u.host,pathTail:u.pathname.split("/").pop()?.slice(-24),error:e.name+":"+e.message.slice(0,60)});
    throw e;
  }
};
(async()=>{
  for(const test of [{title:"Kung Fu Panda (2008)",id:9502},{title:"Life (2017)",id:395992}]){
    requests=[];
    const start=Date.now();
    const rows=await provider.getStreams(test.id,"movie");
    const media=rows.filter(x=>x&&x.quality!=="Status"&&!/^data:/i.test(x.url||""));
    const diagnostics=rows.filter(x=>x&&x.quality==="Status");
    console.log("LIVE_V1",JSON.stringify({
      test:test.title,tmdb:test.id,ms:Date.now()-start,
      streams:media.length,qualities:media.map(x=>x.quality),types:media.map(x=>x.type),
      diagnosticCount:diagnostics.length,diagnostics:diagnostics.map(x=>x.name),
      requests,v2v3Attempted:requests.some(x=>/mov_vplay[23]|tv_vplay[23]/.test(x.pathTail||"")),
      phonePlayback:"not yet verified"
    }));
    await new Promise(resolve=>setTimeout(resolve,800));
  }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

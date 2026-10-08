// Simulates the exact observed Android failure:
// fetch Response has no arrayBuffer, and __native_fetch returns no bodyBase64.
// Confirms that real V1 media extraction still works in this legacy runtime.
const plugin=require("./providers/vidplay.js");
const realFetch=globalThis.fetch.bind(globalThis);
globalThis.SCRAPER_SETTINGS={};
const counts={withoutArrayBuffer:0,emptyBinaryBridge:0};
globalThis.fetch=async(url,opt)=>{
  const address=String(url);
  const res=await realFetch(address,{...(opt||{}),signal:AbortSignal.timeout(10000)});
  if(/https:\/\/data\.vidsrc(?:me\.ru|\.sh)\/wasm\.php/.test(address)){
    counts.withoutArrayBuffer++;
    return{ok:res.ok,status:res.status,
      headers:res.headers,text:async()=>res.text()}; // intentionally NO arrayBuffer
  }
  return res;
};
globalThis.__native_fetch=async(url,method,headersJSON,bodyKind,body,followRedirects)=>{
  const address=String(url);
  if(!/^https:\/\/data\.vidsrc(?:me\.ru|\.sh)\/wasm\.php/.test(address))
    throw Error("Unexpected native call");
  counts.emptyBinaryBridge++;
  // Actual user phone responds successfully, but provides NO binary bodyBase64.
  return JSON.stringify({ok:true,status:200,body:"",bodyBase64:""});
};
(async()=>{
 for(const movie of [{id:9502,title:"Kung Fu Panda (2008)"},{id:395992,title:"Life (2017)"}]){
   const begin=Date.now();
   const rows=await plugin.getStreams(movie.id,"movie");
   const streams=rows.filter(x=>x.quality!=="Status"&&!/^data:/i.test(x.url||""));
   console.log("NO_BINARY_PHONE_SIM",JSON.stringify({title:movie.title,ms:Date.now()-begin,
     streams:streams.length,qualities:streams.map(x=>x.quality),
     errors:rows.filter(x=>x.quality==="Status").map(x=>x.name),
     counts}));
   if(!streams.length)process.exitCode=1;
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

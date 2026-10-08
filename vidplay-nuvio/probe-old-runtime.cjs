// Recreate observed older Nuvio behavior: Response.arrayBuffer is absent,
// but the official __native_fetch binary bodyBase64 channel is available.
// Live HTTP requests, no cookies, secrets, saved media addresses or browser bypass.
const provider=require("./providers/vidplay.js");
const nativeFetch=globalThis.fetch.bind(globalThis);
globalThis.SCRAPER_SETTINGS={};
let rawBridgeCount=0,binaryReaderBlockedCount=0;
const requests=[];
globalThis.fetch=async function(url,options){
  const u=String(url),r=await nativeFetch(u,{...(options||{}),signal:AbortSignal.timeout(9000)});
  const parsed=new URL(u);
  requests.push({host:parsed.hostname,path:parsed.pathname.split("/").pop(),status:r.status});
  if(parsed.pathname==="/wasm.php"&&/vidsrc/.test(parsed.hostname)){
    binaryReaderBlockedCount++;
    // Simulate a legacy polyfill which supports text() but not arrayBuffer().
    return {ok:r.ok,status:r.status,text:async()=>r.text(),headers:r.headers};
  }
  return r;
};
globalThis.__native_fetch=async function(url,method,headersJSON,bodyKind,body,followRedirects){
  rawBridgeCount++;
  const parsed=new URL(url);
  if(parsed.hostname!=="data.vidsrc.sh"||parsed.pathname!=="/wasm.php")
    throw new Error("Unexpected raw bridge URL");
  const r=await nativeFetch(url,{method,headers:JSON.parse(headersJSON),signal:AbortSignal.timeout(9000)});
  const b=Buffer.from(await r.arrayBuffer());
  requests.push({host:parsed.hostname,path:"wasm.php(raw)",status:r.status,bytes:b.length});
  return JSON.stringify({ok:r.ok,status:r.status,bodyBase64:b.toString("base64")});
};
(async()=>{
  for(const [title,id] of [["Kung Fu Panda (2008)",9502],["Life (2017)",395992]]){
    const start=Date.now(),from=requests.length;
    const rows=await provider.getStreams(id,"movie");
    const streams=rows.filter(x=>x.quality!=="Status"&&!String(x.url).startsWith("data:"));
    console.log("OLD_NUVIO_COMPAT",JSON.stringify({
      title,ms:Date.now()-start,
      streamCount:streams.length,qualities:streams.map(x=>x.quality),
      status:rows.filter(x=>x.quality==="Status").map(x=>x.name),
      rawBridgeCount,binaryReaderBlockedCount,
      called:requests.slice(from)
    }));
    if(!streams.length)process.exitCode=1;
  }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
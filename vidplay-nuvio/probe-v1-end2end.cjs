// V1 proof: exercise current provider code with only the premature
// turnstile gating line disabled *in memory*. Never modify published Provider
// until signed API response + real HLS manifest verification pass.
const fs=require("node:fs");
const filename="vidplay-nuvio/providers/vidplay.js";
let src=fs.readFileSync(filename,"utf8");
const guard='if(c.turnstile)throw new Error("V1 requires browser verification");';
if(!src.includes(guard))throw Error("Expected v0.1.4 V1 guard was not found");
src=src.replace(guard,'if(c.turnstile)log("Turnstile flag present; check server token authorization");');
const plugin={exports:{}};
new Function("module","exports",src)(plugin,plugin.exports);
globalThis.SCRAPER_SETTINGS={};
let reqs=[];
const original=globalThis.fetch.bind(globalThis);
globalThis.fetch=async (url,options)=>{
  let u=new URL(String(url));
  const start=Date.now();
  try{let r=await original(url,{...(options||{}),signal:AbortSignal.timeout(10000)});
    reqs.push({host:u.hostname,path:u.pathname,status:r.status,ms:Date.now()-start});
    return r;
  }catch(e){reqs.push({host:u.hostname,path:u.pathname,error:e.name+":"+e.message.slice(0,90)});throw e}
};
(async()=>{
 const start=Date.now();
 const rows=await plugin.exports.getStreams(395992,"movie");
 const playable=rows.filter(r=>r.quality!=="Status"&&!/^data:/i.test(r.url||""));
 console.log("V1_END_TO_END",JSON.stringify({
  ms:Date.now()-start,returned:rows.length,playable:playable.length,
  qualities:playable.map(x=>x.quality),types:playable.map(x=>x.type),
  targets:playable.map(x=>{let u=new URL(x.url);return{host:u.host,path:u.pathname}}),
  calls:reqs,
  statusNames:rows.filter(r=>r.quality==="Status").map(x=>x.name),
  caveat:"No Android playback claim; confirms server-side HLS HTTP only"
 }));
})().catch(e=>{console.error("FAIL",e.stack||e);process.exitCode=1});
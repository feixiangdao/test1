import {readFile} from "node:fs/promises";
import vm from "node:vm";
import https from "node:https";

const hostname="plsdontscrapemelove.flixer.su";
const lookupUrl="https://dns.google/resolve?name="+hostname+"&type=A&cd=true";
const dns=await fetch(lookupUrl,{signal:AbortSignal.timeout(8000)}).then(r=>r.json());
const ip=(dns.Answer||[]).find(a=>a.type===1)?.data;
if(!ip)throw Error("LIVE_NODE_NO_DNS");

const statuses=[];
function pinnedFetch(address,opts={}){
 const u=new URL(address);
 return new Promise((resolve,reject)=>{
  const req=https.request({
   hostname:u.hostname,path:u.pathname+u.search,port:443,method:"GET",
   headers:opts.headers||{},lookup:(_hostname,_opts,cb)=>{if(typeof _opts==="function"){cb=_opts;_opts={}}if(_opts&&_opts.all)cb(null,[{address:ip,family:4}]);else cb(null,ip,4)},timeout:12000
  },res=>{
   const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>{
    const body=Buffer.concat(chunks).toString("utf8");
    statuses.push({path:u.pathname,status:res.statusCode,bytes:body.length,
     error:res.statusCode>=400?body.slice(0,120).replace(/[0-9a-f]{20,}/ig,"[redacted]"):undefined,
     headerLengths:u.pathname.endsWith("/images")?Object.fromEntries(Object.entries(opts.headers||{}).filter(([k])=>k.toLowerCase().startsWith("x-")).map(([k,v])=>[k,String(v).length])):undefined});
    resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,
      text:()=>Promise.resolve(body),json:()=>Promise.resolve(JSON.parse(body))});
   });
  });req.on("timeout",()=>req.destroy(Error("HTTP_TIMEOUT")));req.on("error",reject);req.end();
 });
}
const code=await readFile("/tmp/flixer-local-candidate.js","utf8");
const sandbox={console,Date,Math,Promise,Uint8Array,Uint16Array,Uint32Array,Int32Array,Float32Array,Float64Array,
ArrayBuffer,DataView,Object,Array,String,Number,Boolean,RegExp,JSON,Error,TypeError,
WebAssembly:undefined,module:{exports:{}},fetch:pinnedFetch};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(code,sandbox,{timeout:25000});
const streams=await sandbox.module.exports.getStreams("9502","movie");
console.log("NATIVELESS_LIVE_LOCAL_REQUEST",JSON.stringify({statuses,streamCount:streams?.length||0,types:(streams||[]).map(x=>x.type)}));
if(!Array.isArray(streams)||!streams.some(x=>/^https:/.test(x.url)))throw Error("LOCAL_HTTP_LIVE_NO_PLAYABLE_STREAM");
console.log("NATIVELESS_LIVE_LOCAL_PASS");

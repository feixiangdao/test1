// Reproduce the public NuvioTV QuickJS polyfill and call wrapper
// using a same-version ephemeral Flixer ciphertext/key fixture.
import { getQuickJS } from "quickjs-emscripten";
import { readFile } from "node:fs/promises";

const original=await readFile("/tmp/flixer-local-candidate.js","utf8");
const fixture=JSON.parse(await readFile("/tmp/flixer-fixture.json","utf8"));
const kotlin=await readFile("/tmp/PluginRuntime.kt","utf8");
function methodScript(method,nextMarker){
  const start=kotlin.indexOf("private fun "+method+"(): String");
  if(start<0)throw Error("METHOD_MISSING_"+method);
  const first=kotlin.indexOf('"""',start);
  if(first<0)throw Error("METHOD_STRING_MISSING_"+method);
  const last=kotlin.indexOf('"""',first+3);
  if(last<0)throw Error("METHOD_END_MISSING_"+method);
  return kotlin.slice(first+3,last);
}
const fullPolyfill=methodScript("getStaticPolyfillCode");
const p0=fullPolyfill.indexOf("// Fetch implementation (async)"),p1=fullPolyfill.indexOf("// AbortController/AbortSignal minimal polyfill",p0);
if(p0<0||p1<0)throw Error("NUVIO_FETCH_SLICE_MISSING");
// Evaluate exactly Nuvio native-fetch shim; unrelated 30 KB DOM polyfills are compiled separately by the Android host.
const polyfill=fullPolyfill.slice(p0,p1);
const call=methodScript("getStaticCallCode");
const qjs=await getQuickJS();
const rt=qjs.newRuntime();rt.setMemoryLimit(128*1024*1024);rt.setMaxStackSize(6*1024*1024);
const ctx=rt.newContext();
const calls=[];
let captured="__NOT_DONE__";
function host(name,fn) {
  const f=ctx.newFunction(name,(...hs)=>fn(...hs.map(x=>ctx.dump(x))));
  ctx.setProp(ctx.global,name,f);f.dispose();
}
try {
 host("atob",(v)=>ctx.newString(Buffer.from(String(v||""),"base64").toString("binary")));
 host("__get_scraper_id",()=>ctx.newString("flixer-local-alpha-030"));
 host("__get_scraper_settings",()=>ctx.newString("{}"));
 host("__get_tmdb_api_key",()=>ctx.newString(""));
 host("__get_call_args",()=>ctx.newString(JSON.stringify({tmdbId:"9502",mediaType:"movie",season:null,episode:null})));
 host("__capture_result",(v)=>{captured=v;return ctx.undefined});
 host("__native_fetch",(url,method,headersJSON,bodyKind,body,followRedirects)=>{
   let path="";try{path=new URL(url).pathname}catch{}
   let headers={};try{headers=JSON.parse(headersJSON)}catch{}
   let content="",status=200;
   if(path==="/api/time")content=JSON.stringify({timestamp:Math.floor(Date.now()/1000)});
   else if(path==="/api/tmdb/movie/9502/images")content=fixture.body;
   else {status=404;content="unknown route";}
   calls.push({path,status,method,hasSignature:typeof headers["X-Request-Signature"]==="string",hasApiKey:typeof headers["X-Api-Key"]==="string"});
   const response={ok:status>=200&&status<300,status,statusText:status===200?"OK":"Not Found",url,body:content,bodyBase64:Buffer.from(content).toString("base64"),headers:{"content-type":"text/plain"},truncated:false};
   return ctx.newString(JSON.stringify(response));
 });
 let p=ctx.evalCode("var console={log:function(){},error:function(){},warn:function(){}};\n"+polyfill,"nuvio-polyfill.js",{type:"global"});
 if(p.error){
  const e=ctx.dump(p.error);
  const msg=ctx.getProp(p.error,"message"),stack=ctx.getProp(p.error,"stack"),name=ctx.getProp(p.error,"name");
  console.log("NUVIO_POLYFILL_DIAG",JSON.stringify({e,msg:ctx.dump(msg),stack:String(ctx.dump(stack)).slice(0,550),name:ctx.dump(name),sourceLength:polyfill.length,first:polyfill.slice(0,110)}));
  msg.dispose();stack.dispose();name.dispose();p.error.dispose();
  throw Error("POLYFILL_ERROR");
 }
 p.value.dispose();
 // Nuvio performs eval in an IIFE, after injecting its polyfill.
 const wrapped="var module={exports:{}};var exports=module.exports;(function(){\n"+original+
  "\nget_img_key=function(){return "+JSON.stringify(fixture.suppliedKey)+";};\n})();";
 p=ctx.evalCode(wrapped,"nuvio-provider.js",{type:"global"});
 if(p.error){const e=ctx.dump(p.error);p.error.dispose();throw Error("PROVIDER_LOAD_ERROR: "+String(e).slice(0,350))}
 p.value.dispose();
 p=ctx.evalCode(call,"nuvio-call.js",{type:"global"});
 if(p.error){const e=ctx.dump(p.error);p.error.dispose();throw Error("CALL_ERROR: "+String(e).slice(0,300))}
 p.value.dispose();
 let iterations=0;
 for(;iterations<20000&&captured==="__NOT_DONE__";iterations++){
   const job=rt.executePendingJobs();
   if(job.error){const e=ctx.dump(job.error);job.error.dispose();throw Error("QUICKJS_JOB_ERROR: "+String(e).slice(0,320))}
   if(!job.value)break;
 }
 let decoded;try{decoded=JSON.parse(captured)}catch{decoded=null}
 console.log("NUVIO_RUNTIME_PARITY",JSON.stringify({passed:Array.isArray(decoded)&&decoded.length>=1,streamCount:Array.isArray(decoded)?decoded.length:-1,iterations,requests:calls,firstType:Array.isArray(decoded)&&decoded[0]?.type||null}));
 if(!Array.isArray(decoded)||!decoded.length)process.exitCode=1;
} finally {ctx.dispose();rt.dispose()}

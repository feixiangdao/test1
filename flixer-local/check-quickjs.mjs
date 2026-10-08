import { getQuickJS } from "quickjs-emscripten";
import { readFile } from "node:fs/promises";

const filename=process.env.FLIXER_SCRIPT_PATH || "flixer-local/providers/flixer-local-live-alpha.js";
const code=await readFile(filename,"utf8");
console.log("QJS_INPUT",{bytes:Buffer.byteLength(code),lines:code.split("\n").length});
const qjs=await getQuickJS();
for(const memMiB of [32,64,128]){
 const runtime=qjs.newRuntime();
 runtime.setMemoryLimit(memMiB*1024*1024);
 runtime.setMaxStackSize(4*1024*1024);
 const ctx=runtime.newContext();
 const start=Date.now();
 try {
  const wrapper="var module={exports:{}}; var exports=module.exports; (function(){\n"+code+"\nmodule.exports.__testKey=function(){return typeof get_img_key==='function'?get_img_key():'MISSING_KEY_FUNCTION';};\n})();"+
    "JSON.stringify({hasStreams:typeof module.exports.getStreams==='function',hasSettings:typeof module.exports.onSettings==='function',appInfo:typeof navigator==='object',globalJSDecoder:typeof globalThis.WebAssembly});";
  const res=ctx.evalCode(wrapper,"flixer-local-provider.js",{type:"global"});
  if(res.error){
   const e=ctx.dump(res.error);
   res.error.dispose();
   console.log("QUICKJS_EVALUATION_ERROR",JSON.stringify({memoryMiB:memMiB,elapsedMs:Date.now()-start,error:String(e).slice(0,1400)}));
  }else{
   console.log("QUICKJS_EVALUATION_OK",JSON.stringify({memoryMiB:memMiB,elapsedMs:Date.now()-start,value:ctx.dump(res.value)}));
   res.value.dispose();
   const key=ctx.evalCode("(function(){try{var k=module.exports.__testKey();return JSON.stringify({type:typeof k,length:typeof k==='string'?k.length:-1});}catch(e){return String(e)}})()");
   if(key.error){console.log("QUICKJS_KEY_ERROR",JSON.stringify(ctx.dump(key.error)));key.error.dispose()}
   else {console.log("QUICKJS_KEY_RESULT",JSON.stringify(ctx.dump(key.value)));key.value.dispose()}
  }
 }catch(e){console.log("QUICKJS_HOST_EXCEPTION",JSON.stringify({memoryMiB:memMiB,message:String(e).slice(0,900)}))}
 finally{ctx.dispose();runtime.dispose()}
}

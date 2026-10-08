import { getQuickJS } from "quickjs-emscripten";
import {readFile} from "node:fs/promises";
const blob=JSON.parse(await readFile("/tmp/flixer-fixture.json","utf8"));
if(!blob.body || !blob.suppliedKey)throw Error("MISSING_SAME_VERSION_FIXTURE");
const code=await readFile("/tmp/flixer-local-candidate.js","utf8");
const quickjs=await getQuickJS();
const rt=quickjs.newRuntime();rt.setMemoryLimit(64*1024*1024);rt.setMaxStackSize(4*1024*1024);
const ctx=rt.newContext();
try {
 const script="var module={exports:{}};var exports=module.exports;(function(){\n"+code+
  "\nmodule.exports.__testDecrypt = function(body,key){return process_img_data(body,key);};\n})();";
 const init=ctx.evalCode(script,"flixer-test-local.js",{type:"global"});
 if(init.error){let e=ctx.dump(init.error);init.error.dispose();throw Error("QUICKJS_SOURCE_LOAD_FAILED "+String(e).slice(0,220))}
 init.value.dispose();
 const expression="(function(){globalThis.__flixerResult='PENDING';try{var p=module.exports.__testDecrypt("+JSON.stringify(blob.body)+","+JSON.stringify(blob.suppliedKey)+");Promise.resolve(p).then(function(s){try{var d=typeof s==='string'?JSON.parse(s):s;var a=Array.isArray(d.sources)?d.sources:Array.isArray(d.sources&&d.sources.sources)?d.sources.sources:[];globalThis.__flixerResult=JSON.stringify({ok:true,sourceCount:a.length,mediaCount:a.filter(function(x){var u=x&&(x.url||x.file||x.stream);return typeof u==='string'&&/^https?:/.test(u)}).length});}catch(e){globalThis.__flixerResult=JSON.stringify({ok:false,stage:'decodeParse',error:String(e).slice(0,160)})}},function(e){globalThis.__flixerResult=JSON.stringify({ok:false,stage:'promise',error:String(e).slice(0,160)})});return 'PROMISE_ATTACHED'}catch(e){globalThis.__flixerResult=JSON.stringify({ok:false,stage:'call',error:String(e).slice(0,160)});return 'SYNC_ERROR'}})()";
 const out=ctx.evalCode(expression,"flixer-test-decrypt.js",{type:"global"});
 if(out.error){let e=ctx.dump(out.error);out.error.dispose();throw Error("QUICKJS_DECRYPT_THROW "+String(e).slice(0,250))}
 out.value.dispose();
 let result=null,cycles=0;
 for(;cycles<120;cycles++){
   const run=rt.executePendingJobs();
   if(run.error){const e=ctx.dump(run.error);run.error.dispose();throw Error("QUICKJS_MICROTASK_EXCEPTION "+String(e).slice(0,180))}
   const poll=ctx.evalCode("globalThis.__flixerResult");
   if(poll.error){const e=ctx.dump(poll.error);poll.error.dispose();throw Error("QUICKJS_RESULT_POLL_FAILED "+String(e).slice(0,180))}
   const value=ctx.dump(poll.value);poll.value.dispose();
   if(value!=="PENDING"){result=JSON.parse(value);break}
 }
 console.log("QUICKJS_REAL_CIPHER_PARITY",{...result,cycles});
 if(!result?.ok||result.mediaCount<1)throw Error("NO_QUICKJS_DECRYPTED_MEDIA");
}finally {ctx.dispose();rt.dispose()}

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
 const expression="(function(){try{var s=module.exports.__testDecrypt("+JSON.stringify(blob.body)+","+JSON.stringify(blob.suppliedKey)+");var d=JSON.parse(s);var a=Array.isArray(d.sources)?d.sources:Array.isArray(d.sources&&d.sources.sources)?d.sources.sources:[];return JSON.stringify({ok:true,sourceCount:a.length,mediaCount:a.filter(function(x){var u=x&&(x.url||x.file||x.stream);return typeof u==='string'&&/^https?:/.test(u)}).length});}catch(e){return JSON.stringify({ok:false,error:String(e).slice(0,180)});}})()";
 const out=ctx.evalCode(expression,"flixer-test-decrypt.js",{type:"global"});
 if(out.error){let e=ctx.dump(out.error);out.error.dispose();throw Error("QUICKJS_DECRYPT_THROW "+String(e).slice(0,250))}
 const result=JSON.parse(ctx.dump(out.value));out.value.dispose();
 console.log("QUICKJS_REAL_CIPHER_PARITY",result);
 if(!result.ok||result.mediaCount<1)throw Error("NO_QUICKJS_DECRYPTED_MEDIA");
}finally {ctx.dispose();rt.dispose()}

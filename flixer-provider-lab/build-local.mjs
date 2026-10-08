// Build a standalone JavaScript proof-of-concept from public wasm-bindgen glue
// and Binaryen wasm2js output. Research only: not enabled in Nuvio.
import {readFile,writeFile} from "node:fs/promises";

const glue = await readFile("/tmp/flixer-img-data.js","utf8");
const translated = await readFile("/tmp/flixer-wasm-translation.mjs","utf8");
const importText = "import * as wbg from 'wbg';";
if(!translated.includes(importText)) throw new Error("Unsupported translated import structure");
const exportStart = translated.lastIndexOf("\nexport var memory = ");
if(exportStart<0) throw new Error("No translated export marker");
const nativeShim = translated.slice(0,exportStart).replace(importText,"var wbg = __wbg_get_imports().wbg;");
if(!glue.includes("function __wbg_get_imports()")) throw new Error("Missing glue import factory");
const assembled = glue + "\n// wasm2js translation starts here\n" + nativeShim +
 "\nwasm = retasmFunc;\n" +
 "\nexport const _local_asm_exports = Object.keys(retasmFunc);\n";
const file="/tmp/flixer-standalone.mjs";
await writeFile(file,assembled);
console.log("LOCAL_BUNDLE_CREATED",JSON.stringify({bytes:assembled.length,glueBytes:glue.length,wasm2jsBytes:translated.length,hasBareWbgImport:/import\s+\*\s+as\s+wbg/.test(assembled)}));
const env = globalThis;
const store={};
env.window=env;
env.self=env;
Object.defineProperty(env,"screen",{configurable:true,value:{width:1365,height:900,colorDepth:24}});
if(!env.navigator)Object.defineProperty(env,"navigator",{configurable:true,value:{}});
for(const [k,v] of Object.entries({userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",platform:"Win32",language:"en-US"})){
  try{Object.defineProperty(env.navigator,k,{configurable:true,value:v})}catch{}
}
env.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
env.document={
  getElementsByTagName:tag=>tag==="script"?[{src:"https://flixer.su/assets/js/index-52585954.js"}]:[],
  createElement:tag=>({
    tagName:tag.toUpperCase(),width:250,height:200,
    getContext:()=>({font:"12px sans-serif",textBaseline:"top",fillText:()=>{}}),
    toDataURL:()=>"data:image/png;base64,"+"AAAA".repeat(50),
    setAttribute:()=>{},getAttribute:()=>null
  })
};
try{
 const local=await import("file:///tmp/flixer-standalone.mjs");
 console.log("LOCAL_BUNDLE_IMPORT_PASS",JSON.stringify({exports:Object.keys(local).slice(0,12),wasmExports:local._local_asm_exports.slice(0,15)}));
 try{
  const v=await local.get_img_key();
  console.log("LOCAL_GET_IMG_KEY_RESULT",JSON.stringify({type:typeof v,length:typeof v==="string"?v.length:-1,keyLooksValid:typeof v==="string"&&v.length===64}));
 }catch(e){ console.log("LOCAL_GET_IMG_KEY_ERROR",String(e).slice(0,600)); }
}catch(e){
 console.error("LOCAL_BUNDLE_IMPORT_FAILED",String(e),e?.stack?.slice(0,1200));
 process.exitCode=1;
}
